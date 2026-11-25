/**
 * Servidor MCP HTTP do DG Editor.
 * Requer DG_MCP_TOKEN. Escuta em 127.0.0.1:7331.
 * Gate por ALLOWED_TOOLS; a implementacao das tools e a MESMA do stdio
 * (./dispatch), exceto as ferramentas locais HTTP-only.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { promises as fs, existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { lerDossie, dossieSnapshot } from '../dossie'
import { resolverRaizProjeto } from '../paths'
import { loadChat } from '../chatstore'
import { buscarSimbolos, lerSimbolo } from '../brain/indice'
import { gitStatus, gitDiff, gitCommit, gitPush, qualidadeChecar, resultadoAvaliar, terminalExec, codigoEditar, testesRodar, projetoSmoke, lerMemoriaProjeto, gravarMemoriaProjeto } from '../autonomia-tools'
import { listarSkills } from '../brain/skills'
import { listarAgentes } from '../brain/agentes'
import { gerarImagemAuto } from '../midia/cascata'
import { gerarVideoAuto } from '../midia/video-auto'
import { pdfOperar, planilhaOperar } from '../midia/arquivos-doc'
import { narrar } from '../midia/core'
import { gerarMeme, sincronizarMemes } from '../midia/memes'
import { chamarControle } from './navegador-client'
import { resumoUso, custoDiaUsd, limiteCustoDia } from '../midia/guarda-custo'
import { TOOLS as TOOLS_MCP, executarToolCall, raizMcp, vaultMcp, definirProvedorRaiz } from './dispatch'

const TOKEN = process.env.DG_MCP_TOKEN

// Raiz do HTTP: acompanha o projeto ativo do app. O app grava
// %APPDATA%\DG Editor\workspace.json -> pastaAtual a cada troca de
// projeto; sem arquivo valido, cai no DG_ROOT do boot (comportamento
// anterior). Lido a cada chamada via syncRaiz do dispatch.
function raizHttp(): string {
  try {
    const appData = process.env.APPDATA
    const p = appData ? join(appData, 'DG Editor', 'workspace.json') : ''
    if (p && existsSync(p)) {
      const j = JSON.parse(readFileSync(p, 'utf8')) as { pastaAtual?: string | null }
      const pasta = typeof j.pastaAtual === 'string' ? j.pastaAtual.trim() : ''
      if (pasta && existsSync(pasta)) return resolve(pasta)
    }
  } catch { /* segue para o fallback */ }
  const env = process.env.DG_ROOT
  if (env && env.trim()) return resolve(env.trim())
  return resolverRaizProjeto()
}

definirProvedorRaiz(raizHttp)

if (!TOKEN) {
  console.error('DG_MCP_TOKEN ausente')
  process.exit(1)
}

