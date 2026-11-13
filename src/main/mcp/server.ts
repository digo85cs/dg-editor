// Servidor MCP do DG Editor.
// Expoe o vault (.dg-editor), o dossie e o historico do chat como tools
// consumiveis por qualquer cliente MCP (Claude Desktop, Cursor, Maestro).

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { promises as fs } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, relative, resolve } from 'node:path'
import { z } from 'zod'

const execFileAsync = promisify(execFile)
import { gravarDossie, lerDossie, dossieSnapshot } from '../dossie'
import { projectStateDir, resolverRaizProjeto, caminhoDentroDaRaiz } from '../paths'
import { loadChat } from '../chatstore'
import { buscarSimbolos, lerSimbolo } from '../brain/indice'
import { editarPorAncora } from '../brain/editar'
import { garantirSkillsPadrao, listarSkills, lerSkill } from '../brain/skills'
import { garantirAgentesPadrao, listarAgentes, invocarAgente } from '../brain/agentes'
import {
  executarAgente,
  profundidadeExecucaoAgente
} from '../brain/agent'
import { chamarControle } from './navegador-client'
import { executeOllamaTool, OLLAMA_TOOL_DEFINITIONS } from './ollama-tools'

function raizAtual(): string {
  const env = process.env.DG_ROOT
  if (env && env.trim()) return resolve(env.trim())
  return resolverRaizProjeto()
}

let RAIZ = raizAtual()
let VAULT = projectStateDir(RAIZ)
garantirSkillsPadrao(RAIZ)
garantirAgentesPadrao(RAIZ)

function syncRaiz(): string {
  const r = raizAtual()
  if (r !== RAIZ) {
    RAIZ = r
    VAULT = projectStateDir(RAIZ)
    garantirSkillsPadrao(RAIZ)
    garantirAgentesPadrao(RAIZ)
  }
  return RAIZ
}

function dentroDoVault(p: string): boolean {
  const abs = resolve(p)
  const rel = relative(VAULT, abs)
  return !rel.startsWith('..') && !rel.includes('..')
}

