import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
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

const buscasAtivas = new Map<string, { cancelado: boolean }>()

export async function buscaConteudo(
  raiz: string,
  query: string,
  opcoes: { regex?: boolean; limite?: number; extensoes?: string[]; id?: string } = {}
): Promise<{ ok: boolean; itens?: any[]; erro?: string; cancelado?: boolean }> {
  const seg = caminhoSeguro(raiz, raiz)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  if (!existsSync(seg.abs)) return { ok: false, erro: 'raiz inexistente' }
  const arquivos: string[] = []
  walkArquivos(seg.abs, arquivos, 0)
  const q = query || ''
  if (!q.trim()) return { ok: true, itens: [] }
  const sinal = opcoes.id ? { cancelado: false } : null
  if (opcoes.id) buscasAtivas.set(opcoes.id, sinal as { cancelado: boolean })
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
  const MAX_POR_ARQUIVO = 3
  try {
    for (let idx = 0; idx < arquivos.length; idx++) {
      if (itens.length >= limite) break
      if (sinal?.cancelado) return { ok: true, itens, cancelado: true }
      if (idx > 0 && idx % 25 === 0) {
        await new Promise((resolve) => setImmediate(resolve))
        if (sinal?.cancelado) return { ok: true, itens, cancelado: true }
      }
      const full = arquivos[idx]
      if (opcoes.extensoes && opcoes.extensoes.length) {
        const ext = extname(full).toLowerCase()
        if (!opcoes.extensoes.includes(ext)) continue
      }
      try {
        const st = statSync(full)
        if (st.size > MAX_BYTES_LER) continue
        const buf = readFileSync(full)
        if (buf.includes(0)) continue
        const txt = buf.toString('utf8')
        const linhas = txt.split(/\r?\n/)
        let achados = 0
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
            achados++
            if (achados >= MAX_POR_ARQUIVO) break
            if (itens.length >= limite) break
          }
        }
      } catch {
        /* arquivo ilegivel: segue */
      }
    }
    return { ok: true, itens }
  } finally {
    if (opcoes.id) buscasAtivas.delete(opcoes.id)
  }
}

export function cancelarBuscaConteudo(id?: string) {
  if (!id) {
    for (const s of buscasAtivas.values()) s.cancelado = true
    return { ok: true, cancelados: buscasAtivas.size }
  }
  const s = buscasAtivas.get(id)
  if (s) s.cancelado = true
  return { ok: true, cancelado: !!s }
}

const MAX_SUBST_ARQUIVOS = 500
const MAX_SUBST_OCORRENCIAS = 5000
const MAX_BYTES_SUBST = 2 * 1024 * 1024

/**
 * Substitui texto em arquivos do projeto. Com `previa: true` apenas conta
 * ocorrencias/arquivos, sem gravar nada.
 */
export function substituirConteudo(
  raiz: string,
  query: string,
  substituicao: string,
  opcoes: { regex?: boolean; previa?: boolean; extensoes?: string[] } = {}
): {
  ok: boolean
  previa?: boolean
  arquivos: number
  ocorrencias: number
  alterados?: number
  itens?: { rel: string; ocorrencias: number }[]
  erro?: string
} {
  const seg = caminhoSeguro(raiz, raiz)
  if (!seg.ok) return { ok: false, arquivos: 0, ocorrencias: 0, erro: seg.erro }
  if (!existsSync(seg.abs)) return { ok: false, arquivos: 0, ocorrencias: 0, erro: 'raiz inexistente' }
  const q = query || ''
  if (!q) return { ok: false, arquivos: 0, ocorrencias: 0, erro: 'consulta vazia' }

  let re: RegExp | null = null
  if (opcoes.regex) {
    try {
      re = new RegExp(q, 'gi')
    } catch (e) {
      return {
        ok: false,
        arquivos: 0,
        ocorrencias: 0,
        erro: 'regex invalida: ' + String((e as Error).message || e)
      }
    }
  }

  const arquivos: string[] = []
  walkArquivos(seg.abs, arquivos, 0)

  let totalArquivos = 0
  let totalOcorrencias = 0
  let alterados = 0
  const itens: { rel: string; ocorrencias: number }[] = []

  for (const full of arquivos) {
    if (totalArquivos >= MAX_SUBST_ARQUIVOS) break
    if (opcoes.extensoes && opcoes.extensoes.length) {
      const ext = extname(full).toLowerCase()
      if (!opcoes.extensoes.includes(ext)) continue
    }
    try {
      const st = statSync(full)
      if (st.size > MAX_BYTES_SUBST) continue
      const buf = readFileSync(full)
      if (buf.includes(0)) continue
      const txt = buf.toString('utf8')
      let novo = txt
      let n = 0
      if (re) {
        re.lastIndex = 0
        const matches = txt.match(re)
        n = matches ? matches.length : 0
        if (n) novo = txt.replace(re, substituicao)
      } else {
        n = txt.split(q).length - 1
        if (n) novo = txt.split(q).join(substituicao)
      }
      if (!n) continue
      totalArquivos++
      totalOcorrencias += n
      itens.push({ rel: relative(seg.abs, full).replace(/\\/g, '/'), ocorrencias: n })
      if (!opcoes.previa) {
        const guard = caminhoSeguro(full, seg.abs)
        if (!guard.ok) continue
        writeFileSync(guard.abs, novo, 'utf8')
        alterados++
      }
      if (totalOcorrencias >= MAX_SUBST_OCORRENCIAS) break
    } catch {
      /* arquivo ilegivel: segue */
    }
  }

  return {
    ok: true,
    previa: !!opcoes.previa,
    arquivos: totalArquivos,
    ocorrencias: totalOcorrencias,
    alterados: opcoes.previa ? undefined : alterados,
    itens: itens.slice(0, 200)
  }
}
