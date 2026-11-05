import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export type McpPreset = {
  id: string
  nome: string
  descricao: string
  comando: string
  args: string[]
  env?: Record<string, string>
  ativo?: boolean
  tags?: string[]
}

const PRESETS: McpPreset[] = [
  {
    id: 'markitdown',
    nome: 'MarkItDown',
    descricao: 'Converte PDF, DOCX, XLSX, PPTX, HTML, CSV para Markdown',
    comando: 'uvx',
    args: ['markitdown-mcp'],
    tags: ['documentos', 'pdf', 'markdown']
  },
  {
    id: 'docling',
    nome: 'Docling',
    descricao: 'Extra��o avan�ada de PDFs com tabelas, OCR e layout complexo',
    comando: 'uvx',
    args: ['docling-mcp'],
    tags: ['documentos', 'pdf', 'ocr', 'tabelas']
  },
  {
    id: 'desktop-commander',
    nome: 'Desktop Commander',
    descricao: 'Arquivos, pastas, processos e terminal com mais autonomia',
    comando: 'npx',
    args: ['-y', '@wonderwhy-er/desktop-commander-mcp'],
    tags: ['arquivos', 'terminal', 'sistema']
  },
  {
    id: 'sequential-thinking',
    nome: 'Sequential Thinking',
    descricao: 'Racioc�nio passo a passo para tarefas complexas',
    comando: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    tags: ['raciocinio', 'planejamento']
  },
  {
    id: 'memory',
    nome: 'Memory',
    descricao: 'Mem�ria persistente entre sess�es',
    comando: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    tags: ['memoria']
  },
  {
    id: 'filesystem',
    nome: 'Filesystem',
    descricao: 'Acesso seguro a arquivos e pastas',
    comando: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
    tags: ['arquivos']
  },
  {
    id: 'git',
    nome: 'Git',
    descricao: 'Opera��es git padronizadas para o agente',
    comando: 'npx',
    args: ['-y', '@modelcontextprotocol/server-git'],
    tags: ['git']
  }
]

function presetsPath() {
  const dir = join(app.getPath('userData'), 'dg-mcp')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'presets.json')
}

export function listarPresetsMcp(): McpPreset[] {
  try {
    const p = presetsPath()
    if (!existsSync(p)) {
      writeFileSync(p, JSON.stringify(PRESETS, null, 2), 'utf8')
      return PRESETS
    }
    const saved = JSON.parse(readFileSync(p, 'utf8')) as McpPreset[]
    const map = new Map(PRESETS.map(x => [x.id, x]))
    for (const s of saved) {
      if (map.has(s.id)) {
        const base = map.get(s.id)!
        map.set(s.id, { ...base, ...s })
      } else {
        map.set(s.id, s)
      }
    }
    return Array.from(map.values())
  } catch {
    return PRESETS
  }
}

export function salvarPresetsMcp(presets: McpPreset[]): { ok: boolean } {
  try {
    writeFileSync(presetsPath(), JSON.stringify(presets, null, 2), 'utf8')
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export function obterPresetMcp(id: string): McpPreset | undefined {
  return listarPresetsMcp().find(p => p.id === id)
}
