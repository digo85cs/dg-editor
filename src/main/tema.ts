import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

// Temas (Fase 2): escuro (padrao) e claro, persistidos no userData
export type Tema = 'escuro' | 'claro'

function temaPath(): string {
  return join(app.getPath('userData'), 'tema.json')
}

export function lerTema(): Tema {
  const p = temaPath()
  if (!existsSync(p)) return 'escuro'
  try {
    const data = JSON.parse(readFileSync(p, 'utf-8')) as { tema?: Tema }
    return data.tema === 'claro' ? 'claro' : 'escuro'
  } catch {
    return 'escuro'
  }
}

export function salvarTema(tema: Tema): void {
  const p = temaPath()
  try {
    const dir = join(p, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(p, JSON.stringify({ tema }, null, 2), 'utf-8')
  } catch { /* ignora */ }
}
