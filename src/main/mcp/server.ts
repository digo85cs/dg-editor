// Servidor MCP do DG Editor.
// Expoe o vault (.dg-editor), o dossie e o historico do chat como tools
// consumiveis por qualquer cliente MCP (Claude Desktop, Cursor, Maestro).

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { promises as fs } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { z } from 'zod'
import { caminhoDossie, gravarDossie, lerDossie, dossieSnapshot } from '../dossie'
import { projectStateDir } from '../paths'
import { loadChat } from '../chatstore'

const RAIZ = process.env.DG_ROOT || process.cwd()
const VAULT = projectStateDir(RAIZ)

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