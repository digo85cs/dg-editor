// Servidor MCP do DG Editor.
// Expoe o vault (.dg-editor), o dossie e o historico do chat como tools
// consumiveis por qualquer cliente MCP (Claude Desktop, Cursor, Maestro).

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { promises as fs } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { z } from 'zod'
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

const RAIZ = resolverRaizProjeto()
const VAULT = projectStateDir(RAIZ)
garantirSkillsPadrao(RAIZ)
garantirAgentesPadrao(RAIZ)

function dentroDoVault(p: string): boolean {
  const abs = resolve(p)
  const rel = relative(VAULT, abs)
  return !rel.startsWith('..') && !rel.includes('..')
}

const TOOLS = [
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
    name: 'navegador_abrir',
    description:
      'Abre/navega URL no navegador embutido do DG Editor (WebContentsView, sessao persist:dgnav). Login e manual pelo usuario.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'URL absoluta (https://...)' } },
      required: ['url']
    }
  },
  {
    name: 'navegador_ler',
    description: 'Le conteudo da pagina atual do navegador embutido (texto|tabela|links|html).',
    inputSchema: {
      type: 'object',
      properties: {
        modo: { type: 'string', enum: ['texto', 'tabela', 'links', 'html'] },
        seletor: { type: 'string', description: 'CSS opcional para escopo' }
      },
      required: []
    }
  },
  {
    name: 'navegador_clicar',
    description: 'Clica elemento por seletor CSS ou texto exato de botao/link.',
    inputSchema: {
      type: 'object',
      properties: {
        seletor: { type: 'string' },
        texto: { type: 'string' }
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
  }
]

const server = new Server(
  { name: 'dg-editor-vault', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params

  try {
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

    if (name === 'navegador_abrir') {
      const parsed = z.object({ url: z.string().min(1) }).parse(args)
      const r = await chamarControle('POST', '/abrir', { url: parsed.url })
      const err = r.status === 0 || r.status >= 400 || r.json.erro
      return {
        content: [{ type: 'text', text: JSON.stringify(r.json, null, 2) }],
        isError: !!err
      }
    }

    if (name === 'navegador_ler') {
      const parsed = z
        .object({
          modo: z.enum(['texto', 'tabela', 'links', 'html']).optional(),
          seletor: z.string().optional()
        })
        .parse(args)
      const r = await chamarControle('POST', '/ler', {
        modo: parsed.modo || 'texto',
        seletor: parsed.seletor
      })
      const err = r.status === 0 || r.status >= 400 || r.json.erro || r.json.ok === false
      return {
        content: [{ type: 'text', text: JSON.stringify(r.json, null, 2) }],
        isError: !!err
      }
    }

    if (name === 'navegador_clicar') {
      const parsed = z
        .object({ seletor: z.string().optional(), texto: z.string().optional() })
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