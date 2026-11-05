import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, basename, extname } from 'path'
import { caminhoSeguro } from './ipc-seguro'
import { deveIgnorar } from './ignore'

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

function walkArquivos(raizAbs: string, acc: string[], profundidade: number): void {
  if (profundidade > 12 || acc.length >= MAX_ARQUIVOS) return
  let entries: string[]
  try {
    entries = readdirSync(raizAbs)
  } catch {
    return
  }
  for (const name of entries) {
    if (IGNORE.has(name) || (name.startsWith('.') && name !== '.dgrules' && name !== '.env.example')) {
      continue
    }
    const full = join(raizAbs, name)
    const rel = relative(raizAbs, full).replace(/\\/g, '/')
    if (deveIgnorar(raizAbs, rel) || deveIgnorar(raizAbs, name)) {
      continue
    }
    let st: any
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
    .map((full) => {
      const nome = basename(full)
      const rel = relative(seg.abs, full).replace(/\\/g, '/')
      const score = scoreFuzzy(nome, q) + (q && rel.toLowerCase().includes(q.toLowerCase()) ? 5 : 0)
      return { caminho: full, rel, nome, score }
    })
    .filter((x) => (q ? x.score > 0 : true))
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
  return { ok: true, itens: pontuados }
}

export function buscaConteudo(
  raiz: string,
  query: string,
  opcoes: { regex?: boolean; limite?: number; extensoes?: string[] } = {}
): { ok: boolean; itens?: any[]; erro?: string } {
  const seg = caminhoSeguro(raiz, raiz)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  if (!existsSync(seg.abs)) return { ok: false, erro: 'raiz inexistente' }
  const arquivos: string[] = []
  walkArquivos(seg.abs, arquivos, 0)
  const q = query || ''
  if (!q.trim()) return { ok: true, itens: [] }
  let re: RegExp | null = null
  if (opcoes.regex) {
    try {
      re = new RegExp(q, 'i')
    } catch {
      re = null
    }
  }
  const itens: any[] = []
  const limite = opcoes.limite || 60
  for (const full of arquivos) {
    if (itens.length >= limite) break
    if (opcoes.extensoes && opcoes.extensoes.length) {
      const ext = extname(full).toLowerCase()
      if (!opcoes.extensoes.includes(ext)) continue
    }
    try {
      const st = statSync(full)
      if (st.size > MAX_BYTES_LER) continue
      const buf = readFileSync(full)
      const txt = buf.toString('utf8')
      const linhas = txt.split(/\r?\n/)
      for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i]
        const match = re ? re.test(linha) : linha.toLowerCase().includes(q.toLowerCase())
        if (match) {
          itens.push({
            caminho: full,
            rel: relative(seg.abs, full).replace(/\\/g, '/'),
            linha: i + 1,
            trecho: linha.slice(0, 280)
          })
          break
        }
      }
    } catch {
    }
  }
  return { ok: true, itens }
}

export function cancelarBuscaConteudo(_id?: string) {
  return { ok: true }
}
