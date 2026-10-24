import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { dglog } from '../dglog'
import path from 'path'

/**
 * Cliente MCP interno do DG Editor.
 * Fala com o NOSSO servidor local (subprocesso node) por stdio.
 * Nenhuma conexao externa: o transporte e um pipe com o proprio processo filho.
 */

let client: Client | null = null
let transport: StdioClientTransport | null = null
let conectando: Promise<Client> | null = null

function serverJs(): string {
  // aponta para o binario isolado em .dg-editor/bin (fora do out/ do electron-vite)
  const raiz = process.env.DG_ROOT || process.cwd()
  return path.join(raiz, '.dg-editor', 'bin', 'main', 'mcp', 'server.js')
}

export async function conectarMcp(): Promise<Client> {
  if (client) return client
  if (conectando) return conectando

  conectando = (async () => {
    const alvo = serverJs()
    dglog('[mcp-client] conectando em ' + alvo)

    transport = new StdioClientTransport({
      command: process.execPath,
      args: [alvo],
      env: {
        ...process.env,
        DG_ROOT: process.env.DG_ROOT || process.cwd(),
        ELECTRON_RUN_AS_NODE: '1'
      },
      stderr: 'pipe'
    })

    const c = new Client({ name: 'dg-editor', version: '0.2.0' }, { capabilities: {} })
    await c.connect(transport)
    dglog('[mcp-client] conectado')
    client = c
    return c
  })()

  try {
    return await conectando
  } finally {
    conectando = null
  }
}

export interface McpTool {
  name: string
  description?: string
  inputSchema: unknown
}

export async function listarTools(): Promise<McpTool[]> {
  const c = await conectarMcp()
  const r = await c.listTools()
  return (r.tools || []) as McpTool[]
}

export async function chamarTool(
  nome: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; texto: string; bruto?: unknown }> {
  try {
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

export async function desconectarMcp(): Promise<void> {
  if (client) {
    try { await client.close() } catch { /* ignora */ }
    client = null
  }
  transport = null
}

export function mcpAtivo(): boolean {
  return client !== null
}