const server = new Server(
  { name: 'dg-editor-mcp-http', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

// Gate de exposicao: ferramentas visiveis via HTTP. As 36 originais +
// grupos liberados na Rodada 5. O que nao esta aqui responde
// "ferramenta nao exposta neste servidor".
const ALLOWED_TOOLS = new Set([
  // --- originais (36) ---
  'dossie_read', 'dossie_snapshot', 'vault_list', 'vault_read',
  'projeto_arvore', 'codigo_buscar', 'codigo_ler', 'codigo_editar',
  'git_status', 'git_diff', 'git_commit', 'git_push', 'terminal_exec', 'testes_rodar', 'projeto_smoke',
  'qualidade_checar', 'resultado_avaliar', 'custo_resumo', 'projeto_memoria', 'vault_write',
  'skills_listar', 'agentes_listar', 'chat_historico', 'midia_imagem_auto', 'midia_video_auto',
  'doc_pdf', 'doc_planilha', 'midia_narrar', 'midia_meme_gerar', 'midia_memes_listar',
  'navegador_status', 'navegador_abrir', 'navegador_ler', 'navegador_clicar',
  'navegador_preencher', 'navegador_baixar',
  // --- GRUPO 1: leitura pura ---
  'agente_listar', 'agentes_externos_status', 'conector_listar',
  'disco_buscar', 'disco_inspecionar', 'skill_ler', 'skill_listar',
  'midia_status', 'midia_custo', 'midia_atualizacoes',
  'portabilidade_status', 'provisionamento_status', 'apps_status',
  'midia_comfyui_status', 'reversa_status', 'midia_vozes_listar',
  'midia_musicas', 'midia_musicas_livres', 'notas_mapa_mental',
  'tela_gravacoes', 'dossie_write',
  // --- GRUPO 2: execucao local ---
  'ollama_ask', 'ollama_script', 'automacao_listar', 'automacao_executar',
  'midia_diagrama', 'midia_documento_converter', 'midia_legendas',
  'midia_linha_tempo', 'midia_audio', 'midia_video_cortar', 'midia_video_efeito',
  'midia_video_juntar', 'midia_video_capa', 'midia_voz_efeito',
  'midia_foto_video', 'midia_fotos_video', 'midia_estoque',
  'midia_imagem_qualidade', 'midia_video_qualidade', 'midia_imagem_melhorar',
  'midia_transcrever', 'imagens_iso', 'receber_lan',
  // --- GRUPO 3: provedor externo pago (com guarda de custo diaria) ---
  'midia_imagem_cf', 'midia_imagem_editar_gemini', 'midia_imagem_gemini',
  'midia_imagem_gerar', 'midia_imagem_getimg', 'midia_imagem_hf',
  'midia_imagem_horde', 'midia_imagem_openai', 'midia_imagem_segmind',
  'midia_video_gemini', 'midia_video_json2video', 'midia_tts_openai',
  'midia_planilha', 'midia_pdf'
])

// Ferramentas que chamam provedor pago: bloqueadas quando o teto diario estoura.
const GRUPO3_PAGOS = new Set([
  'midia_imagem_cf', 'midia_imagem_editar_gemini', 'midia_imagem_gemini',
  'midia_imagem_gerar', 'midia_imagem_getimg', 'midia_imagem_hf',
  'midia_imagem_horde', 'midia_imagem_openai', 'midia_imagem_segmind',
  'midia_video_gemini', 'midia_video_json2video', 'midia_tts_openai',
  'midia_planilha', 'midia_pdf'
])

function logCall(toolName: string, args: unknown, raiz: string): void {
  const ts = new Date().toISOString()
  const argsSummary = JSON.stringify(args).slice(0, 200)
  console.error(`[${ts}] mcp:http tool=${toolName} raiz=${raiz} args=${argsSummary}`)
}

function dentroDoVault(p: string): boolean {
  const abs = resolve(p)
  const rel = relative(vaultMcp(), abs)
  return !rel.startsWith('..') && !rel.includes('..')
}

const NOMES_PROTEGIDOS = [
  '.env',
  '.pem', '.key', '.pfx', '.p12', '.keystore', '.jks',
  'id_rsa', 'id_ed25519',
  '.netrc', '.npmrc', '.git-credentials',
  'mcp-config.json', 'dg-config.json', 'nav-token'
]
const PALAVRAS_PROTEGIDAS = ['credencial', 'credentials', 'secret']

function nomeProtegido(nomeBase: string): boolean {
  const n = nomeBase.toLowerCase()
  for (const p of NOMES_PROTEGIDOS) {
    if (n === p || n.startsWith(p)) return true
  }
  for (const w of PALAVRAS_PROTEGIDAS) {
    if (n.includes(w)) return true
  }
  return false
}

function caminhoEhProtegido(caminho: string): boolean {
  // Verifica cada segmento do caminho (normalizado), para pegar
  // ".dg-editor/.env", "config/.env", "./.env" etc. e nao apenas o nome base.
  const segmentos = caminho.split(/[/\\]/).filter(Boolean)
  for (const seg of segmentos) {
    if (nomeProtegido(seg)) return true
  }
  return false
}

// Guarda HTTP: varre os argumentos recursivamente e devolve o primeiro
// valor com cara de caminho que aponte para arquivo protegido.
// "Com cara de caminho" = token unico (sem espaco) OU contem separador
// de caminho — prompts textuais com espacos nao sao tratados como path.
function pareceCaminho(v: string): boolean {
  return !/\s/.test(v) || /[/\\]/.test(v)
}

function primeiroCaminhoProtegido(valor: unknown): string | null {
  if (typeof valor === 'string') {
    return pareceCaminho(valor) && caminhoEhProtegido(valor) ? valor : null
  }
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const achou = primeiroCaminhoProtegido(item)
      if (achou) return achou
    }
    return null
  }
  if (valor && typeof valor === 'object') {
    for (const v of Object.values(valor as Record<string, unknown>)) {
      const achou = primeiroCaminhoProtegido(v)
      if (achou) return achou
    }
  }
  return null
}

