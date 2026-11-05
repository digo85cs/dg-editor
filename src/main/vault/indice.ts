import { existsSync, readdirSync, statSync } from 'fs'
import { basename, join, relative, resolve } from 'path'
import { extrairFrontmatter } from './frontmatter'
import { extrairWikiLinks, resolverLink, type EntradaResolucao } from './links'
import { extrairTagsInline, unirTags } from './tags'
import { lerNotaArquivo } from './io'
import type { EstadoVault, NotaVault, ResumoNota } from './tipos'

const IGNORE = /(^|[\\/])(node_modules|\.git|out|dist|coverage|\.next|\.obsidian|qa-artifacts)([\\/]|$)/

let raizVault: string | null = null
let indexando = false
const notas = new Map<string, NotaVault>()
/** path destino → paths que linkam para ele */
const backlinks = new Map<string, Set<string>>()

function ehMd(nome: string): boolean {
  return /\.md$/i.test(nome) || /\.markdown$/i.test(nome)
}

function walkMd(dir: string, raiz: string, acc: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git' || name === '.obsidian') continue
    const full = join(dir, name)
    if (IGNORE.test(full)) continue
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) walkMd(full, raiz, acc)
    else if (st.isFile() && ehMd(name)) acc.push(full)
  }
}

function rebuildBacklinks(): void {
  backlinks.clear()
  const entradas: EntradaResolucao[] = [...notas.values()].map((n) => ({
    path: n.path,
    rel: n.rel,
    basename: n.basename,
    aliases: n.frontmatter.aliases
  }))
  for (const n of notas.values()) {
    for (const alvo of n.linksOut) {
      const dest = resolverLink(alvo, entradas, n.rel)
      if (!dest) continue
      let set = backlinks.get(dest)
      if (!set) {
        set = new Set()
        backlinks.set(dest, set)
      }
      set.add(n.path)
    }
  }
}

async function parseArquivo(caminhoAbs: string, raiz: string): Promise<NotaVault | null> {
  try {
    const { texto, eol } = await lerNotaArquivo(caminhoAbs)
    const st = statSync(caminhoAbs)
    const { frontmatter, corpo } = extrairFrontmatter(texto)
    const rel = relative(raiz, caminhoAbs).replace(/\\/g, '/')
    const base = basename(caminhoAbs)
    const tags = unirTags(frontmatter.tags, extrairTagsInline(corpo))
    const linksOut = extrairWikiLinks(texto)
    const titulo =
      frontmatter.titulo ||
      base.replace(/\.md$/i, '').replace(/\.markdown$/i, '') ||
      rel
    return {
      path: resolve(caminhoAbs),
      rel,
      basename: base,
      titulo,
      frontmatter,
      tags,
      linksOut,
      eol,
      mtimeMs: st.mtimeMs
    }
  } catch {
    return null
  }
}

export async function indexarVaultCompleto(raiz: string): Promise<{ ok: boolean; total: number; erro?: string }> {
  const abs = resolve(raiz)
  if (!existsSync(abs)) return { ok: false, total: 0, erro: 'raiz inexistente' }
  indexando = true
  raizVault = abs
  notas.clear()
  backlinks.clear()
  try {
    const paths: string[] = []
    walkMd(abs, abs, paths)
    for (const p of paths) {
      const nota = await parseArquivo(p, abs)
      if (nota) notas.set(nota.path, nota)
    }
    rebuildBacklinks()
    return { ok: true, total: notas.size }
  } catch (e) {
    return { ok: false, total: 0, erro: String((e as Error).message || e) }
  } finally {
    indexando = false
  }
}

export async function reindexarNota(caminho: string): Promise<boolean> {
  if (!raizVault) return false
  const abs = resolve(caminho)
  if (!abs.toLowerCase().startsWith(raizVault.toLowerCase())) return false
  if (!existsSync(abs)) {
    removerNota(abs)
    return true
  }
  const nota = await parseArquivo(abs, raizVault)
  if (!nota) {
    removerNota(abs)
    return false
  }
  notas.set(nota.path, nota)
  rebuildBacklinks()
  return true
}

export function removerNota(caminho: string): void {
  const abs = resolve(caminho)
  notas.delete(abs)
  rebuildBacklinks()
}

export function fecharIndice(): void {
  raizVault = null
  indexando = false
  notas.clear()
  backlinks.clear()
}

export function getRaizVault(): string | null {
  return raizVault
}

export function estadoVault(): EstadoVault {
  return {
    aberto: !!raizVault,
    raiz: raizVault,
    totalNotas: notas.size,
    indexando
  }
}

export function listarResumos(): ResumoNota[] {
  return [...notas.values()]
    .map((n) => ({ path: n.path, rel: n.rel, titulo: n.titulo, tags: n.tags }))
    .sort((a, b) => a.rel.localeCompare(b.rel))
}

export function obterNota(caminho: string): NotaVault | null {
  return notas.get(resolve(caminho)) || null
}

export function resolverWikiLink(alvo: string, origemPath?: string): string | null {
  const entradas: EntradaResolucao[] = [...notas.values()].map((n) => ({
    path: n.path,
    rel: n.rel,
    basename: n.basename,
    aliases: n.frontmatter.aliases
  }))
  const origem = origemPath ? notas.get(resolve(origemPath)) : null
  return resolverLink(alvo, entradas, origem?.rel)
}

export function backlinksDe(caminhoOuBasename: string): ResumoNota[] {
  const abs = resolve(caminhoOuBasename)
  let dest = abs
  if (!notas.has(dest)) {
    const r = resolverWikiLink(caminhoOuBasename)
    if (!r) return []
    dest = r
  }
  const set = backlinks.get(dest)
  if (!set) return []
  return [...set]
    .map((p) => notas.get(p))
    .filter((n): n is NotaVault => !!n)
    .map((n) => ({ path: n.path, rel: n.rel, titulo: n.titulo, tags: n.tags }))
    .sort((a, b) => a.rel.localeCompare(b.rel))
}

export function indiceTags(): Record<string, ResumoNota[]> {
  const map: Record<string, ResumoNota[]> = {}
  for (const n of notas.values()) {
    const resumo = { path: n.path, rel: n.rel, titulo: n.titulo, tags: n.tags }
    for (const t of n.tags) {
      if (!map[t]) map[t] = []
      map[t].push(resumo)
    }
  }
  for (const k of Object.keys(map)) {
    map[k].sort((a, b) => a.rel.localeCompare(b.rel))
  }
  return map
}

/** Paths escritos por nós — watch ignora por um instante. */
const writesProprios = new Set<string>()

export function marcarWriteProprio(caminho: string): void {
  const abs = resolve(caminho)
  writesProprios.add(abs)
  setTimeout(() => writesProprios.delete(abs), 1500)
}

export function ehWriteProprio(caminho: string): boolean {
  return writesProprios.has(resolve(caminho))
}
