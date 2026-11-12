/**
 * Area de trabalho persistente do DG Editor (userData/workspace.json).
 * Sobrevive a reinicios; espelha o que o renderer tambem guarda em localStorage.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { userDataDir } from './paths'

export type WorkspaceDoc = {
  v: 1
  atualizadoEm: string
  layout?: {
    sidebarWidth?: number
    rightWidth?: number
    sidebarCollapsed?: boolean
    rightCollapsed?: boolean
  }
  tema?: 'escuro' | 'claro'
  chat?: {
    mode?: string
    agent?: string
    autoapprove?: boolean
    skill?: string
    skillTitulo?: string
    ativoId?: string
    draft?: string
  }
  ui?: {
    centerPane?: string
    rightPane?: string
    sidebarMode?: string
    browserUrl?: string
  }
  pastas?: string[]
  pastaAtual?: string | null
}

function caminho(): string {
  return join(userDataDir(), 'workspace.json')
}

export function carregarWorkspace(): WorkspaceDoc | null {
  try {
    const p = caminho()
    if (!existsSync(p)) return null
    const j = JSON.parse(readFileSync(p, 'utf8')) as WorkspaceDoc
    if (!j || j.v !== 1) return null
    return j
  } catch {
    return null
  }
}

export function salvarWorkspace(doc: unknown): { ok: boolean; path?: string; erro?: string } {
  try {
    const dir = userDataDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const prev = carregarWorkspace() || { v: 1 as const, atualizadoEm: '' }
    const incoming = (doc && typeof doc === 'object' ? doc : {}) as Partial<WorkspaceDoc>
    const out: WorkspaceDoc = {
      v: 1,
      atualizadoEm: new Date().toISOString(),
      layout: incoming.layout ?? prev.layout,
      tema: incoming.tema ?? prev.tema,
      chat: { ...(prev.chat || {}), ...(incoming.chat || {}) },
      ui: { ...(prev.ui || {}), ...(incoming.ui || {}) },
      pastas: Array.isArray(incoming.pastas) ? incoming.pastas.slice(0, 40) : prev.pastas,
      pastaAtual:
        incoming.pastaAtual !== undefined ? incoming.pastaAtual : prev.pastaAtual
    }
    const p = caminho()
    writeFileSync(p, JSON.stringify(out, null, 2), 'utf8')
    return { ok: true, path: p }
  } catch (e) {
    return { ok: false, erro: String((e as Error)?.message || e) }
  }
}
