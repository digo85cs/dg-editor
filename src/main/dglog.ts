// dglog.ts - log em arquivo do DG Editor
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { logDir } from './paths'

const LOG_DIR = logDir()
const LOG_FILE = join(LOG_DIR, 'dg-log.jsonl')

export type LogEntry = {
  ts: string
  level: 'info' | 'warn' | 'error'
  msg: string
  ctx?: Record<string, unknown>
}

function formatLinha(entry: LogEntry): string {
  return JSON.stringify(entry, null, 0)
}

export function dglog(msg: string, ctx?: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'info'): void {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(ctx ? { ctx } : {})
  }
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    appendFileSync(LOG_FILE, formatLinha(entry) + '\n', 'utf-8')
  } catch { /* ignora */ }
}

export function dglogWarn(msg: string, ctx?: Record<string, unknown>): void {
  dglog(msg, ctx, 'warn')
}

export function dglogError(msg: string, ctx?: Record<string, unknown>): void {
  dglog(msg, ctx, 'error')
}
