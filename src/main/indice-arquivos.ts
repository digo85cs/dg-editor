/**
 * Índice de arquivos em memória com chokidar (debounce 200ms).
 */
import { watch, type FSWatcher } from 'chokidar'
import { existsSync, readdirSync, statSync } from 'fs'
import { join, relative, basename } from 'path'
import { caminhoSeguro } from './ipc-seguro'
import { logEstruturado } from './logs-estruturados'

export interface EntradaIndice {
  caminho: string
  rel: string
  nome: string
  mtimeMs: number
  size: number
}

const IGNORE = /(^|[\\/])(node_modules|\.git|out|dist|coverage|\.next|qa-artifacts)([\\/]|$)/

let watcher: FSWatcher | null = null
let raizAtual: string | null = null
const indice = new Map<string, EntradaIndice>()
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let dirty = false

function walk(dir: string, raiz: string): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git' || name === 'out') continue
    const full = join(dir, name)
    if (IGNORE.test(full)) continue
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) walk(full, raiz)
    else if (st.isFile()) {
      const rel = relative(raiz, full).replace(/\\/g, '/')
      indice.set(full, {
        caminho: full,
        rel,
        nome: basename(full),
        mtimeMs: st.mtimeMs,
        size: st.size
      })
    }
  }
}

function rebuild(raiz: string): void {
  indice.clear()
  walk(raiz, raiz)
  dirty = false
  logEstruturado('info', 'indice', 'rebuild', { n: indice.size, raiz })
}

function scheduleRebuild(raiz: string): void {
  dirty = true
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => rebuild(raiz), 200)
}

export function iniciarIndice(raiz: string): { ok: boolean; total: number; erro?: string } {
  // chokidar / watcher so inicia se !SAFE_MODE
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { emSafeMode } = require('./safe-mode') as typeof import('./safe-mode')
    if (emSafeMode()) return { ok: false, total: 0, erro: 'safe-mode' }
  } catch {
    /* ignora se modulo indisponivel em testes */
  }
  const seg = caminhoSeguro(raiz, raiz)
  if (!seg.ok) return { ok: false, total: 0, erro: seg.erro }
  if (!existsSync(seg.abs)) return { ok: false, total: 0, erro: 'raiz inexistente' }
  pararIndice()
  raizAtual = seg.abs
  rebuild(seg.abs)
  watcher = watch(seg.abs, {
    ignored: IGNORE,
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 }
  })
  watcher.on('all', () => {
    if (raizAtual) scheduleRebuild(raizAtual)
  })
  return { ok: true, total: indice.size }
}

export function pararIndice(): void {
  if (watcher) {
    void watcher.close()
    watcher = null
  }
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = null
  raizAtual = null
}

export function listarIndice(filtro?: string): EntradaIndice[] {
  const q = (filtro || '').toLowerCase()
  const all = [...indice.values()]
  if (!q) return all.slice(0, 500)
  return all.filter((e) => e.nome.toLowerCase().includes(q) || e.rel.toLowerCase().includes(q)).slice(0, 200)
}

export function statusIndice(): { ativo: boolean; total: number; dirty: boolean; raiz: string | null } {
  return { ativo: !!watcher, total: indice.size, dirty, raiz: raizAtual }
}
