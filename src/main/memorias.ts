/**
 * Fatos curtos do projeto. So entram no prompt depois que a pessoa aceita.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'

export type StatusMemoria = 'pendente' | 'aceita'

export type Memoria = {
  id: string
  texto: string
  status: StatusMemoria
  criadoEm: number
}

function caminho(raiz: string): string {
  return join(raiz, '.dg-editor', 'memorias.json')
}

function ler(raiz: string): Memoria[] {
  const p = caminho(raiz)
  if (!existsSync(p)) return []
  try {
    const j = JSON.parse(readFileSync(p, 'utf8')) as unknown
    if (!Array.isArray(j)) return []
    return j.filter((m) => m && typeof m.texto === 'string' && typeof m.id === 'string') as Memoria[]
  } catch {
    return []
  }
}

function gravar(raiz: string, lista: Memoria[]): void {
  const dir = join(raiz, '.dg-editor')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(caminho(raiz), JSON.stringify(lista.slice(0, 80), null, 2), 'utf8')
}

export function listarMemorias(raiz: string): Memoria[] {
  return ler(raiz)
}

export function proporMemoria(raiz: string, texto: string): { ok: boolean; erro?: string; id?: string; duplicada?: boolean } {
  const t = texto.trim().slice(0, 400)
  if (t.length < 8) return { ok: false, erro: 'texto curto demais' }
  const lista = ler(raiz)
  const ja = lista.find((m) => m.texto === t)
  if (ja) return { ok: true, id: ja.id, duplicada: true }
  const id = randomBytes(4).toString('hex')
  lista.unshift({ id, texto: t, status: 'pendente', criadoEm: Date.now() })
  gravar(raiz, lista)
  return { ok: true, id }
}

export function decidirMemoria(raiz: string, id: string, aceitar: boolean): { ok: boolean } {
  let lista = ler(raiz)
  if (!aceitar) lista = lista.filter((m) => m.id !== id)
  else lista = lista.map((m) => (m.id === id ? { ...m, status: 'aceita' as const } : m))
  gravar(raiz, lista)
  return { ok: true }
}

/** Somente fatos aceitos. Pendentes ficam de fora do prompt. */
export function textoMemoriasAceitas(raiz: string, max = 1200): string {
  const aceitas = ler(raiz).filter((m) => m.status === 'aceita').slice(0, 12)
  if (!aceitas.length) return ''
  return aceitas.map((m) => '- ' + m.texto).join('\n').slice(0, max)
}