const TOOLS = [
  {
    name: 'dossie_read',
    description: 'Le o dossie atual do DG Editor (.dg-editor/dossie.txt)',
    inputSchema: { type: 'object', properties: {}, required: [] }
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
    inputSchema: { type: 'object', properties: { caminho: { type: 'string' } }, required: ['caminho'] }
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
    description: 'Busca simbolos no indice de codigo (funcao/classe/tipo). Aceita sinonimos.',
    inputSchema: {
      type: 'object',
      properties: {
        termo: { type: 'string', description: 'Substring ou sinonimo do nome do simbolo' },
        tipo: { type: 'string', description: 'funcao | classe | tipo | todos', enum: ['funcao', 'classe', 'tipo', 'todos'] }
      },
      required: ['termo']
    }
  },
  {
    name: 'codigo_ler',
    description: 'Le simbolo pelo nome OU arquivo pelo caminho relativo.',
    inputSchema: { type: 'object', properties: { nome: { type: 'string', description: 'Nome do simbolo OU caminho relativo' } }, required: ['nome'] }
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
    name: 'terminal_exec',
    description: 'Executa comando local na raiz do projeto (timeout 20s). Leitura livre; destrutivo exige confirmado=true.',
    inputSchema: {
      type: 'object',
      properties: {
        comando: { type: 'string', description: 'Binario (ex: git, npm, node)' },
        args: { type: 'array', items: { type: 'string' }, description: 'Argumentos (sem shell)' },
        confirmado: { type: 'boolean', description: 'Obrigatorio true para install/rm/push --force/reset' }
      },
      required: ['comando']
    }
  },
  {
    name: 'git_commit',
    description: 'Commit de todas as alteracoes (git add -A + commit). Exige confirmado=true.',
    inputSchema: {
      type: 'object',
      properties: {
        mensagem: { type: 'string', description: 'Mensagem do commit (1-500 chars)' },
        confirmado: { type: 'boolean', description: 'Obrigatorio true para commitar' }
      },
      required: ['mensagem']
    }
  },
  {
    name: 'git_push',
    description: 'Push da branch atual para origin. Exige confirmado=true.',
    inputSchema: {
      type: 'object',
      properties: { confirmado: { type: 'boolean', description: 'Obrigatorio true para publicar' } },
      required: []
    }
  },
  {
    name: 'testes_rodar',
    description: 'Roda a suite de testes do projeto (detecta script npm test ou validar). Timeout 120s.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'projeto_smoke',
    description: 'Smoke rapido do projeto: package.json, git e qualidade.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'git_status',
    description: 'Status git do workspace (branch + porcelain).',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'git_diff',
    description: 'Diff git do workspace ou de um caminho relativo.',
    inputSchema: { type: 'object', properties: { caminho: { type: 'string', description: 'Arquivo/pasta relativa (opcional)' } }, required: [] }
  },
  {
    name: 'qualidade_checar',
    description: 'Checagens leves de qualidade (encoding/sintaxe) no projeto.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'skills_listar',
    description: 'Lista skills do projeto (.dg-editor/skills) com id, titulo e gatilho.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'agentes_listar',
    description: 'Lista agentes definidos no projeto (.dg-editor/agentes) validados.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'chat_historico',
    description: 'Historico recente do chat do projeto (ultimas N mensagens, conteudo truncado).',
    inputSchema: {
      type: 'object',
      properties: { limite: { type: 'number', description: 'Max mensagens (default 20, max 50)' } },
      required: []
    }
  },
  {
    name: 'midia_imagem_auto',
    description: 'Gera imagem via cascata gratis-primeiro (Gemini free -> Pollinations -> Horde -> HF -> CF -> ComfyUI; OpenAI pago so com incluirPago=true).',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        largura: { type: 'number' },
        altura: { type: 'number' },
        seed: { type: 'number' },
        saida: { type: 'string', description: 'Nome do arquivo de saida (opcional)' },
        incluirPago: { type: 'boolean', description: 'Permitir ultimo recurso pago (default false)' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'midia_video_auto',
    description: 'Gera video via cascata gratis-primeiro (JSON2Video com cenas -> ComfyUI local; Veo pago so com incluirPago=true).',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Texto-para-video (ComfyUI/Veo)' },
        cenas: { type: 'array', items: { type: 'object' }, description: 'Cenas JSON2Video [{texto?, imagem?, narracao?}]' },
        largura: { type: 'number' },
        altura: { type: 'number' },
        saida: { type: 'string' },
        incluirPago: { type: 'boolean', description: 'Permitir Veo pago (default false)' }
      },
      required: []
    }
  },
  {
    name: 'midia_narrar',
    description: 'Sintetiza narracao de texto em mp3 (edge-tts gratis ou voz local). Texto max 8000 chars.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string' },
        voz: { type: 'string', description: 'Id da voz (opcional; default do projeto)' },
        taxa: { type: 'string', description: 'Velocidade relativa, ex: +10%' },
        saida: { type: 'string' }
      },
      required: ['texto']
    }
  },
  {
    name: 'midia_memes_listar',
    description: 'Lista templates de meme disponiveis (id, nome, largura, altura).',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'midia_meme_gerar',
    description: 'Gera meme local com template + texto de cima/baixo (ImageMagick).',
    inputSchema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: 'Id ou nome do template (ver midia_memes_listar)' },
        topo: { type: 'string' },
        baixo: { type: 'string' },
        saida: { type: 'string' }
      },
      required: ['template']
    }
  },
  {
    name: 'doc_pdf',
    description: 'Operacoes em PDF locais via pypdf: info, mesclar, dividir, extrair texto, preencher formulario.',
    inputSchema: {
      type: 'object',
      properties: {
        acao: { type: 'string', enum: ['info', 'mesclar', 'dividir', 'texto', 'formulario'] },
        entrada: { type: 'string', description: 'Arquivo PDF relativo a raiz' },
        entradas: { type: 'array', items: { type: 'string' }, description: 'Para mesclar: lista de PDFs' },
        inicio: { type: 'number' },
        fim: { type: 'number' },
        campos: { type: 'object', additionalProperties: { type: 'string' }, description: 'formulario: nome->valor' },
        saida: { type: 'string' }
      },
      required: ['acao']
    }
  },
  {
    name: 'doc_planilha',
    description: 'Operacoes em planilhas locais via python: ler xlsx, criar, csv<->xlsx.',
    inputSchema: {
      type: 'object',
      properties: {
        acao: { type: 'string', enum: ['ler', 'criar', 'csv-para-xlsx', 'xlsx-para-csv'] },
        entrada: { type: 'string' },
        saida: { type: 'string' },
        aba: { type: 'string' },
        linhas: { type: 'array', items: { type: 'array', items: {} } }
      },
      required: ['acao']
    }
  },
  {
    name: 'vault_write',
    description: 'Grava arquivo no vault (.dg-editor). Caminho relativo, max 512KB, nomes protegidos bloqueados.',
    inputSchema: {
      type: 'object',
      properties: {
        caminho: { type: 'string', description: 'Path relativo ao .dg-editor (ex: relatorios/x.md)' },
        conteudo: { type: 'string' }
      },
      required: ['caminho', 'conteudo']
    }
  },
  {
    name: 'custo_resumo',
    description: 'Resumo de custo do dia: total USD, limite configurado e quebra por motor.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'projeto_memoria',
    description: 'Memoria persistente do projeto (stack, testCmd, buildCmd, notas). Le ou grava .dg-editor/projeto-memoria.json.',
    inputSchema: {
      type: 'object',
      properties: {
        gravar: { type: 'boolean', description: 'true para gravar campos abaixo; false/ausente so le' },
        stack: { type: 'string' },
        testCmd: { type: 'string' },
        buildCmd: { type: 'string' },
        notas: { type: 'string' }
      },
      required: []
    }
  },
  {
    name: 'resultado_avaliar',
    description: 'Avalia se a resposta final atende o pedido.',
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
    name: 'navegador_status',
    description: 'Status do navegador embutido do DG Editor (exige app aberto).',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'navegador_abrir',
    description: 'Abre/navega URL no navegador embutido. Opcional: esperarSeletor (CSS) para SPAs.',
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
    description: 'Le conteudo do navegador embutido (texto|tabela|links|html). Paginacao offset/limit; opcional seletor, frame, esperarSeletor.',
    inputSchema: {
      type: 'object',
      properties: {
        modo: { type: 'string', enum: ['texto', 'tabela', 'links', 'html'] },
        seletor: { type: 'string' },
        offset: { type: 'number' },
        limit: { type: 'number' },
        esperarSeletor: { type: 'string' },
        esperarTimeoutMs: { type: 'number' },
        aguardarEstavel: { type: 'number' },
        frame: { oneOf: [{ type: 'number' }, { type: 'string' }] }
      },
      required: []
    }
  },
  {
    name: 'navegador_clicar',
    description: 'Clica elemento no navegador embutido por seletor CSS ou texto.',
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
    description: 'Preenche input/textarea no navegador embutido (compativel com React/Vue).',
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
    description: 'Baixa arquivo do navegador embutido (url ou seletor) para .dg-editor/downloads/.',
    inputSchema: {
      type: 'object',
      properties: {
        seletor: { type: 'string' },
        url: { type: 'string' }
      },
      required: []
    }
  }
]

