/**
 * Logs estruturados JSONL em userData/logs/ (rotação diária).
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { appDataDir } from './paths'

export type NivelLog = 'debug' | 'info' | 'warn' | 'erro'

export interface EntradaLog {
  ts: string
  nivel: NivelLog
  area: string
  msg: string
  contexto?: Record<string, unknown>
}

function dirLogs(): string {
  const d = join(appDataDir(), 'logs')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function arquivoDoDia(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return join(dirLogs(), `dg-${y}-${m}-${day}.jsonl`)
}

/** Remove JSONL com mais de 14 dias. */
function rotacionar(): void {
  const dir = dirLogs()
  const limite = Date.now() - 14 * 86400000
  try {
    for (const f of readdirSync(dir)) {
      if (!/^dg-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)) continue
      const iso = f.slice(3, 13)
      const t = Date.parse(iso)
      if (!Number.isNaN(t) && t < limite) {
        try {
          unlinkSync(join(dir, f))
        } catch {
          /* */
        }
      }
    }
  } catch {
    /* */
  }
}

let rotacionou = false

export function logEstruturado(
  nivel: NivelLog,
  area: string,
  msg: string,
  contexto?: Record<string, unknown>
): void {
  if (!rotacionou) {
    try {
      rotacionar()
    } catch {
      /* logging must never break the operation it observes */
    }
    rotacionou = true
  }
  const entrada: EntradaLog = {
    ts: new Date().toISOString(),
    nivel,
    area,
    msg,
    ...(contexto ? { contexto } : {})
  }
  try {
    appendFileSync(arquivoDoDia(), JSON.stringify(entrada) + '\n', 'utf-8')
  } catch {
    /* silencioso */
  }
}
