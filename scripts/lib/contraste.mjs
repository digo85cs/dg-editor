/**
 * Núcleo do verificador de contraste: leitura de blocos CSS, resolução de
 * var(), luminância WCAG e comparação de pares. Sem efeitos colaterais para
 * permitir testes unitários.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

export const LIMITE_TEXTO = 4.5
export const LIMITE_NAO_TEXTO = 3

/** @param {string} corpo */
export function parseVars(corpo) {
  const vars = {}
  for (const m of String(corpo || '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars[m[1]] = m[2].trim()
  }
  return vars
}

/**
 * Lê o primeiro bloco CSS cujo seletor casa com `inicio`.
 * @param {string} raiz
 * @param {string} arquivo
 * @param {RegExp} inicio
 * @param {Record<string,string>} [fallback]
 */
export function lerBlocoCss(raiz, arquivo, inicio, fallback) {
  const css = readFileSync(join(raiz, arquivo), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '')
  const i = css.search(inicio)
  if (i < 0) return {}
  const abre = css.indexOf('{', i)
  const fecha = css.indexOf('}', abre)
  if (abre < 0 || fecha < 0) return {}
  const vars = parseVars(css.slice(abre + 1, fecha))
  return fallback ? { ...fallback, ...vars } : vars
}

/**
 * Resolve var(--x) recursivamente dentro de `vars` (ou `fallback`).
 * @param {Record<string,string>} vars
 * @param {string} valor
 * @param {Record<string,string>} [fallback]
 * @param {Set<string>} [pilha]
 */
export function resolver(vars, valor, fallback, pilha = new Set()) {
  const v = String(valor || '').trim()
  const m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/)
  if (!m) return v
  const nome = m[1]
  if (pilha.has(nome)) return null
  const fonte = vars?.[nome] != null ? vars : fallback?.[nome] != null ? fallback : null
  if (fonte) {
    const prox = new Set(pilha)
    prox.add(nome)
    return resolver(fonte, fonte[nome], fallback, prox)
  }
  if (m[2]) return resolver(vars, m[2], fallback, pilha)
  return null
}

/** @param {string} valor */
export function hexDe(valor) {
  const v = String(valor || '').trim()
  if (/^#[0-9a-f]{6}$/i.test(v)) return v
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    return '#' + v.slice(1).split('').map((c) => c + c).join('')
  }
  return null
}

/** @param {string} hex */
export function luminancia(hex) {
  const c = hex.slice(1)
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
  const lin = (x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Razão de contraste WCAG entre dois hex. @param {string} a @param {string} b */
export function contraste(a, b) {
  const l1 = luminancia(a)
  const l2 = luminancia(b)
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Avalia pares declarativos sobre um conjunto de variáveis.
 * Pares sem cor resolvível (ex.: token ainda não definido) são ignorados.
 * @param {Record<string,string>} vars
 * @param {Array<{ fg: string, bg: string, limite?: number }>} pares
 * @param {Record<string,string>} [fallback]
 */
export function avaliarPares(vars, pares, fallback) {
  const out = []
  for (const par of pares) {
    const fg = hexDe(resolver(vars, vars?.[par.fg], fallback))
    const bg = hexDe(resolver(vars, vars?.[par.bg], fallback))
    if (!fg || !bg) continue
    const limite = par.limite != null ? par.limite : LIMITE_TEXTO
    const razao = Math.round(contraste(fg, bg) * 100) / 100
    out.push({ fg: par.fg, bg: par.bg, razao, limite, ok: razao >= limite })
  }
  return out
}
