import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { dglog } from '../dglog'
import path from 'path'
import { resolverRaizProjeto } from '../paths'

/**
 * Cliente MCP interno do DG Editor.
 * Fala com o NOSSO servidor local (subprocesso node) por stdio.
 * Nenhuma conexao externa: o transporte e um pipe com o proprio processo filho.
 */

let client: Client | null = null
let transport: StdioClientTransport | null = null
let conectando: Promise<Client> | null = null
/** Raiz com a qual o subprocesso MCP foi iniciado (DG_ROOT). */
let raizMcpConectada: string | null = null

type McpPrefs = { habilitado: boolean }

function caminhoPrefs(): string {
  return join(app.getPath('userData'), 'mcp-prefs.json')
}

function lerPrefs(): McpPrefs {
  try {
    const p = caminhoPrefs()
    if (!existsSync(p)) return { habilitado: true }
    const j = JSON.parse(readFileSync(p, 'utf8')) as Partial<McpPrefs>
    return { habilitado: j.habilitado !== false }
  } catch {
    return { habilitado: true }
  }
}

function salvarPrefs(prefs: McpPrefs): void {
  const p = caminhoPrefs()
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(prefs, null, 2), 'utf8')
}

export function mcpHabilitado(): boolean {
  return lerPrefs().habilitado
}

export async function setMcpHabilitado(v: boolean): Promise<{ ok: boolean; habilitado: boolean }> {
  salvarPrefs({ habilitado: !!v })
  if (!v) await desconectarMcp()
  return { ok: true, habilitado: !!v }
}

function serverJs(): string {
  const raiz = resolverRaizProjeto()
  return path.join(raiz, '.dg-editor', 'bin', 'main', 'mcp', 'server.js')
}

export async function conectarMcp(raizForcada?: string): Promise<Client> {
  const raizAlvo = path.resolve(String(raizForcada || resolverRaizProjeto()))
  if (client && raizMcpConectada === raizAlvo) return client
  if (client && raizMcpConectada && raizMcpConectada !== raizAlvo) {
    await desconectarMcp()
  }
  if (conectando) return conectando

  conectando = (async () => {
    const raiz = raizAlvo
    const alvo = serverJs()
    dglog('[mcp-client] conectando em ' + alvo + ' DG_ROOT=' + raiz)

    transport = new StdioClientTransport({
      command: process.execPath,
      args: [alvo],
      env: {
        ...process.env,
        DG_ROOT: raiz,
        ELECTRON_RUN_AS_NODE: '1'
      },
      stderr: 'pipe'
    })

    const c = new Client({ name: 'dg-editor', version: '0.2.0' }, { capabilities: {} })
    await c.connect(transport)
    dglog('[mcp-client] conectado DG_ROOT=' + raiz)
    client = c
    raizMcpConectada = raiz
    return c
  })()

  try {
    return await conectando
  } finally {
    conectando = null
  }
}

/** Garante que o MCP (cwd/tools) usa a pasta selecionada no Bloco 1. */
export async function garantirMcpNaRaiz(raiz: string): Promise<void> {
  const r = path.resolve(String(raiz || ''))
  if (!r) return
  process.env.DG_ROOT = r
  await conectarMcp(r)
}

export interface McpTool {
  name: string
  description?: string
  inputSchema: unknown
}

export async function listarTools(): Promise<McpTool[]> {
  if (!mcpHabilitado()) return []
  const c = await conectarMcp()
  const r = await c.listTools()
  return (r.tools || []) as McpTool[]
}

export async function chamarTool(
  nome: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; texto: string; bruto?: unknown }> {
  try {
    if (!mcpHabilitado()) {
      return { ok: false, texto: 'MCP desabilitado na UI (ative em Conectores)' }
    }
    const c = await conectarMcp()
    const r = await c.callTool({ name: nome, arguments: args })
    const conteudo = (r as { content?: Array<{ type: string; text?: string }> }).content || []
    const texto = conteudo
      .filter((p) => p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text as string)
      .join('\n')
    return { ok: !(r as { isError?: boolean }).isError, texto, bruto: r }
  } catch (e) {
    dglog('[mcp-client] erro em ' + nome + ': ' + String(e))
    return { ok: false, texto: 'falha ao chamar ' + nome + ': ' + String(e) }
  }
}

/** Smoke: lista tools e devolve contagem/nomes. */
export async function smokeMcp(): Promise<{
  ok: boolean
  habilitado: boolean
  conectado: boolean
  tools: number
  nomes: string[]
  erro?: string
}> {
  const habilitado = mcpHabilitado()
  if (!habilitado) {
    return { ok: false, habilitado, conectado: false, tools: 0, nomes: [], erro: 'MCP desabilitado' }
  }
  try {
    const tools = await listarTools()
    return {
      ok: tools.length > 0,
      habilitado,
      conectado: mcpAtivo(),
      tools: tools.length,
      nomes: tools.map((t) => t.name).slice(0, 40)
    }
  } catch (e) {
    return {
      ok: false,
      habilitado,
      conectado: false,
      tools: 0,
      nomes: [],
      erro: e instanceof Error ? e.message : String(e)
    }
  }
}

export async function desconectarMcp(): Promise<void> {
  if (client) {
    try { await client.close() } catch { /* ignora */ }
    client = null
  }
  transport = null
  raizMcpConectada = null
}

export function mcpAtivo(): boolean {
  return mcpHabilitado() && client !== null
}