const TOOLS = [
  ...OLLAMA_TOOL_DEFINITIONS,
  {
    name: 'dossie_read',
    description: 'Le o dossie atual do DG Editor (.dg-editor/dossie.txt)',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'dossie_write',
    description: 'Grava o dossie a partir do historico do chat (substitui, nunca anexa)',
    inputSchema: {
      type: 'object',
      properties: {
        root: { type: 'string', description: 'Raiz do projeto' },
        resumo: { type: 'string', description: 'Resumo do estado atual' },
        proximaAcao: { type: 'string', description: 'Proxima acao planejada' }
      },
      required: ['root']
    }
  },
  {
    name: 'dossie_snapshot',
    description: 'Snapshot estruturado do dossie (root, atualizadoEm, totalMensagens, provedor, resumo)',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'vault_list',
    description: 'Lista arquivos do vault (.dg-editor), opcionalmente filtrando por subpasta',
    inputSchema: {
      type: 'object',
      properties: { subpasta: { type: 'string', description: 'Subpasta opcional, ex: backup' } },
      required: []
    }
  },
  {
    name: 'vault_read',
    description: 'Le o conteudo de um arquivo do vault (path relativo ao .dg-editor)',
    inputSchema: {
      type: 'object',
      properties: { caminho: { type: 'string' } },
      required: ['caminho']
    }
  },
  {
    name: 'vault_write',
    description: 'Escreve um arquivo no vault (path relativo ao .dg-editor). Recusa sair do vault.',
    inputSchema: {
      type: 'object',
      properties: {
        caminho: { type: 'string' },
        conteudo: { type: 'string' },
        sobrescrever: { type: 'boolean' }
      },
      required: ['caminho', 'conteudo']
    }
  },
  {
    name: 'projeto_arvore',
    description: 'Arvore de arquivos do projeto (respeita .gitignore basico: node_modules, out, .git)',
    inputSchema: {
      type: 'object',
      properties: {
        maxProfundidade: { type: 'number' },
        filtro: { type: 'string', description: 'Substring no nome do arquivo' }
      },
      required: []
    }
  },
  {
    name: 'codigo_buscar',
    description: 'Busca simbolos no indice de codigo (funcao/classe/tipo). Aceita sinonimos (pick->escolher, get->ler).',
    inputSchema: {
      type: 'object',
      properties: {
        termo: { type: 'string', description: 'Substring ou sinonimo do nome do simbolo' },
        tipo: {
          type: 'string',
          description: 'funcao | classe | tipo | todos',
          enum: ['funcao', 'classe', 'tipo', 'todos']
        }
      },
      required: ['termo']
    }
  },
  {
    name: 'codigo_ler',
    description: 'Le simbolo pelo nome OU arquivo pelo caminho relativo (ex: src/main/brain/providers.ts).',
    inputSchema: {
      type: 'object',
      properties: {
        nome: {
          type: 'string',
          description: 'Nome do simbolo (escolherModelo) OU caminho relativo (src/main/brain/providers.ts)'
        }
      },
      required: ['nome']
    }
  },
  {
    name: 'codigo_editar',
    description: 'Substitui uma ancora unica num arquivo. Se verificar=true (default), roda tsc e reverte se falhar.',
    inputSchema: {
      type: 'object',
      properties: {
        arquivo: { type: 'string', description: 'Caminho relativo a raiz do projeto' },
        ancora: { type: 'string', description: 'Trecho existente que deve aparecer exatamente 1 vez' },
        novo: { type: 'string', description: 'Texto que substitui a ancora' },
        verificar: { type: 'boolean', description: 'Rodar typecheck apos editar (default true)' }
      },
      required: ['arquivo', 'ancora', 'novo']
    }
  },
  {
    name: 'conector_listar',
    description: 'Lista conectores do DG Editor (editor, Ollama, MCP, Cursor, Codex) e o estado de cada um',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'skill_listar',
    description: 'Lista skills locais em .dg-editor/skills',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'skill_ler',
    description: 'Le uma skill pelo id (nome do arquivo sem .md)',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    }
  },
  {
    name: 'agente_listar',
    description: 'Lista agentes especializados em .dg-editor/agentes',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'agente_invocar',
    description: 'Invoca um agente especializado com contexto e pedido',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        contexto: { type: 'string' },
        pedido: { type: 'string' }
      },
      required: ['id', 'pedido']
    }
  },
  {
    name: 'agente_executar',
    description: 'Executa o pipeline completo do agente com tools, skills e fallback de provider',
    inputSchema: {
      type: 'object',
      properties: {
        mensagem: { type: 'string', description: 'Pedido em linguagem natural' },
        agente: { type: 'string', description: "Id do agente (padrao 'revisor')" },
        tarefa: {
          type: 'string',
          description: "chat | codigo | raciocinio (padrao 'codigo')",
          enum: ['chat', 'codigo', 'raciocinio']
        }
      },
      required: ['mensagem']
    }
  },
  {
    name: 'qoder_executar',
    description: 'Executa o agente Qoder com fallback automatico para proximo agente se travar/demorar',
    inputSchema: {
      type: 'object',
      properties: {
        mensagem: { type: 'string', description: 'Pedido em linguagem natural' },
        tarefa: {
          type: 'string',
          description: "chat | codigo | plano | debug (padrao 'codigo')",
          enum: ['chat', 'codigo', 'plano', 'debug']
        }
      },
      required: ['mensagem']
    }
  },
  {
    name: 'trae_executar',
    description: 'Executa o agente Trae com fallback automatico para proximo agente se travar/demorar',
    inputSchema: {
      type: 'object',
      properties: {
        mensagem: { type: 'string', description: 'Pedido em linguagem natural' },
        tarefa: {
          type: 'string',
          description: "chat | codigo | plano | debug (padrao 'codigo')",
          enum: ['chat', 'codigo', 'plano', 'debug']
        }
      },
      required: ['mensagem']
    }
  },
  {
    name: 'navegador_abrir',
    description:
      'Abre/navega URL no navegador embutido (persist:dgnav). Opcional: esperarSeletor para SPAs.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL absoluta (https://...)' },
        esperarSeletor: { type: 'string', description: 'CSS a aguardar apos load' },
        esperarTimeoutMs: { type: 'number', description: 'Timeout ms (default 10000)' }
      },
      required: ['url']
    }
  },
  {
    name: 'navegador_ler',
    description:
      'Le conteudo (texto|tabela|links|html). Paginação offset/limit. Opcional: esperarSeletor, frame (indice ou URL parcial de iframe).',
    inputSchema: {
      type: 'object',
      properties: {
        modo: { type: 'string', enum: ['texto', 'tabela', 'links', 'html'] },
        seletor: { type: 'string', description: 'CSS opcional para escopo' },
        offset: { type: 'number', description: 'Inicio (chars em texto/html; linhas em tabela)' },
        limit: { type: 'number', description: 'Tamanho da pagina (texto default 50000; tabela default 500)' },
        esperarSeletor: { type: 'string' },
        esperarTimeoutMs: { type: 'number' },
        aguardarEstavel: {
          type: 'number',
          description: 'Ms de silencio DOM (MutationObserver) apos esperarSeletor; 0=desligado'
        },
        frame: {
          description: 'Indice do iframe ou substring da URL do frame',
          oneOf: [{ type: 'number' }, { type: 'string' }]
        }
      },
      required: []
    }
  },
  {
    name: 'navegador_clicar',
    description: 'Clica elemento por seletor CSS ou texto. Opcional: frame, esperarSeletor.',
    inputSchema: {
      type: 'object',
      properties: {
        seletor: { type: 'string' },
        texto: { type: 'string' },
        frame: { oneOf: [{ type: 'number' }, { type: 'string' }] },
        esperarSeletor: { type: 'string' },
        esperarTimeoutMs: { type: 'number' }
      },
      required: []
    }
  },
  {
    name: 'navegador_preencher',
    description: 'Preenche input/textarea (compatível com React/Vue controlados).',
    inputSchema: {
      type: 'object',
      properties: {
        seletor: { type: 'string' },
        valor: { type: 'string' }
      },
      required: ['seletor', 'valor']
    }
  },
  {
    name: 'navegador_baixar',
    description: 'Baixa arquivo (url ou seletor com href/src) para .dg-editor/downloads/.',
    inputSchema: {
      type: 'object',
      properties: {
        seletor: { type: 'string' },
        url: { type: 'string' }
      },
      required: []
    }
  },
  {
    name: 'terminal_exec',
    description:
      'Executa comando local na raiz do projeto (timeout 20s). Leitura livre; destrutivo exige confirmado=true. Para achar projeto no disco (AutoPartz etc.) prefira disco_buscar — nao varra C:\\Windows.',
    inputSchema: {
      type: 'object',
      properties: {
        comando: { type: 'string', description: 'Binario (ex: git, npm, node)' },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Argumentos (sem shell)'
        },
        confirmado: {
          type: 'boolean',
          description: 'Obrigatorio true para install/rm/push --force/reset'
        }
      },
      required: ['comando']
    }
  },
  {
    name: 'disco_buscar',
    description:
      'Busca pastas de projeto no disco (dev, xampp, OneDrive/CURSOR, D:) SEM varrer C:\\Windows. Use para inventarios (AutoPartz/AUTO PARTS). Retorna caminhos absolutos.',
    inputSchema: {
      type: 'object',
      properties: {
        padrao: {
          type: 'string',
          description: 'Regex ou nome (ex: partz|autopartz|AUTO PARTS)'
        },
        profundidade: { type: 'number', description: '1-4 (padrao 3)' }
      },
      required: ['padrao']
    }
  },
  {
    name: 'disco_inspecionar',
    description:
      'Inspeciona um caminho de projeto: public/index.php, app/routes.php, config, vendor, composer.json, .env, .git.',
    inputSchema: {
      type: 'object',
      properties: {
        caminho: { type: 'string', description: 'Caminho absoluto do projeto' }
      },
      required: ['caminho']
    }
  },
  {
    name: 'ftp_deploy',
    description: 'Publica pasta/arquivos via FTP usando um site salvo no DG Editor (deploy:ftp-*).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Id do site FTP salvo' },
        localPath: { type: 'string' },
        remotePath: { type: 'string' },
        arquivos: { type: 'array', items: { type: 'string' } }
      },
      required: ['id']
    }
  },
  {
    name: 'ftp_listar',
    description: 'Lista sites FTP configurados (sem senhas).',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'git_status',
    description: 'Status git do workspace (branch + porcelain). Preferivel a terminal_exec git status.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'git_diff',
    description: 'Diff git do workspace ou de um caminho relativo.',
    inputSchema: {
      type: 'object',
      properties: { caminho: { type: 'string', description: 'Arquivo/pasta relativa (opcional)' } },
      required: []
    }
  },
  {
    name: 'testes_rodar',
    description: 'Roda o script de teste detectado (npm test / validar-melhorias). Retorna resumo.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'qualidade_checar',
    description: 'Checagens leves de qualidade (encoding/sintaxe) no projeto.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'projeto_smoke',
    description: 'Smoke rapido: package.json + git + qualidade.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'resultado_avaliar',
    description: 'Avalia se a resposta final atende o pedido (checklist de qualidade antes de entregar).',
    inputSchema: {
      type: 'object',
      properties: {
        pedido: { type: 'string' },
        textoFinal: { type: 'string' },
        passosResumo: { type: 'string' }
      },
      required: ['pedido', 'textoFinal']
    }
  },
  {
    name: 'automacao_listar',
    description:
      'Lista comandos da allowlist de automacao DG (Office COM, Windows, browser). Browser: preferir navegador_* (Bloco 3).',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'automacao_executar',
    description:
      'Executa comando allowlist (ex.: excel.abrir, windows.sistema.info). Browser: use navegador_abrir (Bloco 3). CSV/texto: preferir Editor.',
    inputSchema: {
      type: 'object',
      properties: {
        comandoId: { type: 'string', description: 'Id allowlist (excel.abrir, word.abrir, ...)' },
        args: { type: 'object', description: 'Argumentos do comando' }
      },
      required: ['comandoId']
    }
  },
  {
    name: 'midia_status',
    description:
      'Status das ferramentas gratuitas do Estudio de midia (ffmpeg, ffprobe, python, faster-whisper, edge-tts, ComfyUI local).',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'portabilidade_status',
    description:
      'Diagnostico para PC novo: ferramentas embutidas (ffmpeg, ffprobe, Python, edge-tts, faster-whisper), modelos Ollama e o que falta instalar. Ferramentas embutidas nao dependem do PC.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'agentes_externos_status',
    description:
      'Verifica os agentes externos gratuitos integrados: QCoder (qwen2.5-coder local + qc-cli), OpenDevin/OpenHands (WSL) e Trae Agent. Retorna o que esta pronto e como instalar o resto.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'provisionamento_status',
    description:
      'Mostra o estado das ferramentas portateis provisionadas automaticamente (ffmpeg/ffprobe mais recente, Python portatil 3.12 e pacotes de voz/transcricao) e se a plataforma deste PC e compativel.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'provisionamento_atualizar',
    description:
      'Baixa/atualiza automaticamente as ferramentas portateis gratuitas compatíveis com este PC (ffmpeg do build mais recente, Python portatil se faltar, pacotes pip). Grava em %LOCALAPPDATA%\\dg-editor\\ferramentas.',
    inputSchema: {
      type: 'object',
      properties: {
        forcar: { type: 'boolean', description: 'Reinstala mesmo se ja estiver atualizado' },
        componentes: {
          type: 'array',
          items: { type: 'string', enum: ['ffmpeg', 'python', 'pacotes'] },
          description: 'Limita a atualizacao a estes componentes'
        }
      },
      required: []
    }
  },
  {
    name: 'midia_imagem_gerar',
    description:
      'Gera imagem gratuita via Pollinations (sem chave; 1 imagem a cada ~45s por IP). Para ilimitado use ComfyUI local.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Descricao da imagem' },
        largura: { type: 'number', description: 'Largura 64-1536 (padrao 1024)' },
        altura: { type: 'number', description: 'Altura 64-1536 (padrao 1024)' },
        seed: { type: 'number' },
        saida: { type: 'string', description: 'Arquivo/pasta de saida (relativo ao projeto)' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'midia_diagrama',
    description: 'Gera diagrama Mermaid em PNG/SVG via mermaid.ink (gratuito).',
    inputSchema: {
      type: 'object',
      properties: {
        codigo: { type: 'string', description: 'Codigo Mermaid (ex.: flowchart LR ...)' },
        formato: { type: 'string', enum: ['png', 'svg'] },
        tema: { type: 'string', enum: ['light', 'dark'] },
        saida: { type: 'string' }
      },
      required: ['codigo']
    }
  },
  {
    name: 'midia_imagem_melhorar',
    description: 'Aumenta resolucao e nitidez de uma imagem local via ffmpeg (gratuito).',
    inputSchema: {
      type: 'object',
      properties: {
        entrada: { type: 'string', description: 'Imagem relativa ao projeto' },
        fator: { type: 'number', description: 'Escala 1-4 (padrao 2)' },
        nitidez: { type: 'number', description: '0-2 (padrao 0.8)' },
        formato: { type: 'string', enum: ['png', 'jpg'] },
        saida: { type: 'string' }
      },
      required: ['entrada']
    }
  },
  {
    name: 'midia_comfyui_status',
    description:
      'Verifica o ComfyUI local (CPU) e lista checkpoints/modos instalados. Use antes de gerar imagem ou video ilimitados gratuitos.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'midia_comfyui_imagem',
    description:
      'Gera uma imagem ilimitada e gratuita no ComfyUI local (SD 1.5 + LCM, CPU), iniciando o servidor se preciso. Salva em .dg-editor/midia. Pode levar de 30s a 2 min.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        largura: { type: 'number', description: '256-1024, multiplo de 64 (padrao 512)' },
        altura: { type: 'number', description: '256-1024, multiplo de 64 (padrao 512)' },
        passos: { type: 'number', description: 'Padrao 6 com LCM' },
        seed: { type: 'number' },
        saida: { type: 'string' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'midia_comfyui_video',
    description:
      'Gera um video curto ilimitado e gratuito no ComfyUI local (AnimateDiff, CPU), iniciando o servidor se preciso. Pode levar varios minutos; prefira 8-16 quadros em 512x512.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        largura: { type: 'number', description: 'Padrao 512' },
        altura: { type: 'number', description: 'Padrao 512' },
        quadros: { type: 'number', description: '8-32 (padrao 16)' },
        fps: { type: 'number', description: '4-16 (padrao 8)' },
        passos: { type: 'number', description: 'Padrao 6' },
        seed: { type: 'number' },
        saida: { type: 'string' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'midia_vozes_listar',
    description:
      'Lista as vozes naturais pt-BR disponiveis (mulheres, homens, meninas e meninos) com id, motor e disponibilidade. Chame antes de narrar quando o usuario nao escolheu a voz.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'midia_fotos_video',
    description:
      'Monta um video MP4 a partir de fotos (slideshow ffmpeg) com narracao natural opcional. A voz vem de midia_vozes_listar (ex.: st:f1, infantil:bia). Gratuito e local.',
    inputSchema: {
      type: 'object',
      properties: {
        imagens: { type: 'array', items: { type: 'string' }, description: 'Fotos relativas ao projeto' },
        segundosPorFoto: { type: 'number' },
        largura: { type: 'number' },
        altura: { type: 'number' },
        narracao: { type: 'string', description: 'Texto narrado (opcional)' },
        voz: { type: 'string', description: 'Id da voz (ex.: st:f1, kokoro:dora, infantil:bia). Omitir usa a voz padrao do usuario.' },
        saida: { type: 'string' }
      },
      required: ['imagens']
    }
  },
  {
    name: 'midia_video_cortar',
    description: 'Corta um trecho de video com ffmpeg. Tempos aceitam 12, 1:30 ou 00:01:30.',
    inputSchema: {
      type: 'object',
      properties: {
        entrada: { type: 'string' },
        inicio: { type: 'string' },
        fim: { type: 'string' },
        saida: { type: 'string' }
      },
      required: ['entrada', 'inicio', 'fim']
    }
  },
  {
    name: 'midia_video_juntar',
    description: 'Junta dois ou mais videos MP4 (mesma resolucao/codec) com ffmpeg.',
    inputSchema: {
      type: 'object',
      properties: {
        videos: { type: 'array', items: { type: 'string' } },
        saida: { type: 'string' }
      },
      required: ['videos']
    }
  },
  {
    name: 'midia_video_capa',
    description: 'Extrai um frame (thumbnail) de um video em JPG via ffmpeg.',
    inputSchema: {
      type: 'object',
      properties: {
        entrada: { type: 'string' },
        tempo: { type: 'string', description: 'Tempo do frame (padrao 1s)' },
        largura: { type: 'number' },
        saida: { type: 'string' }
      },
      required: ['entrada']
    }
  },
  {
    name: 'midia_video_qualidade',
    description:
      'Qualidade de video via ffmpeg: analise (analisar=true) ou re-render com estabilizacao (2 passadas), denoise, nitidez, brilho/contraste/saturacao/gamma, escala Lanczos, fps, CRF/preset e normalizacao de audio.',
    inputSchema: {
      type: 'object',
      properties: {
        entrada: { type: 'string' },
        analisar: { type: 'boolean' },
        estabilizar: { type: 'boolean' },
        denoise: { type: 'number', description: '0 a 1' },
        nitidez: { type: 'number', description: '0 a 2' },
        brilho: { type: 'number', description: '-100 a 100 (%)' },
        contraste: { type: 'number', description: '-100 a 100 (%)' },
        saturacao: { type: 'number', description: '0 a 200 (%)' },
        gamma: { type: 'number', description: '0.1 a 10' },
        escala: { type: 'number', description: '1 a 2' },
        fps: { type: 'number', description: '0 mantem; 24/30/60' },
        crf: { type: 'number', description: '0 a 51 (menor = melhor)' },
        preset: { type: 'string', enum: ['rapido', 'equilibrado', 'qualidade'] },
        normalizarAudio: { type: 'boolean' },
        saida: { type: 'string' }
      },
      required: ['entrada']
    }
  },
  {
    name: 'midia_imagem_qualidade',
    description:
      'Ajustes de imagem via ffmpeg: denoise, nitidez, brilho/contraste/saturacao/gamma, escala Lanczos, formato e qualidade JPG.',
    inputSchema: {
      type: 'object',
      properties: {
        entrada: { type: 'string' },
        denoise: { type: 'number' },
        nitidez: { type: 'number' },
        brilho: { type: 'number' },
        contraste: { type: 'number' },
        saturacao: { type: 'number' },
        gamma: { type: 'number' },
        escala: { type: 'number', description: '1 a 4' },
        formato: { type: 'string', enum: ['png', 'jpg'] },
        qualidade: { type: 'number', description: '2 a 31 (menor = melhor)' },
        saida: { type: 'string' }
      },
      required: ['entrada']
    }
  },
  {
    name: 'midia_transcrever',
    description: 'Transcreve audio/video localmente com faster-whisper (CPU) e grava .srt. Retorna o texto.',
    inputSchema: {
      type: 'object',
      properties: {
        entrada: { type: 'string' },
        idioma: { type: 'string', description: 'auto, pt, en, ...' },
        modelo: { type: 'string', enum: ['tiny', 'base', 'small', 'medium'] },
        saida: { type: 'string' }
      },
      required: ['entrada']
    }
  },
  {
    name: 'midia_narrar',
    description:
      'Gera narracao MP3 com voz natural pt-BR. Antes, liste as vozes com midia_vozes_listar e pergunte qual o usuario quer (mulher/homem/menina/menino). Sem voz informada usa a voz padrao do usuario.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string' },
        voz: { type: 'string', description: 'Id da voz (ex.: st:f1, kokoro:dora, piper:cadu, infantil:bia, edge:francisca)' },
        taxa: { type: 'string', description: 'Ritmo: -10% a +10%' },
        saida: { type: 'string' }
      },
      required: ['texto']
    }
  },
  {
    name: 'midia_legendas',
    description: 'Grava um arquivo .srt permanentemente no video com ffmpeg.',
    inputSchema: {
      type: 'object',
      properties: {
        video: { type: 'string' },
        srt: { type: 'string' },
        saida: { type: 'string' }
      },
      required: ['video', 'srt']
    }
  },
  {
    name: 'midia_memes_listar',
    description:
      'Lista o banco local de templates de meme (Imgflip, gratuito, sem chave). Use filtro para procurar por nome. Se ainda nao sincronizou, sincronize antes.',
    inputSchema: {
      type: 'object',
      properties: {
        filtro: { type: 'string', description: 'Trecho do nome do template' },
        sincronizar: { type: 'boolean', description: 'Sincroniza o manifesto antes de listar' }
      },
      required: []
    }
  },
  {
    name: 'midia_meme_gerar',
    description:
      'Gera um meme PNG com legendas de cima/baixo usando um template do banco local (ffmpeg + Impact). Gratuito e offline depois do template baixado.',
    inputSchema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: 'Id ou nome exato do template (ver midia_memes_listar)' },
        topo: { type: 'string' },
        baixo: { type: 'string' },
        saida: { type: 'string' }
      },
      required: ['template']
    }
  },
  {
    name: 'midia_memes_sincronizar',
    description: 'Atualiza o manifesto de templates de meme a partir do Imgflip (gratuito, sem chave).',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'midia_foto_video',
    description:
      'Gera um video curto e ESTILIZADO a partir de UMA foto local (AnimateDiff no ComfyUI CPU). Nao e deepfake fotorrealista: rosto/pessoa vem estilizado. Exige consentimento=true (foto propria ou pessoa autorizada) e o MP4 sai com a marca visivel "gerado por IA".',
    inputSchema: {
      type: 'object',
      properties: {
        entrada: { type: 'string', description: 'Foto PNG/JPG/WEBP relativa ao projeto' },
        prompt: { type: 'string', description: 'Estilo/movimento desejado' },
        movimento: { type: 'number', description: '0.3-0.8 (padrao do hardware)' },
        largura: { type: 'number', description: '256-768, multiplo de 64' },
        altura: { type: 'number', description: '256-768, multiplo de 64' },
        quadros: { type: 'number', description: '8-32 (padrao do hardware)' },
        fps: { type: 'number', description: '4-16' },
        passos: { type: 'number' },
        seed: { type: 'number' },
        consentimento: { type: 'boolean', description: 'Obrigatorio: true confirma direito de uso da imagem' },
        saida: { type: 'string' }
      },
      required: ['entrada', 'consentimento']
    }
  },
  {
    name: 'midia_hardware',
    description:
      'Perfil de hardware do PC (CPU/GPU/RAM), ajustes automaticos do ComfyUI e status da instalacao local. Use antes de prometer qualidade/tempo de geracao.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'midia_atualizacoes',
    description:
      'Verifica atualizacoes do ComfyUI, no AnimateDiff, banco de memes e modelos de voz. Com aplicar=true executa o que for seguro (nao atualiza codigo com o ComfyUI rodando).',
    inputSchema: {
      type: 'object',
      properties: {
        aplicar: { type: 'boolean' },
        componentes: {
          type: 'array',
          items: { type: 'string', enum: ['comfyui', 'animatediff', 'memes', 'vozes'] }
        },
        rede: { type: 'boolean', description: 'false usa apenas estado local' }
      },
      required: []
    }
  },
  {
    name: 'midia_comfy_instalar',
    description:
      'Instala ou atualiza o ComfyUI portatil fora do repositorio (git + venv + PyTorch CPU/CUDA + modelos opcionais). Idempotente; pode demorar bastante e baixa GBs quando modelos sao pedidos.',
    inputSchema: {
      type: 'object',
      properties: {
        modelos: { type: 'string', enum: ['nenhum', 'imagem', 'completo'], description: 'Padrao nenhum' },
        video: { type: 'boolean', description: 'Inclui AnimateDiff (modelo + no customizado)' }
      },
      required: []
    }
  },
  {
    name: 'midia_musicas',
    description:
      'Lista o banco local de musicas livres (pasta do usuario). Use antes de mixar para saber os nomes disponiveis.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'midia_musica_mixar',
    description:
      'Mixa uma musica do banco local como trilha de fundo de um video do projeto (volume baixo, video copiado sem reencode).',
    inputSchema: {
      type: 'object',
      properties: {
        video: { type: 'string', description: 'Video relativo ao projeto' },
        musica: { type: 'string', description: 'Nome do arquivo retornado por midia_musicas' },
        volume: { type: 'number', description: '0 a 1 (padrao 0.18)' },
        saida: { type: 'string' }
      },
      required: ['video', 'musica']
    }
  },
  {
    name: 'midia_linha_tempo',
    description:
      'Editor de video/audio embutido (linha do tempo): concatena imagens/videos/audios com recorte, volume e fades, aplica fade global e musica de fundo e exporta MP4. Use analisar=true para validar duracoes sem gravar e onda=<arquivo> para gerar a forma de onda em PNG.',
    inputSchema: {
      type: 'object',
      properties: {
        itens: {
          type: 'array',
          description: 'Clipes na ordem. Imagens usam duracao/fim como segundos; videos/audios usam inicio/fim.',
          items: {
            type: 'object',
            properties: {
              arquivo: { type: 'string', description: 'Arquivo relativo ao projeto' },
              inicio: { type: 'number' },
              fim: { type: 'number' },
              duracao: { type: 'number' },
              volume: { type: 'number', description: '0 a 2 (padrao 1)' },
              fadeIn: { type: 'number' },
              fadeOut: { type: 'number' },
              mudo: { type: 'boolean' }
            },
            required: ['arquivo']
          }
        },
        audioFundo: { type: 'string', description: 'Nome no banco de musicas ou arquivo relativo ao projeto' },
        volumeFundo: { type: 'number', description: '0 a 1 (padrao 0.2)' },
        largura: { type: 'number' },
        altura: { type: 'number' },
        fps: { type: 'number' },
        fadeEntrada: { type: 'number' },
        fadeSaida: { type: 'number' },
        saida: { type: 'string' },
        analisar: { type: 'boolean', description: 'So valida e mede a linha do tempo' },
        onda: { type: 'string', description: 'Gera a forma de onda (PNG) deste audio/video' }
      },
      required: []
    }
  },
  {
    name: 'midia_musicas_livres',
    description:
      'Catalogo de musicas livres por estilo (Kevin MacLeod/incompetech, CC BY 4.0) com estado de download. Use para escolher trilha por clima.',
    inputSchema: {
      type: 'object',
      properties: {
        estilo: { type: 'string', description: 'Filtra por estilo (alegre, epica, tensa, calma, misterio, infantil, jazz, eletronica, triste, corporativo)' }
      },
      required: []
    }
  },
  {
    name: 'midia_musica_baixar',
    description:
      'Baixa faixas livres do catalogo para o banco local (por estilo ou ids), grava os creditos CC BY 4.0 e devolve os caminhos.',
    inputSchema: {
      type: 'object',
      properties: {
        estilo: { type: 'string' },
        ids: { type: 'array', items: { type: 'string' } },
        sobrescrever: { type: 'boolean' }
      },
      required: []
    }
  },
  {
    name: 'midia_audio',
    description:
      'Analisa ou processa audio local via ffmpeg: normalizacao EBU R128, equalizacao (graves/agudos), compressao, fade, volume, corte e conversao (mp3/wav/m4a/ogg).',
    inputSchema: {
      type: 'object',
      properties: {
        entrada: { type: 'string', description: 'Audio relativo ao projeto' },
        analisar: { type: 'boolean', description: 'So mede duracao e volume (nao grava)' },
        normalizar: { type: 'boolean' },
        ganhoDb: { type: 'number', description: '-30 a 30' },
        gravesDb: { type: 'number', description: '-20 a 20' },
        agudosDb: { type: 'number', description: '-20 a 20' },
        compressao: { type: 'number', description: 'Razao 1 a 20' },
        fadeInSeg: { type: 'number' },
        fadeOutSeg: { type: 'number' },
        inicio: { type: 'string', description: '12, 1:30 ou 00:01:30' },
        fim: { type: 'string' },
        formato: { type: 'string', enum: ['mp3', 'wav', 'm4a', 'ogg'] },
        saida: { type: 'string' }
      },
      required: ['entrada']
    }
  },
  {
    name: 'apps_status',
    description:
      'Status do construtor Apps: SDK Android, Java, projeto mobile, APK/instalador gerados e arquivos publicados em OneDrive/APP.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'apps_build',
    description:
      'Gera o APK Android (DG Apps) e/ou o instalador Windows e publica uma copia em OneDrive/APP. Instala o SDK Android na primeira vez. Pode demorar varios minutos.',
    inputSchema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['apk', 'win', 'tudo'], description: 'Padrao tudo' }
      },
      required: []
    }
  },
  {
    name: 'apps_setup',
    description:
      'Instala/verifica o toolchain Android (cmdline-tools, platform-tools, platform 35 e build-tools 35) sem Android Studio.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  }
]

