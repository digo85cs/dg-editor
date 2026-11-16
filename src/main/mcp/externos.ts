/**
 * Servidores MCP externos (stdio) configurados por projeto.
 * Config: .dg-editor/mcp-externos.json
 *   { "servidores": [ { "nome": "fs", "comando": "npx",
 *       "args": ["-y", "@modelcontextprotocol/server-filesystem", "D:/"],
 *       "env": { "FOO": "bar" } } ] }
 * Tools externas aparecem ao agente como `ext_<servidor>__<tool>`.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { dglog } from '../dglog'

export interface ServidorExterno {
  nome: string
  comando: string
  args?: string[]
  env?: Record<string, string>
  habilitado?: boolean
}

interface ClienteExterno {
  client: Client
  transport: StdioClientTransport
}

const clientes = new Map<string, Promise<ClienteExterno>>()
const PREFIXO = 'ext_'
const SEP = '__'

function caminhoConfig(raiz: string): string {
  return join(raiz, '.dg-editor', 'mcp-externos.json')
}

export function listarServidoresExternos(raiz: string): ServidorExterno[] {
  try {
    const p = caminhoConfig(raiz)
    if (!existsSync(p)) return []
    const j = JSON.parse(readFileSync(p, 'utf8')) as { servidores?: unknown }
    const lista = Array.isArray(j?.servidores) ? j.servidores : []
    const out: ServidorExterno[] = []
    for (const s of lista) {
      if (!s || typeof s !== 'object') continue
      const o = s as Record<string, unknown>
      const nome = String(o.nome || '')
      const comando = String(o.comando || '')
      if (!/^[a-z0-9][a-z0-9_-]{0,30}$/i.test(nome) || !comando) continue
      out.push({
        nome,
        comando,
        args: Array.isArray(o.args) ? o.args.map(String) : [],
        env: o.env && typeof o.env === 'object' ? (o.env as Record<string, string>) : {},
        habilitado: o.habilitado !== false
      })
    }
    return out.filter((s) => s.habilitado !== false)
  } catch (e) {
    dglog('[mcp-externos] config invalida: ' + String(e))
    return []
  }
}

function nomeToolExterno(servidor: string, tool: string): string {
  return PREFIXO + servidor.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + SEP + tool.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function parseNomeExterno(nome: string): { servidor: string; tool: string } | null {
  if (!nome.startsWith(PREFIXO)) return null
  const resto = nome.slice(PREFIXO.length)
  const i = resto.indexOf(SEP)
  if (i < 0) return null
  return { servidor: resto.slice(0, i), tool: resto.slice(i + SEP.length) }
}

function conectar(raiz: string, s: ServidorExterno): Promise<ClienteExterno> {
  const chave = raiz + '|' + s.nome
  let p = clientes.get(chave)
  if (!p) {
    p = (async () => {
      const transport = new StdioClientTransport({
        command: s.comando,
        args: s.args || [],
        env: { ...process.env, ...(s.env || {}) } as Record<string, string>,
        cwd: raiz
      })
      const client = new Client({ name: 'dg-editor-externo', version: '0.6.0' }, { capabilities: {} })
      await client.connect(transport)
      return { client, transport }
    })()
    clientes.set(chave, p)
    p.catch(() => clientes.delete(chave))
  }
  return p
}

export async function listarToolsExternos(
  raiz: string
): Promise<{ name: string; description?: string; inputSchema: unknown }[]> {
  const servidores = listarServidoresExternos(raiz)
  const out: { name: string; description?: string; inputSchema: unknown }[] = []
  await Promise.all(
    servidores.map(async (s) => {
      try {
        const { client } = await Promise.race([
          conectar(raiz, s),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
        ])
        const r = await client.listTools()
        for (const t of r.tools || []) {
          out.push({
            name: nomeToolExterno(s.nome, t.name),
            description: `[${s.nome}] ${t.description || ''}`.trim(),
            inputSchema: t.inputSchema
          })
        }
      } catch (e) {
        dglog('[mcp-externos] ' + s.nome + ' indisponivel: ' + String(e))
      }
    })
  )
  return out
}

export async function chamarToolExterna(
  raiz: string,
  nome: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; texto: string } | null> {
  const parsed = parseNomeExterno(nome)
  if (!parsed) return null
  const s = listarServidoresExternos(raiz).find((x) => x.nome.toLowerCase() === parsed.servidor)
  if (!s) return { ok: false, texto: 'servidor externo desconhecido: ' + parsed.servidor }
  try {
    const { client } = await conectar(raiz, s)
    const r = await client.callTool({ name: parsed.tool, arguments: args })
    const conteudo = (r as { content?: Array<{ type: string; text?: string }> }).content || []
    const texto = conteudo
      .filter((p) => p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text as string)
      .join('\n')
    return { ok: !(r as { isError?: boolean }).isError, texto }
  } catch (e) {
    dglog('[mcp-externos] erro em ' + nome + ': ' + String(e))
    return { ok: false, texto: 'falha ao chamar ' + nome + ': ' + String(e) }
  }
}
