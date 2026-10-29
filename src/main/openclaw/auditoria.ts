import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'

export type EntradaAuditoriaOpenClaw = {
  ts: string
  acao: 'aplicar' | 'rejeitar' | 'pedir'
  path?: string
  id?: string
  hashAntes?: string
  hashDepois?: string
  detalhe?: string
}

function auditPath(): string {
  return join(app.getPath('userData'), 'openclaw-audit.jsonl')
}

export function registrarAuditoria(entrada: EntradaAuditoriaOpenClaw): void {
  try {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const line = JSON.stringify({ ...entrada, ts: entrada.ts || new Date().toISOString() }) + '\n'
    appendFileSync(auditPath(), line, 'utf8')
  } catch {
    /* nao bloquear fluxo */
  }
}

export function listarAuditoria(limite = 50): EntradaAuditoriaOpenClaw[] {
  try {
    if (!existsSync(auditPath())) return []
    const lines = readFileSync(auditPath(), 'utf8').split(/\r?\n/).filter(Boolean)
    const slice = lines.slice(-Math.max(1, Math.min(limite, 500)))
    const out: EntradaAuditoriaOpenClaw[] = []
    for (const ln of slice) {
      try {
        out.push(JSON.parse(ln) as EntradaAuditoriaOpenClaw)
      } catch {
        /* skip */
      }
    }
    return out.reverse()
  } catch {
    return []
  }
}
