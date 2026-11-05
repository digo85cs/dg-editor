/**
 * Indexação simples de símbolos (funções/classes/tipos) sem tree-sitter pesado
 * 100% local
 */
import { readFileSync, existsSync } from 'fs'
import { join, relative } from 'path'
import { buscaArquivos } from './busca'

export type Simbolo = {
  nome: string
  tipo: 'function' | 'class' | 'interface' | 'type' | 'const' | 'method'
  arquivo: string
  rel: string
  linha: number
}

const cache = new Map<string, Simbolo[]>()

function extrairDeArquivo(raiz: string, arquivo: string): Simbolo[] {
  if (!existsSync(arquivo)) return []
  try {
    const txt = readFileSync(arquivo, 'utf8')
    const rel = relative(raiz, arquivo).replace(/\\/g, '/')
    const syms: Simbolo[] = []
    const linhas = txt.split(/\r?\n/)
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i]
      // function name(
      let m = l.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/)
      if (m) syms.push({ nome: m[1], tipo: 'function', arquivo, rel, linha: i + 1 })
      // const name = function / const name = () =>
      m = l.match(/^\s*(?:export\s+)?const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/)
      if (m && !syms.find(s => s.nome === m![1] && s.linha === i + 1)) syms.push({ nome: m[1], tipo: 'function', arquivo, rel, linha: i + 1 })
      // class Name
      m = l.match(/^\s*(?:export\s+)?class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/)
      if (m) syms.push({ nome: m[1], tipo: 'class', arquivo, rel, linha: i + 1 })
      // interface Name
      m = l.match(/^\s*(?:export\s+)?interface\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/)
      if (m) syms.push({ nome: m[1], tipo: 'interface', arquivo, rel, linha: i + 1 })
      // type Name =
      m = l.match(/^\s*(?:export\s+)?type\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/)
      if (m) syms.push({ nome: m[1], tipo: 'type', arquivo, rel, linha: i + 1 })
    }
    return syms
  } catch {
    return []
  }
}

export async function indexarSimbolos(raiz: string, forcar = false): Promise<Simbolo[]> {
  if (!forcar && cache.has(raiz)) return cache.get(raiz)!
  const r = buscaArquivos(raiz, '', 4000)
  const itens = r.itens || []
  const todos: Simbolo[] = []
  for (const it of itens) {
    if (!/\.(ts|js|tsx|jsx)$/i.test(it.caminho)) continue
    todos.push(...extrairDeArquivo(raiz, it.caminho))
    if (todos.length > 5000) break
  }
  cache.set(raiz, todos)
  return todos
}

export function buscarSimbolo(raiz: string, nome: string): Simbolo[] {
  const lista = cache.get(raiz) || []
  const q = nome.toLowerCase()
  return lista.filter(s => s.nome.toLowerCase().includes(q)).slice(0, 30)
}

export function limparCacheSimbolos(raiz?: string) {
  if (raiz) cache.delete(raiz)
  else cache.clear()
}
