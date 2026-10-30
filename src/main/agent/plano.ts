/**
 * Persiste o último plano aprovado para "Executar plano".
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'

export type PlanoSalvo = {
  texto: string
  raiz: string
  salvoEm: string
  agente?: string
}

function pathPlano(): string {
  const d = app.getPath('userData')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return join(d, 'agent-last-plan.json')
}

export function salvarPlano(p: PlanoSalvo): void {
  writeFileSync(pathPlano(), JSON.stringify(p, null, 2), 'utf8')
}

export function lerPlano(): PlanoSalvo | null {
  try {
    if (!existsSync(pathPlano())) return null
    return JSON.parse(readFileSync(pathPlano(), 'utf8')) as PlanoSalvo
  } catch {
    return null
  }
}

export function limparPlano(): void {
  try {
    if (existsSync(pathPlano())) unlinkSync(pathPlano())
  } catch {
    /* */
  }
}
