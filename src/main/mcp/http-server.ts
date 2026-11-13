/**
 * Servidor MCP HTTP do DG Editor (somente leitura).
 * Requer DG_MCP_TOKEN. Escuta em 127.0.0.1:7331.
 * Expõe apenas 11 ferramentas de leitura.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { promises as fs } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { lerDossie, dossieSnapshot } from '../dossie'
import { projectStateDir, resolverRaizDGEditor } from '../paths'
import { obterRaizWorkspace } from '../workspace-raiz'
import { loadChat } from '../chatstore'
import { buscarSimbolos, lerSimbolo } from '../brain/indice'
import { gitStatus, gitDiff, qualidadeChecar, resultadoAvaliar } from '../autonomia-tools'

const raizWS = obterRaizWorkspace()
const RAIZ = resolve(process.env.DG_ROOT || (raizWS ?? resolverRaizDGEditor()))
const VAULT = projectStateDir(RAIZ)
const TOKEN = process.env.DG_MCP_TOKEN

if (!TOKEN) {
  console.error('DG_MCP_TOKEN ausente')
  process.exit(1)
}

const server = new Server(
  { name: 'dg-editor-mcp-http', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

const ALLOWED_TOOLS = new Set([
  'dossie_read', 'dossie_snapshot', 'vault_list', 'vault_read',
  'projeto_arvore', 'codigo_buscar', 'codigo_ler', 'git_status',
  'git_diff', 'qualidade_checar', 'resultado_avaliar'
])

function logCall(toolName: string, args: unknown): void {
  const ts = new Date().toISOString()
  const argsSummary = JSON.stringify(args).slice(0, 200)
  console.error(`[${ts}] mcp:http tool=${toolName} args=${argsSummary}`)
}

function dentroDoVault(p: string): boolean {
  const abs = resolve(p)
  const rel = relative(VAULT, abs)
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
  }
]

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params

  if (!ALLOWED_TOOLS.has(name)) {
    return {
      content: [{ type: 'text', text: 'ferramenta nao exposta neste servidor' }],
      isError: true
    }
  }

  logCall(name, args)

  try {
    if (name === 'dossie_read') {
      const txt = await lerDossie()
      return { content: [{ type: 'text', text: txt || '(dossie vazio)' }] }
    }

    if (name === 'dossie_snapshot') {
      const snap = await dossieSnapshot()
      const resposta = { ...(snap || {}), root: RAIZ }
      return { content: [{ type: 'text', text: JSON.stringify(resposta, null, 2) }] }
    }

    if (name === 'vault_list') {
      const sub = (args as { subpasta?: string }).subpasta
      const base = sub ? join(VAULT, sub) : VAULT
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
      const abs = join(VAULT, p)
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
      await walk(RAIZ, 0)
      return { content: [{ type: 'text', text: linhas.join('\n') || '(vazio)' }] }
    }

    if (name === 'codigo_buscar') {
      const parsed = z.object({
        termo: z.string(),
        tipo: z.enum(['funcao', 'classe', 'tipo', 'todos']).optional()
      }).parse(args)
      const hits = buscarSimbolos(RAIZ, parsed.termo, parsed.tipo || 'todos')
      const hitsFiltrados = hits.filter((h) => !caminhoEhProtegido(h.arquivo))
      return { content: [{ type: 'text', text: JSON.stringify(hitsFiltrados, null, 2) }] }
    }

    if (name === 'codigo_ler') {
      const parsed = z.object({ nome: z.string() }).parse(args)
      if (caminhoEhProtegido(parsed.nome)) {
        return { content: [{ type: 'text', text: 'arquivo protegido: ' + parsed.nome }], isError: true }
      }
      const hit = lerSimbolo(RAIZ, parsed.nome)
      if (!hit) {
        return { content: [{ type: 'text', text: 'simbolo nao encontrado: ' + parsed.nome }], isError: true }
      }
      return { content: [{ type: 'text', text: JSON.stringify(hit, null, 2) }] }
    }

    if (name === 'git_status') {
      const r = await gitStatus(RAIZ)
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] }
    }

    if (name === 'git_diff') {
      const parsed = z.object({ caminho: z.string().optional() }).parse(args)
      if (parsed.caminho && caminhoEhProtegido(parsed.caminho)) {
        return { content: [{ type: 'text', text: 'arquivo protegido: ' + parsed.caminho }], isError: true }
      }
      const r = await gitDiff(RAIZ, parsed.caminho)
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] }
    }

    if (name === 'qualidade_checar') {
      const r = await qualidadeChecar(RAIZ)
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