const server = new Server(
  { name: 'dg-editor-vault', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (req: { params: { name: string; arguments?: unknown } }, extra) => {
  const { name, arguments: args = {} } = req.params
  syncRaiz()

  try {
    if (name === 'ollama_ask' || name === 'ollama_script') {
      const result = await executeOllamaTool(name, args, RAIZ, { signal: extra.signal })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    }

    if (name === 'dossie_read') {
      const txt = await lerDossie()
      return { content: [{ type: 'text', text: txt || '(dossie vazio)' }] }
    }

    if (name === 'dossie_write') {
      const parsed = z.object({
        root: z.string(),
        resumo: z.string().optional(),
        proximaAcao: z.string().optional()
      }).parse(args)
      const destino = await gravarDossie(loadChat(parsed.root), {
        root: parsed.root,
        resumo: parsed.resumo,
        proximaAcao: parsed.proximaAcao
      })
      return { content: [{ type: 'text', text: 'dossie gravado em ' + destino }] }
    }

    if (name === 'dossie_snapshot') {
      const snap = await dossieSnapshot()
      // root sempre reflete a raiz real do servidor (DG_ROOT ou cwd), nao dado historico do arquivo
      const resposta = { ...(snap || {}), root: RAIZ }
      return { content: [{ type: 'text', text: JSON.stringify(resposta, null, 2) }] }
    }

    if (name === 'vault_list') {
      const sub = (args as { subpasta?: string }).subpasta
      const base = sub ? join(VAULT, sub) : VAULT
      if (!dentroDoVault(base)) throw new Error('caminho fora do vault')
      const entradas = await fs.readdir(base, { withFileTypes: true })
      const linhas = entradas.map((e) => (e.isDirectory() ? '[D] ' : '[F] ') + e.name)
      return { content: [{ type: 'text', text: linhas.join('\n') || '(vazio)' }] }
    }

    if (name === 'vault_read') {
      const p = (args as { caminho: string }).caminho
      const abs = join(VAULT, p)
      if (!dentroDoVault(abs)) throw new Error('caminho fora do vault')
      const txt = await fs.readFile(abs, 'utf8')
      return { content: [{ type: 'text', text: txt }] }
    }

    if (name === 'vault_write') {
      const { caminho, conteudo, sobrescrever } = args as { caminho: string; conteudo: string; sobrescrever?: boolean }
      const abs = join(VAULT, caminho)
      if (!dentroDoVault(abs)) throw new Error('caminho fora do vault')
      if (!sobrescrever) {
        try { await fs.access(abs); throw new Error('arquivo existe; use sobrescrever: true') } catch (e) {
          if ((e as Error).message.includes('sobrescrever')) throw e
        }
      }
      await fs.mkdir(join(abs, '..'), { recursive: true })
      await fs.writeFile(abs, conteudo, 'utf8')
      return { content: [{ type: 'text', text: 'escrito ' + caminho }] }
    }

    if (name === 'projeto_arvore') {
      const { maxProfundidade = 3, filtro } = args as { maxProfundidade?: number; filtro?: string }
      const ignorar = new Set(['node_modules', 'out', '.git', 'dist', '.dg-editor'])
      const linhas: string[] = []
      async function walk(dir: string, nivel: number) {
        if (nivel > maxProfundidade) return
        const ents = await fs.readdir(dir, { withFileTypes: true })
        for (const e of ents) {
          if (ignorar.has(e.name)) continue
          if (filtro && !e.name.toLowerCase().includes(filtro.toLowerCase())) {
            if (e.isDirectory()) await walk(join(dir, e.name), nivel + 1)
            continue
          }
          linhas.push('  '.repeat(nivel) + (e.isDirectory() ? '/' : '') + e.name)
          if (e.isDirectory()) await walk(join(dir, e.name), nivel + 1)
        }
      }
      await walk(RAIZ, 0)
      return { content: [{ type: 'text', text: linhas.join('\n') || '(vazio)' }] }
    }

    if (name === 'codigo_buscar') {
      const parsed = z.object({
        termo: z.string(),
        tipo: z.enum(['funcao', 'classe', 'tipo', 'todos']).optional()
      }).parse(args)
      const hits = buscarSimbolos(RAIZ, parsed.termo, parsed.tipo || 'todos')
      return { content: [{ type: 'text', text: JSON.stringify(hits, null, 2) }] }
    }

    if (name === 'codigo_ler') {
      const parsed = z.object({ nome: z.string() }).parse(args)
      const hit = lerSimbolo(RAIZ, parsed.nome)
      if (!hit) {
        return { content: [{ type: 'text', text: 'simbolo nao encontrado: ' + parsed.nome }], isError: true }
      }
      return { content: [{ type: 'text', text: JSON.stringify(hit, null, 2) }] }
    }

    if (name === 'codigo_editar') {
      const parsed = z.object({
        arquivo: z.string(),
        ancora: z.string(),
        novo: z.string(),
        verificar: z.boolean().optional()
      }).parse(args)
      const { rel } = caminhoDentroDaRaiz(RAIZ, parsed.arquivo)
      const res = editarPorAncora(
        RAIZ,
        rel,
        parsed.ancora,
        parsed.novo,
        parsed.verificar !== false
      )
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
        isError: !res.ok
      }
    }

    if (name === 'conector_listar') {
      const { listarConectores } = await import('../conectores-status')
      const lista = await listarConectores()
      return { content: [{ type: 'text', text: JSON.stringify(lista, null, 2) }] }
    }

    if (name === 'skill_listar') {
      const lista = listarSkills(RAIZ).map((s) => ({ id: s.id, titulo: s.titulo, gatilho: s.gatilho }))
      return { content: [{ type: 'text', text: JSON.stringify(lista, null, 2) }] }
    }

    if (name === 'skill_ler') {
      const parsed = z.object({ id: z.string() }).parse(args)
      const s = lerSkill(RAIZ, parsed.id)
      if (!s) return { content: [{ type: 'text', text: 'skill nao encontrada' }], isError: true }
      return { content: [{ type: 'text', text: JSON.stringify(s, null, 2) }] }
    }

    if (name === 'agente_listar') {
      const lista = listarAgentes(RAIZ).map((a) => ({ id: a.id, nome: a.nome, especialidade: a.especialidade }))
      return { content: [{ type: 'text', text: JSON.stringify(lista, null, 2) }] }
    }

    if (name === 'agente_invocar') {
      const parsed = z.object({
        id: z.string(),
        contexto: z.string().optional(),
        pedido: z.string()
      }).parse(args)
      const r = await invocarAgente(RAIZ, parsed.id, parsed.contexto || '', parsed.pedido)
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], isError: !r.ok }
    }

    if (name === 'agente_executar') {
      if (profundidadeExecucaoAgente() > 0) {
        const err = {
          ok: false,
          erro: 'Recursao bloqueada: agente_executar nao pode ser chamado de dentro de executarAgente'
        }
        return { content: [{ type: 'text', text: JSON.stringify(err) }], isError: true }
      }
      const parsed = z.object({
        mensagem: z.string(),
        agente: z.string().optional(),
        tarefa: z.enum(['chat', 'codigo', 'raciocinio', 'revisao']).optional()
      }).parse(args)

      const TIMEOUT_MS = 600_000
      const trabalho = executarAgente(RAIZ, parsed.mensagem, {
        agente: parsed.agente || 'revisor',
        tarefa: parsed.tarefa || 'codigo'
      })
      const timeout = new Promise<never>((_, rej) => {
        setTimeout(() => rej(new Error('agente_executar timeout apos 600s')), TIMEOUT_MS)
      })

      try {
        const r = await Promise.race([trabalho, timeout])
        const out = {
          ok: true,
          texto: r.texto,
          modeloUsado: r.modelo,
          tentativas: r.tentativas || [],
          duracaoMs: r.duracaoMs ?? 0
        }
        return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] }
      } catch (e) {
        const msg = (e as Error).message || String(e)
        const out = {
          ok: false,
          texto: '',
          modeloUsado: '',
          tentativas: [],
          duracaoMs: 0,
          erro: msg
        }
        return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError: true }
      }
    }

    if (name === 'qoder_executar' || name === 'trae_executar') {
      const agenteId = name === 'qoder_executar' ? 'qoder' : 'trae'
      const parsed = z.object({
        mensagem: z.string(),
        tarefa: z.enum(['chat', 'codigo', 'plano', 'debug']).optional()
      }).parse(args)

      const { orquestrarAgentes } = await import('../agent/orquestrador')
      const { listarAgentes } = await import('../brain/agentes')

      const todos = listarAgentes(RAIZ).map((a) => a.id)
      const fila = [agenteId, ...todos.filter((id) => id !== agenteId)]

      const orc = await orquestrarAgentes(RAIZ, parsed.mensagem, fila, undefined, {
        pararNoPrimeiroSucesso: true,
        tarefa: parsed.tarefa || 'codigo'
      })

      const ultimo = orc.passos[orc.passos.length - 1]
      const out = {
        ok: !!orc.textoFinal || orc.passos.some((p) => p.ok),
        agenteUsado: ultimo?.agente || agenteId,
        texto: orc.textoFinal || (ultimo?.texto || ''),
        passos: orc.passos.map((p) => ({
          agente: p.agente,
          ok: p.ok,
          erro: p.erro,
          duracaoMs: p.duracaoMs
        })),
        modeloUsado: orc.passos.map((p) => p.modelo).filter(Boolean).pop(),
        duracaoMsTotal: orc.passos.reduce((acc, p) => acc + (p.duracaoMs || 0), 0)
      }
      return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError: !out.ok }
    }

    if (name === 'navegador_abrir') {
      const parsed = z
        .object({
          url: z.string().min(1),
          esperarSeletor: z.string().optional(),
          esperarTimeoutMs: z.number().optional()
        })
        .parse(args)
      const r = await chamarControle('POST', '/abrir', parsed)
      const err = r.status === 0 || r.status >= 400 || r.json.erro || r.json.ok === false
      return {
        content: [{ type: 'text', text: JSON.stringify(r.json, null, 2) }],
        isError: !!err
      }
    }

    if (name === 'navegador_ler') {
      const parsed = z
        .object({
          modo: z.enum(['texto', 'tabela', 'links', 'html']).optional(),
          seletor: z.string().optional(),
          offset: z.number().optional(),
          limit: z.number().optional(),
          esperarSeletor: z.string().optional(),
          esperarTimeoutMs: z.number().optional(),
          aguardarEstavel: z.number().optional(),
          frame: z.union([z.number(), z.string()]).optional()
        })
        .parse(args)
      const r = await chamarControle('POST', '/ler', {
        modo: parsed.modo || 'texto',
        seletor: parsed.seletor,
        offset: parsed.offset,
        limit: parsed.limit,
        esperarSeletor: parsed.esperarSeletor,
        esperarTimeoutMs: parsed.esperarTimeoutMs,
        aguardarEstavel: parsed.aguardarEstavel,
        frame: parsed.frame
      })
      const err = r.status === 0 || r.status >= 400 || r.json.erro || r.json.ok === false
      return {
        content: [{ type: 'text', text: JSON.stringify(r.json, null, 2) }],
        isError: !!err
      }
    }

    if (name === 'navegador_clicar') {
      const parsed = z
        .object({
          seletor: z.string().optional(),
          texto: z.string().optional(),
          frame: z.union([z.number(), z.string()]).optional(),
          esperarSeletor: z.string().optional(),
          esperarTimeoutMs: z.number().optional()
        })
        .parse(args)
      if (!parsed.seletor && !parsed.texto) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ erro: 'informe seletor ou texto' }) }],
          isError: true
        }
      }
      const r = await chamarControle('POST', '/clicar', parsed)
      const err = r.status === 0 || r.status >= 400 || r.json.erro || r.json.ok === false
      return {
        content: [{ type: 'text', text: JSON.stringify(r.json, null, 2) }],
        isError: !!err
      }
    }

    if (name === 'navegador_preencher') {
      const parsed = z.object({ seletor: z.string(), valor: z.string() }).parse(args)
      const r = await chamarControle('POST', '/preencher', parsed)
      const err = r.status === 0 || r.status >= 400 || r.json.erro || r.json.ok === false
      return {
        content: [{ type: 'text', text: JSON.stringify(r.json, null, 2) }],
        isError: !!err
      }
    }

    if (name === 'navegador_baixar') {
      const parsed = z
        .object({ seletor: z.string().optional(), url: z.string().optional() })
        .parse(args)
      if (!parsed.seletor && !parsed.url) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ erro: 'informe seletor ou url' }) }],
          isError: true
        }
      }
      const r = await chamarControle('POST', '/baixar', parsed)
      const err = r.status === 0 || r.status >= 400 || r.json.erro || r.json.ok === false
      return {
        content: [{ type: 'text', text: JSON.stringify(r.json, null, 2) }],
        isError: !!err
      }
    }

    if (name === 'terminal_exec') {
      const parsed = z
        .object({
          comando: z.string().min(1).max(80),
          args: z.array(z.string().max(400)).max(40).optional(),
          confirmado: z.boolean().optional()
        })
        .parse(args)
      const cmd = parsed.comando.trim()
      const argv = parsed.args || []
      const linha = (cmd + ' ' + argv.join(' ')).toLowerCase()
      const destrutivo =
        /\b(rm|del|rmdir|unlink|format|shutdown|reboot)\b/.test(linha) ||
        /\b(install|uninstall|remove)\b/.test(linha) ||
        /push\s+--force|--force\s+push|reset\s+--hard|clean\s+-fdx/.test(linha)
      if (destrutivo && !parsed.confirmado) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: false,
              erro: 'comando destrutivo — peça confirmação ao usuário e chame de novo com confirmado=true',
              comando: cmd,
              args: argv
            })
          }],
          isError: true
        }
      }
      if (!/^[a-zA-Z0-9._+-]+$/.test(cmd)) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: false, erro: 'comando invalido' }) }],
          isError: true
        }
      }
      try {
        const { stdout, stderr } = await execFileAsync(cmd, argv, {
          cwd: RAIZ,
          timeout: 20000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
          shell: false,
          encoding: 'utf8'
        })
        const texto = (String(stdout || '') + (stderr ? '\n' + String(stderr) : '')).slice(0, 12000)
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, texto }, null, 2) }]
        }
      } catch (e: unknown) {
        const err = e as { message?: string; stdout?: string; stderr?: string }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: false,
              erro: String(err.stderr || err.message || e).slice(0, 800),
              stdout: String(err.stdout || '').slice(0, 4000)
            })
          }],
          isError: true
        }
      }
    }

    if (name === 'disco_buscar') {
      const parsed = z
        .object({
          padrao: z.string().min(1).max(120),
          profundidade: z.number().min(1).max(4).optional()
        })
        .parse(args)
      const { buscarPastasProjeto } = await import('../disco-inventario')
      const r = buscarPastasProjeto(parsed.padrao, { profundidade: parsed.profundidade })
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ok: true,
                pastas: r.pastas,
                raizes: r.raizes,
                aviso:
                  r.pastas.length === 0
                    ? 'NÃO ENCONTRADO nas raizes uteis (dev/xampp/OneDrive/D:). Nao use Autopilot/WinSxS.'
                    : 'Ignore qualquer caminho sob C:\\Windows.'
              },
              null,
              2
            )
          }
        ]
      }
    }

    if (name === 'disco_inspecionar') {
      const parsed = z.object({ caminho: z.string().min(1).max(500) }).parse(args)
      const { inspecionarProjeto } = await import('../disco-inventario')
      const r = inspecionarProjeto(parsed.caminho)
      return {
        content: [{ type: 'text', text: JSON.stringify(r, null, 2) }],
        isError: !r.existe
      }
    }

    if (name === 'ftp_listar') {
      const { listarFtpSites } = await import('../deploy/ftp')
      return { content: [{ type: 'text', text: JSON.stringify(listarFtpSites(), null, 2) }] }
    }

    if (name === 'ftp_deploy') {
      const parsed = z
        .object({
          id: z.string().min(1),
          localPath: z.string().optional(),
          remotePath: z.string().optional(),
          arquivos: z.array(z.string()).optional()
        })
        .parse(args)
      const { deployFtp } = await import('../deploy/ftp')
      const r = await deployFtp(parsed)
      return {
        content: [{ type: 'text', text: JSON.stringify(r, null, 2) }],
        isError: !r.ok
      }
    }

    if (name === 'git_status') {
      const auto = await import('../autonomia-tools')
      const r = await auto.gitStatus(RAIZ)
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], isError: !r.ok }
    }
    if (name === 'git_diff') {
      const parsed = z.object({ caminho: z.string().optional() }).parse(args)
      const auto = await import('../autonomia-tools')
      const r = await auto.gitDiff(RAIZ, parsed.caminho)
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] }
    }
    if (name === 'testes_rodar') {
      const auto = await import('../autonomia-tools')
      const r = await auto.testesRodar(RAIZ)
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], isError: !r.ok }
    }
    if (name === 'qualidade_checar') {
      const auto = await import('../autonomia-tools')
      const r = await auto.qualidadeChecar(RAIZ)
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], isError: !r.ok }
    }
    if (name === 'projeto_smoke') {
      const auto = await import('../autonomia-tools')
      const r = await auto.projetoSmoke(RAIZ)
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], isError: !r.ok }
    }
    if (name === 'resultado_avaliar') {
      const parsed = z
        .object({
          pedido: z.string(),
          textoFinal: z.string(),
          passosResumo: z.string().optional()
        })
        .parse(args)
      const auto = await import('../autonomia-tools')
      const r = auto.resultadoAvaliar(parsed.pedido, parsed.textoFinal, parsed.passosResumo || '')
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], isError: !r.ok }
    }

    if (name === 'automacao_listar') {
      const { listarComandos } = await import('../automation/allowlist')
      const cmds = listarComandos().map((c) => ({
        id: c.id,
        dominio: c.dominio,
        descricao: c.descricao,
        risco: c.risco
      }))
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ok: true,
                preferir: 'Editor / Navegador Bloco 3 / Terminal',
                comandos: cmds
              },
              null,
              2
            )
          }
        ]
      }
    }

    if (name === 'automacao_executar') {
      const parsed = z
        .object({
          comandoId: z.string().min(1),
          args: z.record(z.string(), z.unknown()).optional()
        })
        .parse(args)
      if (parsed.comandoId.startsWith('browser.')) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: false,
                preferiu: 'bloco3',
                erro:
                  'Use a tool navegador_abrir / navegador_ler (Bloco 3). CDP externo so via UI automation:executar com args.externo=true.'
              })
            }
          ],
          isError: true
        }
      }
      const { obterComando } = await import('../automation/allowlist')
      const { executarComandoDominio } = await import('../automation/dispatch')
      const cmd = obterComando(parsed.comandoId)
      if (!cmd) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: false, erro: 'comando nao autorizado' }) }],
          isError: true
        }
      }
      const r = await executarComandoDominio(cmd, parsed.args || {}, { origem: 'mcp' })
      return {
        content: [{ type: 'text', text: JSON.stringify(r, null, 2) }],
        isError: !r.ok
      }
    }

    if (name.startsWith('midia_')) {
      const midia = await import('../midia/core')
      const responder = async (r: { ok: boolean; erro?: string; [k: string]: unknown }) => ({
        content: [{ type: 'text' as const, text: JSON.stringify(r, null, 2) }],
        isError: !r.ok
      })
      const caminho = (v: string): string => {
        const abs = resolve(RAIZ, v)
        caminhoDentroDaRaiz(RAIZ, abs)
        return abs
      }

      if (name === 'midia_status') return await responder(await midia.statusMidia(RAIZ))
      if (name === 'portabilidade_status') {
        const s = await midia.statusMidia(RAIZ)
        let ollama: { ok: boolean; modelos: string[]; erro?: string } = { ok: false, modelos: [] }
        try {
          const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(2500) })
          if (res.ok) {
            const j = (await res.json()) as { models?: { name?: string }[] }
            ollama = { ok: true, modelos: (j.models || []).map((m) => String(m.name || '')).filter(Boolean) }
          } else {
            ollama.erro = 'HTTP ' + res.status
          }
        } catch (e) {
          ollama.erro = e instanceof Error ? e.message : String(e)
        }
        const obrigatorios = [s.ferramentas.ffmpeg, s.ferramentas.ffprobe]
        return await responder({
          ok: s.ok && obrigatorios.every((f) => f.ok),
          ferramentas: s.ferramentas,
          ollama,
          aviso: 'ffmpeg/ffprobe e Python portatil vao embutidos no instalador; Ollama e SDK Android sao opcionais.'
        })
      }

      if (name === 'agentes_externos_status') {
        const ext = await import('../brain/agentesExternos')
        return await responder(await ext.statusAgentesExternos())
      }

      if (name === 'provisionamento_status') {
        const prov = await import('../provisionamento')
        return await responder(await prov.statusProvisionamento())
      }

      if (name === 'provisionamento_atualizar') {
        const prov = await import('../provisionamento')
        const a = (args || {}) as { forcar?: unknown; componentes?: unknown }
        const comps = Array.isArray(a.componentes)
          ? a.componentes.filter((c: unknown): c is 'ffmpeg' | 'python' | 'pacotes' => c === 'ffmpeg' || c === 'python' || c === 'pacotes')
          : undefined
        return await responder(await prov.provisionar({ forcar: a.forcar === true, componentes: comps }))
      }

      if (name === 'midia_comfyui_status') {
        const comfy = await import('../midia/comfyui')
        return await responder(await comfy.statusComfy())
      }

      if (name === 'midia_comfyui_imagem') {
        const p = z
          .object({
            prompt: z.string().min(1),
            largura: z.number().optional(),
            altura: z.number().optional(),
            passos: z.number().optional(),
            seed: z.number().optional(),
            saida: z.string().optional()
          })
          .parse(args)
        const comfy = await import('../midia/comfyui')
        return await responder(await comfy.gerarImagemComfy(RAIZ, p))
      }

      if (name === 'midia_comfyui_video') {
        const p = z
          .object({
            prompt: z.string().min(1),
            largura: z.number().optional(),
            altura: z.number().optional(),
            quadros: z.number().optional(),
            fps: z.number().optional(),
            passos: z.number().optional(),
            seed: z.number().optional(),
            saida: z.string().optional()
          })
          .parse(args)
        const comfy = await import('../midia/comfyui')
        return await responder(await comfy.gerarVideoComfy(RAIZ, p))
      }

      if (name === 'midia_vozes_listar') {
        const vozes = await import('../midia/vozes')
        const lista = await vozes.listarVozes()
        return await responder({
          ok: true,
          padrao: vozes.lerPreferencias().vozPadrao,
          categorias: vozes.CATEGORIAS,
          vozes: lista.map((v) => ({
            id: v.id,
            nome: v.rotulo,
            categoria: v.categoria,
            motor: v.motor,
            descricao: v.descricao,
            infantil_derivada: !!v.derivada,
            internet: !!v.internet,
            disponivel: v.disponivel,
            motivo: v.motivo
          }))
        })
      }

      if (name === 'midia_memes_listar') {
        const p = z.object({ filtro: z.string().optional(), sincronizar: z.boolean().optional() }).parse(args)
        const memes = await import('../midia/memes')
        if (p.sincronizar || !memes.lerManifesto()) await memes.sincronizarMemes()
        return await responder({ ...memes.listarMemes(p.filtro), status: memes.statusMemes() })
      }

      if (name === 'midia_meme_gerar') {
        const p = z
          .object({
            template: z.string().min(1),
            topo: z.string().optional(),
            baixo: z.string().optional(),
            saida: z.string().optional()
          })
          .parse(args)
        const memes = await import('../midia/memes')
        return await responder(await memes.gerarMeme(RAIZ, p))
      }

      if (name === 'midia_memes_sincronizar') {
        const memes = await import('../midia/memes')
        return await responder(await memes.sincronizarMemes({ forcar: true }))
      }

      if (name === 'midia_foto_video') {
        const p = z
          .object({
            entrada: z.string().min(1),
            prompt: z.string().optional(),
            movimento: z.number().optional(),
            largura: z.number().optional(),
            altura: z.number().optional(),
            quadros: z.number().optional(),
            fps: z.number().optional(),
            passos: z.number().optional(),
            seed: z.number().optional(),
            consentimento: z.boolean(),
            saida: z.string().optional()
          })
          .parse(args)
        const abs = caminho(p.entrada)
        const comfy = await import('../midia/comfyui')
        return await responder(await comfy.gerarFotoVideoComfy(RAIZ, { ...p, entrada: abs }))
      }

      if (name === 'midia_hardware') {
        const hw = await import('../midia/hardware')
        const inst = await import('../midia/comfyui-install')
        return await responder({
          ok: true,
          hardware: await hw.detectarHardware(true),
          comfy: inst.statusInstalacao(),
          espacoLivreGb: inst.espacoLivreGb()
        })
      }

      if (name === 'midia_atualizacoes') {
        const p = z
          .object({
            aplicar: z.boolean().optional(),
            componentes: z.array(z.enum(['comfyui', 'animatediff', 'memes', 'vozes'])).optional(),
            rede: z.boolean().optional()
          })
          .parse(args)
        const at = await import('../midia/atualizacoes')
        if (p.aplicar) return await responder(await at.aplicarAtualizacoes({ componentes: p.componentes }))
        return await responder(await at.verificarAtualizacoes({ rede: p.rede !== false }))
      }

      if (name === 'midia_comfy_instalar') {
        const p = z
          .object({ modelos: z.enum(['nenhum', 'imagem', 'completo']).optional(), video: z.boolean().optional() })
          .parse(args)
        const inst = await import('../midia/comfyui-install')
        return await responder(
          await inst.instalarComfy({
            modelos: p.modelos || 'nenhum',
            video: p.video === true,
            cuda: false
          })
        )
      }

      if (name === 'midia_musicas') {
        const musicas = await import('../midia/musicas')
        return await responder(musicas.listarMusicas())
      }

      if (name === 'midia_musica_mixar') {
        const p = z
          .object({
            video: z.string().min(1),
            musica: z.string().min(1),
            volume: z.number().min(0).max(1).optional(),
            saida: z.string().optional()
          })
          .parse(args)
        const musicas = await import('../midia/musicas')
        const banco = musicas.listarMusicas()
        const faixa = banco.itens.find((m) => m.nome === p.musica)
        if (!faixa) return await responder({ ok: false, erro: 'musica nao encontrada no banco: ' + p.musica })
        return await responder(
          await musicas.mixarMusica(RAIZ, {
            video: caminho(p.video),
            musica: faixa.caminho,
            volume: p.volume,
            saida: p.saida
          })
        )
      }

      if (name === 'midia_linha_tempo') {
        const p = z
          .object({
            itens: z
              .array(
                z.object({
                  arquivo: z.string().min(1),
                  inicio: z.number().min(0).optional(),
                  fim: z.number().min(0).optional(),
                  duracao: z.number().min(0).optional(),
                  volume: z.number().min(0).max(2).optional(),
                  fadeIn: z.number().min(0).optional(),
                  fadeOut: z.number().min(0).optional(),
                  mudo: z.boolean().optional()
                })
              )
              .optional(),
            audioFundo: z.string().optional(),
            volumeFundo: z.number().min(0).max(1).optional(),
            largura: z.number().optional(),
            altura: z.number().optional(),
            fps: z.number().optional(),
            fadeEntrada: z.number().min(0).optional(),
            fadeSaida: z.number().min(0).optional(),
            saida: z.string().optional(),
            analisar: z.boolean().optional(),
            onda: z.string().optional()
          })
          .parse(args)
        const editor = await import('../midia/editor')
        if (p.onda) {
          return await responder(
            await editor.gerarOnda(RAIZ, { entrada: caminho(p.onda), largura: p.largura, altura: p.altura })
          )
        }
        const itens = (p.itens || []).map((i) => ({ ...i, arquivo: caminho(i.arquivo) }))
        if (p.analisar) return await responder(await editor.analisarLinhaTempo(itens))
        let musica: string | undefined
        if (p.audioFundo) {
          const musicas = await import('../midia/musicas')
          const faixa = musicas.listarMusicas().itens.find((m) => m.nome === p.audioFundo)
          musica = faixa ? faixa.caminho : caminho(p.audioFundo)
        }
        return await responder(
          await editor.exportarLinhaTempo(RAIZ, {
            itens,
            audioFundo: musica,
            volumeFundo: p.volumeFundo,
            largura: p.largura,
            altura: p.altura,
            fps: p.fps,
            fadeEntrada: p.fadeEntrada,
            fadeSaida: p.fadeSaida,
            saida: p.saida
          })
        )
      }

      if (name === 'midia_musicas_livres') {
        const p = z.object({ estilo: z.string().optional() }).parse(args)
        const livres = await import('../midia/musicas-livres')
        const cat = livres.catalogoLivres()
        const estilos = p.estilo ? cat.estilos.filter((e) => e.id === p.estilo) : cat.estilos
        return await responder({ ...cat, estilos })
      }

      if (name === 'midia_musica_baixar') {
        const p = z
          .object({
            estilo: z.string().optional(),
            ids: z.array(z.string()).optional(),
            sobrescrever: z.boolean().optional()
          })
          .parse(args)
        const livres = await import('../midia/musicas-livres')
        return await responder(
          await livres.baixarFaixas({ estilo: p.estilo, ids: p.ids, sobrescrever: p.sobrescrever })
        )
      }

      if (name === 'midia_audio') {
        const p = z
          .object({
            entrada: z.string().min(1),
            analisar: z.boolean().optional(),
            normalizar: z.boolean().optional(),
            ganhoDb: z.number().optional(),
            gravesDb: z.number().optional(),
            agudosDb: z.number().optional(),
            compressao: z.number().optional(),
            fadeInSeg: z.number().optional(),
            fadeOutSeg: z.number().optional(),
            inicio: z.string().optional(),
            fim: z.string().optional(),
            formato: z.enum(['mp3', 'wav', 'm4a', 'ogg']).optional(),
            saida: z.string().optional()
          })
          .parse(args)
        const audio = await import('../midia/audio')
        const entrada = caminho(p.entrada)
        if (p.analisar === true) {
          return await responder(await audio.analisarAudio(entrada))
        }
        return await responder(
          await audio.processarAudio(RAIZ, {
            entrada,
            normalizar: p.normalizar,
            ganhoDb: p.ganhoDb,
            gravesDb: p.gravesDb,
            agudosDb: p.agudosDb,
            compressao: p.compressao,
            fadeInSeg: p.fadeInSeg,
            fadeOutSeg: p.fadeOutSeg,
            inicio: p.inicio,
            fim: p.fim,
            formato: p.formato,
            saida: p.saida
          })
        )
      }

      if (name === 'midia_video_qualidade') {
        const p = z
          .object({
            entrada: z.string().min(1),
            analisar: z.boolean().optional(),
            estabilizar: z.boolean().optional(),
            denoise: z.number().optional(),
            nitidez: z.number().optional(),
            brilho: z.number().optional(),
            contraste: z.number().optional(),
            saturacao: z.number().optional(),
            gamma: z.number().optional(),
            escala: z.number().optional(),
            fps: z.number().optional(),
            crf: z.number().optional(),
            preset: z.enum(['rapido', 'equilibrado', 'qualidade']).optional(),
            normalizarAudio: z.boolean().optional(),
            saida: z.string().optional()
          })
          .parse(args)
        const q = await import('../midia/qualidade')
        const entrada = caminho(p.entrada)
        if (p.analisar === true) return await responder(await q.analisarVideo(entrada))
        return await responder(
          await q.processarVideo(RAIZ, {
            entrada,
            estabilizar: p.estabilizar,
            denoise: p.denoise,
            nitidez: p.nitidez,
            brilho: p.brilho,
            contraste: p.contraste,
            saturacao: p.saturacao,
            gamma: p.gamma,
            escala: p.escala,
            fps: p.fps,
            crf: p.crf,
            preset: p.preset,
            normalizarAudio: p.normalizarAudio,
            saida: p.saida
          })
        )
      }

      if (name === 'midia_imagem_qualidade') {
        const p = z
          .object({
            entrada: z.string().min(1),
            denoise: z.number().optional(),
            nitidez: z.number().optional(),
            brilho: z.number().optional(),
            contraste: z.number().optional(),
            saturacao: z.number().optional(),
            gamma: z.number().optional(),
            escala: z.number().optional(),
            formato: z.enum(['png', 'jpg']).optional(),
            qualidade: z.number().optional(),
            saida: z.string().optional()
          })
          .parse(args)
        const q = await import('../midia/qualidade')
        return await responder(
          await q.processarImagem(RAIZ, {
            entrada: caminho(p.entrada),
            denoise: p.denoise,
            nitidez: p.nitidez,
            brilho: p.brilho,
            contraste: p.contraste,
            saturacao: p.saturacao,
            gamma: p.gamma,
            escala: p.escala,
            formato: p.formato,
            qualidade: p.qualidade,
            saida: p.saida
          })
        )
      }

      if (name === 'apps_status') {
        const apps = await import('../apps')
        return await responder(apps.statusApps())
      }

      if (name === 'apps_setup') {
        const apps = await import('../apps')
        return await responder(await apps.instalarToolchainApps())
      }

      if (name === 'apps_build') {
        const p = z
          .object({ tipo: z.enum(['apk', 'win', 'tudo']).optional() })
          .parse(args)
        const apps = await import('../apps')
        return await responder(await apps.construirApps(p.tipo || 'tudo'))
      }

      if (name === 'midia_imagem_gerar') {
        const p = z
          .object({
            prompt: z.string().min(1),
            largura: z.number().optional(),
            altura: z.number().optional(),
            seed: z.number().optional(),
            saida: z.string().optional()
          })
          .parse(args)
        return await responder(
          await midia.gerarImagem(RAIZ, {
            prompt: p.prompt,
            largura: p.largura,
            altura: p.altura,
            seed: p.seed,
            saida: p.saida,
            esperarLimite: false
          })
        )
      }

      if (name === 'midia_diagrama') {
        const p = z
          .object({
            codigo: z.string().min(1),
            formato: z.enum(['png', 'svg']).optional(),
            tema: z.enum(['light', 'dark']).optional(),
            saida: z.string().optional()
          })
          .parse(args)
        return await responder(await midia.gerarDiagrama(RAIZ, p))
      }

      if (name === 'midia_imagem_melhorar') {
        const p = z
          .object({
            entrada: z.string().min(1),
            fator: z.number().optional(),
            nitidez: z.number().optional(),
            formato: z.enum(['png', 'jpg']).optional(),
            saida: z.string().optional()
          })
          .parse(args)
        return await responder(await midia.melhorarImagem(RAIZ, { ...p, entrada: caminho(p.entrada) }))
      }

      if (name === 'midia_fotos_video') {
        const p = z
          .object({
            imagens: z.array(z.string().min(1)).min(1),
            segundosPorFoto: z.number().optional(),
            largura: z.number().optional(),
            altura: z.number().optional(),
            narracao: z.string().optional(),
            voz: z.string().optional(),
            saida: z.string().optional()
          })
          .parse(args)
        return await responder(
          await midia.fotosParaVideo(RAIZ, { ...p, imagens: p.imagens.map(caminho) })
        )
      }

      if (name === 'midia_video_cortar') {
        const p = z
          .object({
            entrada: z.string().min(1),
            inicio: z.string().min(1),
            fim: z.string().min(1),
            saida: z.string().optional()
          })
          .parse(args)
        return await responder(await midia.cortarVideo(RAIZ, { ...p, entrada: caminho(p.entrada) }))
      }

      if (name === 'midia_video_juntar') {
        const p = z
          .object({ videos: z.array(z.string().min(1)).min(2), saida: z.string().optional() })
          .parse(args)
        return await responder(
          await midia.juntarVideos(RAIZ, { ...p, videos: p.videos.map(caminho) })
        )
      }

      if (name === 'midia_video_capa') {
        const p = z
          .object({
            entrada: z.string().min(1),
            tempo: z.string().optional(),
            largura: z.number().optional(),
            saida: z.string().optional()
          })
          .parse(args)
        return await responder(await midia.extrairCapa(RAIZ, { ...p, entrada: caminho(p.entrada) }))
      }

      if (name === 'midia_transcrever') {
        const p = z
          .object({
            entrada: z.string().min(1),
            idioma: z.string().optional(),
            modelo: z.enum(['tiny', 'base', 'small', 'medium']).optional(),
            saida: z.string().optional()
          })
          .parse(args)
        return await responder(await midia.transcrever(RAIZ, { ...p, entrada: caminho(p.entrada) }))
      }

      if (name === 'midia_narrar') {
        const p = z
          .object({
            texto: z.string().min(1),
            voz: z.string().optional(),
            taxa: z.string().optional(),
            saida: z.string().optional()
          })
          .parse(args)
        return await responder(await midia.narrar(RAIZ, p))
      }

      if (name === 'midia_legendas') {
        const p = z
          .object({ video: z.string().min(1), srt: z.string().min(1), saida: z.string().optional() })
          .parse(args)
        return await responder(
          await midia.queimarLegendas(RAIZ, { ...p, video: caminho(p.video), srt: caminho(p.srt) })
        )
      }
    }

    throw new Error('tool desconhecida: ' + name)
  } catch (e) {
    return { content: [{ type: 'text', text: 'ERRO: ' + (e as Error).message }], isError: true }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[mcp-dg-editor] servidor ativo no stdio')
}

main().catch((e) => {
  console.error('[mcp-dg-editor] falhou:', e)
  process.exit(1)
})
