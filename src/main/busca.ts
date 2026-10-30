/**
 * Busca de arquivos (fuzzy) e de conteúdo (substring/regex) na raiz aberta.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, basename, extname } from 'path'
import { caminhoSeguro } from './ipc-seguro'

const IGNORE = new Set([
  'node_modules',
  '.git',
  'out',
  'dist',
  'build',
  'coverage',
  '.next',
  'vendor',
  '__pycache__',
  '.dg-editor',
  'qa-artifacts'
])

const MAX_ARQUIVOS = 4000
const MAX_RESULTADOS = 80
const MAX_BYTES_LER = 512 * 1024

function scoreFuzzy(nome: string, query: string): number {
  const n = nome.toLowerCase()
  const q = query.toLowerCase()
  if (!q) return 1
  if (n === q) return 100
  if (n.startsWith(q)) return 80
  if (n.includes(q)) return 60
  let qi = 0
  for (let i = 0; i < n.length && qi < q.length; i++) {
    if (n[i] === q[qi]) qi++
  }
  return qi === q.length ? 30 + Math.max(0, 20 - (n.length - q.length)) : 0
}

function walkArquivos(raiz: string, acc: string[], profundidade: number): void {
  if (profundidade > 12 || acc.length >= MAX_ARQUIVOS) return
  let entries: string[]
  try {
    entries = readdirSync(raiz)
  } catch {
    return
  }
  for (const name of entries) {
    if (IGNORE.has(name) || (name.startsWith('.') && name !== '.dgrules' && name !== '.env.example')) {
      continue
    }
    const full = join(raiz, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) walkArquivos(full, acc, profundidade + 1)
    else if (st.isFile()) acc.push(full)
    if (acc.length >= MAX_ARQUIVOS) return
  }
}

export function buscaArquivos(
  raiz: string,
  query: string,
  limite = MAX_RESULTADOS
): { ok: boolean; itens?: { caminho: string; rel: string; nome: string; score: number }[]; erro?: string } {
  const seg = caminhoSeguro(raiz, raiz)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  if (!existsSync(seg.abs)) return { ok: false, erro: 'raiz inexistente' }
  const todos: string[] = []
  walkArquivos(seg.abs, todos, 0)
  const q = (query || '').trim()
  const pontuados = todos
    .map((c) => {
      const nome = basename(c)
      const rel = relative(seg.abs, c).replace(/\\/g, '/')
      const score = q ? Math.max(scoreFuzzy(nome, q), scoreFuzzy(rel, q) * 0.8) : 1
      return { caminho: c, rel, nome, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(limite, MAX_RESULTADOS))
  return { ok: true, itens: pontuados }
}

const abortMap = new Map<string, AbortController>()

export function cancelarBuscaConteudo(id: string): void {
  const c = abortMap.get(id)
  if (c) {
    c.abort()
    abortMap.delete(id)
  }
}

export async function buscaConteudo(
  raiz: string,
  query: string,
  opcoes?: { regex?: boolean; limite?: number; id?: string }
): Promise<{
  ok: boolean
  grupos?: { arquivo: string; rel: string; hits: { linha: number; texto: string }[] }[]
  cancelado?: boolean
  erro?: string
}> {
  const seg = caminhoSeguro(raiz, raiz)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  const q = (query || '').trim()
  if (!q) return { ok: false, erro: 'query vazia' }
  const id = opcoes?.id || 'busca-' + Date.now()
  const ac = new AbortController()
  abortMap.set(id, ac)
  const limite = Math.min(opcoes?.limite || 60, 120)
  let re: RegExp | null = null
  if (opcoes?.regex) {
    try {
      re = new RegExp(q, 'i')
    } catch (e) {
      abortMap.delete(id)
      return { ok: false, erro: 'regex invalida: ' + String((e as Error).message || e) }
    }
  }
  const arquivos: string[] = []
  walkArquivos(seg.abs, arquivos, 0)
  const grupos: { arquivo: string; rel: string; hits: { linha: number; texto: string }[] }[] = []
  let totalHits = 0
  const textoOk = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.json',
    '.md',
    '.css',
    '.html',
    '.txt',
    '.py',
    '.yml',
    '.yaml',
    '.ps1',
    '.sh',
    '.xml'
  ])

  try {
    for (const arq of arquivos) {
      if (ac.signal.aborted) return { ok: true, grupos, cancelado: true }
      const ext = extname(arq).toLowerCase()
      if (ext && !textoOk.has(ext)) continue
      let st
      try {
        st = statSync(arq)
      } catch {
        continue
      }
      if (st.size > MAX_BYTES_LER) continue
      let raw: string
      try {
        raw = readFileSync(arq, 'utf8')
      } catch {
        continue
      }
      if (raw.includes('\0')) continue
      const linhas = raw.split(/\r?\n/)
      const hits: { linha: number; texto: string }[] = []
      for (let i = 0; i < linhas.length; i++) {
        const L = linhas[i]
        const bate = re ? re.test(L) : L.toLowerCase().includes(q.toLowerCase())
        if (bate) {
          hits.push({ linha: i + 1, texto: L.slice(0, 200) })
          totalHits++
          if (hits.length >= 8) break
        }
      }
      if (hits.length) {
        grupos.push({
          arquivo: arq,
          rel: relative(seg.abs, arq).replace(/\\/g, '/'),
          hits
        })
      }
      if (grupos.length >= limite || totalHits >= limite * 3) break
    }
    return { ok: true, grupos }
  } finally {
    abortMap.delete(id)
  }
}