// Tools com handler local neste arquivo (as 36 originais). Todo o resto
// do ALLOWED_TOOLS e delegado ao dispatch compartilhado do stdio.
const LOCAL_TOOLS = new Set(TOOLS.map((t) => t.name))

// Definicoes expostas no tools/list: as locais + as do dispatch que o
// gate permite (novas ferramentas da Rodada 5).
const EXTRA_TOOLS = TOOLS_MCP.filter((t) => ALLOWED_TOOLS.has(t.name) && !LOCAL_TOOLS.has(t.name))

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...TOOLS, ...EXTRA_TOOLS] }))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params

  if (!ALLOWED_TOOLS.has(name)) {
    return {
      content: [{ type: 'text', text: 'ferramenta nao exposta neste servidor' }],
      isError: true
    }
  }

  // Reavalia a raiz a cada chamada (mesmo syncRaiz do stdio):
  // trocar de projeto no app passa a valer na proxima chamada HTTP.
  const raiz = raizMcp()
  const vault = vaultMcp()

  logCall(name, args, raiz)

  const protegido = primeiroCaminhoProtegido(args)
  if (protegido) {
    return {
      content: [{ type: 'text', text: 'arquivo protegido: ' + protegido }],
      isError: true
    }
  }

  if (GRUPO3_PAGOS.has(name)) {
    const limite = limiteCustoDia(raiz)
    if (limite > 0 && custoDiaUsd(raiz) >= limite) {
      return {
        content: [{
          type: 'text',
          text: `Teto de custo diario atingido no HTTP: ~US$${custoDiaUsd(raiz).toFixed(2)} >= US$${limite.toFixed(2)}. ` +
            'Ajuste .dg-editor/custo-limite.json ou DG_CUSTO_LIMITE_DIA_USD, ou use um motor gratuito.'
        }],
        isError: true
      }
    }
  }

  // dossie_write do dispatch aceita root livre; no HTTP o root e sempre
  // o projeto ativo (mesma regra das demais tools).
  if (name === 'dossie_write') {
    const rootArg = (args as { root?: unknown }).root
    if (typeof rootArg === 'string' && resolve(rootArg) !== raiz) {
      return {
        content: [{ type: 'text', text: 'dossie_write: root deve ser o projeto ativo (DG_ROOT)' }],
        isError: true
      }
    }
  }

  if (!LOCAL_TOOLS.has(name)) {
    return executarToolCall(name, args)
  }

  try {
    if (name === 'dossie_read') {
      const txt = await lerDossie()
      return { content: [{ type: 'text', text: txt || '(dossie vazio)' }] }
    }

    if (name === 'dossie_snapshot') {
      const snap = await dossieSnapshot()
      const resposta = { ...(snap || {}), root: raiz }
      return { content: [{ type: 'text', text: JSON.stringify(resposta, null, 2) }] }
    }

    if (name === 'vault_list') {
      const sub = (args as { subpasta?: string }).subpasta
      const base = sub ? join(vault, sub) : vault
      if (!dentroDoVault(base)) throw new Error('caminho fora do vault')
      const entradas = await fs.readdir(base, { withFileTypes: true })
      const linhas = entradas.map((e) => {
        if (nomeProtegido(e.name)) {
          return (e.isDirectory() ? '[D] ' : '[F] ') + '[protegido]'
        }
        return (e.isDirectory() ? '[D] ' : '[F] ') + e.name
      })
      return { content: [{ type: 'text', text: linhas.join('\n') || '(vazio)' }] }
    }

    if (name === 'vault_read') {
      const p = (args as { caminho: string }).caminho
      const abs = join(vault, p)
      if (!dentroDoVault(abs)) throw new Error('caminho fora do vault')
      if (caminhoEhProtegido(p)) {
        return { content: [{ type: 'text', text: 'arquivo protegido: ' + p }], isError: true }
      }
      const txt = await fs.readFile(abs, 'utf8')
      return { content: [{ type: 'text', text: txt }] }
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
          if (nomeProtegido(e.name)) {
            linhas.push('  '.repeat(nivel) + '[protegido]')
            continue
          }
          if (filtro && !e.name.toLowerCase().includes(filtro.toLowerCase())) {
            if (e.isDirectory()) await walk(join(dir, e.name), nivel + 1)
            continue
          }
          linhas.push('  '.repeat(nivel) + (e.isDirectory() ? '/' : '') + e.name)
          if (e.isDirectory()) await walk(join(dir, e.name), nivel + 1)
        }
      }
      await walk(raiz, 0)
      return { content: [{ type: 'text', text: linhas.join('\n') || '(vazio)' }] }
    }

    if (name === 'codigo_buscar') {
      const parsed = z.object({
        termo: z.string(),
        tipo: z.enum(['funcao', 'classe', 'tipo', 'todos']).optional()
      }).parse(args)
      const hits = buscarSimbolos(raiz, parsed.termo, parsed.tipo || 'todos')
      const hitsFiltrados = hits.filter((h) => !caminhoEhProtegido(h.arquivo))
      return { content: [{ type: 'text', text: JSON.stringify(hitsFiltrados, null, 2) }] }
    }

    if (name === 'codigo_ler') {
      const parsed = z.object({ nome: z.string() }).parse(args)
      if (caminhoEhProtegido(parsed.nome)) {
        return { content: [{ type: 'text', text: 'arquivo protegido: ' + parsed.nome }], isError: true }
      }
      const hit = lerSimbolo(raiz, parsed.nome)
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
      if (caminhoEhProtegido(parsed.arquivo)) {
        return { content: [{ type: 'text', text: 'arquivo protegido: ' + parsed.arquivo }], isError: true }
      }
      const r = await codigoEditar(raiz, parsed.arquivo, parsed.ancora, parsed.novo, parsed.verificar ?? true)
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] }
    }

    if (name === 'terminal_exec') {
      const parsed = z.object({
        comando: z.string(),
        args: z.array(z.string()).optional(),
        confirmado: z.boolean().optional()
      }).parse(args)
      const r = await terminalExec(raiz, parsed.comando, parsed.args || [], parsed.confirmado ?? false)
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] }
    }

    if (name === 'git_commit') {
      const parsed = z.object({
        mensagem: z.string(),
        confirmado: z.boolean().optional()
      }).parse(args)
      const r = await gitCommit(raiz, parsed.mensagem, parsed.confirmado ?? false)
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], isError: !r.ok }
    }

    if (name === 'git_push') {
      const parsed = z.object({ confirmado: z.boolean().optional() }).parse(args)
      const r = await gitPush(raiz, parsed.confirmado ?? false)
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], isError: !r.ok }
    }

    if (name === 'testes_rodar') {
      const r = await testesRodar(raiz)
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] }
    }

    if (name === 'projeto_smoke') {
      const r = await projetoSmoke(raiz)
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] }
    }

    if (name === 'git_status') {
      const r = await gitStatus(raiz)
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] }
    }

    if (name === 'git_diff') {
      const parsed = z.object({ caminho: z.string().optional() }).parse(args)
      if (parsed.caminho && caminhoEhProtegido(parsed.caminho)) {
        return { content: [{ type: 'text', text: 'arquivo protegido: ' + parsed.caminho }], isError: true }
      }
      const r = await gitDiff(raiz, parsed.caminho)
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] }
    }

    if (name === 'qualidade_checar') {
      const r = await qualidadeChecar(raiz)
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] }
    }

    if (name === 'custo_resumo') {
      const r = {
        custoDiaUsd: custoDiaUsd(raiz),
        limiteDiaUsd: limiteCustoDia(raiz),
        porMotor: resumoUso(raiz)
      }
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] }
    }

    if (name === 'skills_listar') {
      const lista = listarSkills(raiz).map((s) => ({ id: s.id, titulo: s.titulo, gatilho: s.gatilho }))
      return { content: [{ type: 'text', text: JSON.stringify(lista, null, 2) }] }
    }

    if (name === 'agentes_listar') {
      const lista = listarAgentes(raiz).map((a) => ({ id: a.id, nome: a.nome, especialidade: a.especialidade, skills: a.skills }))
      return { content: [{ type: 'text', text: JSON.stringify(lista, null, 2) }] }
    }

    if (name === 'chat_historico') {
      const parsed = z.object({ limite: z.number().optional() }).parse(args)
      const limite = Math.min(Math.max(parsed.limite ?? 20, 1), 50)
      const msgs = loadChat(raiz).slice(-limite).map((m) => ({
        role: m.role,
        content: String(m.content || '').slice(0, 2000)
      }))
      return { content: [{ type: 'text', text: JSON.stringify(msgs, null, 2) }] }
    }

    if (name === 'midia_imagem_auto') {
      const parsed = z.object({
        prompt: z.string(),
        largura: z.number().optional(),
        altura: z.number().optional(),
        seed: z.number().optional(),
        saida: z.string().optional(),
        incluirPago: z.boolean().optional()
      }).parse(args)
      const r = await gerarImagemAuto(raiz, { ...parsed, incluirPago: parsed.incluirPago ?? false })
      const { previewBase64: _omit, ...resto } = r as Record<string, unknown>
      return { content: [{ type: 'text', text: JSON.stringify(resto, null, 2) }], isError: !r.ok }
    }

    if (name === 'midia_video_auto') {
      const parsed = z.object({
        prompt: z.string().optional(),
        cenas: z.array(z.record(z.string(), z.unknown())).optional(),
        largura: z.number().optional(),
        altura: z.number().optional(),
        saida: z.string().optional(),
        incluirPago: z.boolean().optional()
      }).parse(args)
      const r = await gerarVideoAuto(raiz, {
        ...parsed,
        cenas: parsed.cenas as never,
        incluirPago: parsed.incluirPago ?? false
      })
      const { previewBase64: _omit2, ...resto2 } = r as Record<string, unknown>
      return { content: [{ type: 'text', text: JSON.stringify(resto2, null, 2) }], isError: !r.ok }
    }

    if (name === 'midia_narrar') {
      const parsed = z.object({
        texto: z.string(),
        voz: z.string().optional(),
        taxa: z.string().optional(),
        saida: z.string().optional()
      }).parse(args)
      const r = await narrar(raiz, parsed)
      const { previewBase64: _omit5, ...resto5 } = r as Record<string, unknown>
      return { content: [{ type: 'text', text: JSON.stringify(resto5, null, 2) }], isError: !r.ok }
    }

    if (name === 'midia_memes_listar') {
      await sincronizarMemes()
      const { lerManifesto } = await import('../midia/memes')
      const m = lerManifesto()
      const lista = (m?.templates || []).map((t) => ({ id: t.id, nome: t.nome, largura: t.largura, altura: t.altura }))
      return { content: [{ type: 'text', text: JSON.stringify(lista.slice(0, 100), null, 2) }] }
    }

    if (name === 'midia_meme_gerar') {
      const parsed = z.object({
        template: z.string(),
        topo: z.string().optional(),
        baixo: z.string().optional(),
        saida: z.string().optional()
      }).parse(args)
      const r = await gerarMeme(raiz, parsed)
      const { previewBase64: _omit6, ...resto6 } = r as Record<string, unknown>
      return { content: [{ type: 'text', text: JSON.stringify(resto6, null, 2) }], isError: !r.ok }
    }

    if (name === 'doc_pdf') {
      const parsed = z.object({
        acao: z.enum(['info', 'mesclar', 'dividir', 'texto', 'formulario']),
        entrada: z.string().optional(),
        entradas: z.array(z.string()).optional(),
        inicio: z.number().optional(),
        fim: z.number().optional(),
        campos: z.record(z.string(), z.string()).optional(),
        saida: z.string().optional()
      }).parse(args)
      const r = await pdfOperar(raiz, parsed)
      const { previewBase64: _omit3, ...resto3 } = r as Record<string, unknown>
      return { content: [{ type: 'text', text: JSON.stringify(resto3, null, 2) }], isError: !r.ok }
    }

    if (name === 'doc_planilha') {
      const parsed = z.object({
        acao: z.enum(['ler', 'criar', 'csv-para-xlsx', 'xlsx-para-csv']),
        entrada: z.string().optional(),
        saida: z.string().optional(),
        aba: z.string().optional(),
        linhas: z.array(z.array(z.union([z.string(), z.number()]))).optional()
      }).parse(args)
      const r = await planilhaOperar(raiz, parsed)
      const { previewBase64: _omit4, ...resto4 } = r as Record<string, unknown>
      return { content: [{ type: 'text', text: JSON.stringify(resto4, null, 2) }], isError: !r.ok }
    }

    if (name === 'vault_write') {
      const parsed = z.object({ caminho: z.string(), conteudo: z.string() }).parse(args)
      if (caminhoEhProtegido(parsed.caminho)) {
        return { content: [{ type: 'text', text: 'arquivo protegido: ' + parsed.caminho }], isError: true }
      }
      if (Buffer.byteLength(parsed.conteudo, 'utf8') > 512 * 1024) {
        return { content: [{ type: 'text', text: 'conteudo excede 512KB' }], isError: true }
      }
      const abs = join(vault, parsed.caminho)
      if (!dentroDoVault(abs)) throw new Error('caminho fora do vault')
      await fs.mkdir(join(abs, '..'), { recursive: true })
      await fs.writeFile(abs, parsed.conteudo, 'utf8')
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, caminho: parsed.caminho }) }] }
    }

    if (name === 'projeto_memoria') {
      const parsed = z.object({
        gravar: z.boolean().optional(),
        stack: z.string().optional(),
        testCmd: z.string().optional(),
        buildCmd: z.string().optional(),
        notas: z.string().optional()
      }).parse(args)
      const r = parsed.gravar
        ? gravarMemoriaProjeto(raiz, parsed)
        : lerMemoriaProjeto(raiz) || gravarMemoriaProjeto(raiz, {})
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] }
    }

    if (name === 'resultado_avaliar') {
      const parsed = z.object({
        pedido: z.string(),
        textoFinal: z.string(),
        passosResumo: z.string().optional()
      }).parse(args)
      const r = resultadoAvaliar(parsed.pedido, parsed.textoFinal, parsed.passosResumo || '')
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] }
    }

    if (name === 'navegador_status') {
      const r = await chamarControle('GET', '/status')
      const err = r.status === 0 || r.status >= 400 || r.json.erro
      return {
        content: [{ type: 'text', text: JSON.stringify(r.json, null, 2) }],
        isError: !!err
      }
    }

    if (name === 'navegador_abrir') {
      const parsed = z.object({
        url: z.string().min(1),
        esperarSeletor: z.string().optional(),
        esperarTimeoutMs: z.number().optional()
      }).parse(args)
      const r = await chamarControle('POST', '/abrir', parsed)
      const err = r.status === 0 || r.status >= 400 || r.json.erro || r.json.ok === false
      return {
        content: [{ type: 'text', text: JSON.stringify(r.json, null, 2) }],
        isError: !!err
      }
    }

    if (name === 'navegador_ler') {
      const parsed = z.object({
        modo: z.enum(['texto', 'tabela', 'links', 'html']).optional(),
        seletor: z.string().optional(),
        offset: z.number().optional(),
        limit: z.number().optional(),
        esperarSeletor: z.string().optional(),
        esperarTimeoutMs: z.number().optional(),
        aguardarEstavel: z.number().optional(),
        frame: z.union([z.number(), z.string()]).optional()
      }).parse(args)
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
      const parsed = z.object({
        seletor: z.string().optional(),
        texto: z.string().optional(),
        frame: z.union([z.number(), z.string()]).optional(),
        esperarSeletor: z.string().optional(),
        esperarTimeoutMs: z.number().optional()
      }).parse(args)
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
      const parsed = z.object({
        seletor: z.string().optional(),
        url: z.string().optional()
      }).parse(args)
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

    return {
      content: [{ type: 'text', text: 'ferramenta nao exposta neste servidor' }],
      isError: true
    }
  } catch (e: unknown) {
    return {
      content: [{ type: 'text', text: 'ERRO: ' + (e as Error).message }],
      isError: true
    }
  }
})

