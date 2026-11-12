/**
 * Telemetria leve de falhas de tools (diagnostico / debug).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export type ToolFalha = {
  at: number
  nome: string
  resumo: string
  raiz?: string
}

const MAX = 40

function arquivo(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'tools-falhas.json')
}

function ler(): ToolFalha[] {
  try {
    const p = arquivo()
    if (!existsSync(p)) return []
    const j = JSON.parse(readFileSync(p, 'utf8')) as ToolFalha[]
    return Array.isArray(j) ? j : []
  } catch {
    return []
  }
}

function gravar(lista: ToolFalha[]): void {
  try {
    writeFileSync(arquivo(), JSON.stringify(lista.slice(-MAX), null, 2), 'utf8')
  } catch {
    /* */
  }
}

export function registrarFalhaTool(nome: string, resumo: string, raiz?: string): void {
  const lista = ler()
  lista.push({
    at: Date.now(),
    nome: String(nome || 'tool').slice(0, 80),
    resumo: String(resumo || '').slice(0, 400),
    raiz: raiz ? String(raiz).slice(0, 260) : undefined
  })
  gravar(lista)
}

export function listarFalhasTool(limite = 15): ToolFalha[] {
  return ler().slice(-limite).reverse()
}

export function limparFalhasTool(): void {
  gravar([])
}
