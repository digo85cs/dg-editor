/**
 * Mapa do repositório estilo aider: lista arquivos de código com os
 * símbolos exportados principais, dentro de um orçamento fixo de texto.
 * A relevância é aproximada (abas abertas e arquivos recentes primeiro);
 * o ranking fino por grafo de dependências fica para iteração futura.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, sep } from 'path'

const EXT_CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|cs|rb|php|swift|vue|svelte)$/i
const IGNORAR_DIR = new Set([
  'node_modules', '.git', 'dist', 'out', 'build', 'coverage', '.next',
  '.nuxt', 'target', 'vendor', '__pycache__', '.venv', 'venv', 'Pods',
  '.idea', '.vscode', 'qa-artifacts', 'tmp', 'dist-app', 'dist-apps',
  'resources'
])
const MAX_ARQUIVOS = 600
const MAX_SIMBOLOS_POR_ARQUIVO = 8
const MAX_BYTES_MAPA = 7000

const RE_SIMBOLO =
  /(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function\*?|class|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)|^\s*(?:def|func|fn|class|struct|interface)\s+([A-Za-z_][\w]*)/gm

function extrairSimbolos(src: string): string[] {
  const out: string[] = []
  let m: RegExpExecArray | null
  RE_SIMBOLO.lastIndex = 0
  while ((m = RE_SIMBOLO.exec(src)) && out.length < MAX_SIMBOLOS_POR_ARQUIVO) {
    const nome = m[1] || m[2]
    if (nome && nome.length >= 3 && !out.includes(nome)) out.push(nome)
  }
  return out
}

function varrer(raiz: string, acc: { arq: string; mtime: number }[], profundidade: number) {
  if (acc.length >= MAX_ARQUIVOS || profundidade > 8) return
  let entradas
  try {
    entradas = readdirSync(raiz, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entradas) {
    if (acc.length >= MAX_ARQUIVOS) return
    if (e.isDirectory()) {
      if (!IGNORAR_DIR.has(e.name) && !e.name.startsWith('.dg-')) {
        varrer(join(raiz, e.name), acc, profundidade + 1)
      }
    } else if (e.isFile() && EXT_CODE.test(e.name)) {
      try {
        const p = join(raiz, e.name)
        acc.push({ arq: p, mtime: statSync(p).mtimeMs })
      } catch {
        /* */
      }
    }
  }
}

// Cache por raiz: re-varre só quando a assinatura (qtde + mtime máx) muda.
const cache = new Map<string, { assinatura: string; mapa: string }>()

/**
 * Monta o mapa do repositório. `prioritarios` recebe caminhos absolutos
 * que devem aparecer primeiro (abas abertas, arquivos da tarefa).
 */
export function mapaRepositorio(raiz: string, prioritarios: string[] = []): string {
  if (!raiz || !existsSync(raiz)) return ''
  const achados: { arq: string; mtime: number }[] = []
  varrer(raiz, achados, 0)
  if (!achados.length) return ''
  achados.sort((a, b) => a.arq.localeCompare(b.arq))
  const assinatura =
    achados.length + ':' + Math.max(...achados.map((a) => a.mtime)).toFixed(0)
  const hit = cache.get(raiz)
  if (hit && hit.assinatura === assinatura) return hit.mapa

  const linhas: { rel: string; texto: string; prio: number }[] = []
  const priSet = new Set(prioritarios.map((p) => p.replace(/\\/g, '/')))
  for (const { arq } of achados) {
    let src = ''
    try {
      const st = statSync(arq)
      if (st.size > 400_000) continue
      src = readFileSync(arq, 'utf8')
    } catch {
      continue
    }
    const simbolos = extrairSimbolos(src)
    if (!simbolos.length) continue
    const rel = relative(raiz, arq).split(sep).join('/')
    const prio = priSet.has(rel) || priSet.has(arq.replace(/\\/g, '/')) ? 0 : 1
    linhas.push({ rel, texto: rel + ': ' + simbolos.join(', '), prio })
  }
  linhas.sort((a, b) => a.prio - b.prio || a.rel.localeCompare(b.rel))

  let out = '### Mapa do repositório (símbolos por arquivo)\n'
  let bytes = out.length
  for (const l of linhas) {
    if (bytes + l.texto.length + 1 > MAX_BYTES_MAPA) break
    out += l.texto + '\n'
    bytes += l.texto.length + 1
  }
  if (linhas.length && bytes >= MAX_BYTES_MAPA) {
    out += '… (' + linhas.length + ' arquivos mapeados, truncado)\n'
  }
  cache.set(raiz, { assinatura, mapa: out })
  if (cache.size > 20) cache.delete(cache.keys().next().value as string)
  return out
}