async function main() {
  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const auth = req.headers['authorization']
    if (!auth || !auth.startsWith('Bearer ') || auth.slice(7) !== TOKEN) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unauthorized' }))
      return
    }

    const transport = new WebStandardStreamableHTTPServerTransport()
    await server.connect(transport)

    try {
      const url = new URL(`http://${req.headers.host ?? '127.0.0.1'}${req.url ?? '/'}`)
      const headers: Record<string, string> = {}
      for (const [k, v] of Object.entries(req.headers)) {
        if (v !== undefined) {
          headers[k] = Array.isArray(v) ? v.join(', ') : v
        }
      }

      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(chunk)
      }
      const body = Buffer.concat(chunks)

      const webReq = new Request(url.toString(), {
        method: req.method ?? 'GET',
        headers,
        body: body.length ? body : undefined
      })

      const webRes = await transport.handleRequest(webReq)

      res.writeHead(webRes.status, Object.fromEntries(webRes.headers.entries()))
      const resBody = await webRes.arrayBuffer()
      res.end(Buffer.from(resBody))
    } catch (e: unknown) {
      const msg = (e as Error)?.message || String(e)
      console.error(`[mcp-http] handleRequest error: ${msg}`)
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'internal error', detail: msg }))
      }
    } finally {
      await transport.close()
    }
  })

  httpServer.listen(7331, '127.0.0.1', () => {
    console.error('[mcp-http] servidor ativo em http://127.0.0.1:7331/mcp')
  })

  httpServer.on('error', (e: unknown) => {
    console.error('[mcp-http] falhou:', e)
    process.exit(1)
  })
}

main().catch((e: unknown) => {
  console.error('[mcp-http] falhou ao iniciar:', e)
  process.exit(1)
})
