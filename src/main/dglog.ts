// dglog.ts - log em arquivo do DG Editor
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { logDir } from './paths'

const LOG_DIR = logDir()
const LOG_FILE = join(LOG_DIR, 'dg-log.txt')

export function dglog(msg: string): void {
  const linha = `[${new Date().toLocaleString('pt-BR')}] ${msg}`
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    appendFileSync(LOG_FILE, linha + '\n', 'utf-8')
  } catch { /* ignora */ }
}
