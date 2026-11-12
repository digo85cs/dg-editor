/**
 * Saude/ping dos provedores — evita marcar chave invalida como disponivel.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export type ProviderHealth = {
  id: string
  ok: boolean
  at: number
  latenciaMs?: number
  erro?: string
}

type Store = { versao: 1; itens: Record<string, ProviderHealth> }

function pathStore(): string {
  const dir = join(app.getPath('userData'), 'providers')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'health.json')
}

function ler(): Store {
  try {
    if (!existsSync(pathStore())) return { versao: 1, itens: {} }
    return JSON.parse(readFileSync(pathStore(), 'utf8')) as Store
  } catch {
    return { versao: 1, itens: {} }
  }
}

function gravar(s: Store): void {
  writeFileSync(pathStore(), JSON.stringify(s, null, 2), 'utf8')
}

export function obterHealth(id: string): ProviderHealth | null {
  return ler().itens[id] || null
}

export function listarHealth(): ProviderHealth[] {
  return Object.values(ler().itens)
}

export function registrarHealth(h: ProviderHealth): void {
  const s = ler()
  s.itens[h.id] = h
  gravar(s)
}

export function limparHealth(id?: string): void {
  const s = ler()
  if (!id) s.itens = {}
  else delete s.itens[id]
  gravar(s)
}

/** true se o ultimo ping falhou por auth/chave (nao por rede). */
export function chaveRecenteInvalida(id: string, maxAgeMs = 7 * 24 * 3600_000): boolean {
  const h = obterHealth(id)
  if (!h || h.ok) return false
  if (Date.now() - h.at > maxAgeMs) return false
  const e = (h.erro || '').toLowerCase()
  return /401|403|unauthorized|invalid.*key|api key|authentication|bearer/.test(e)
}
