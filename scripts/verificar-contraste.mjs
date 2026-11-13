/**
 * Regressão de contraste WCAG AA dos tokens de tema.
 * Lê src/renderer/styles/tokens.css (+ overrides de alto contraste em
 * styles.css) e falha quando um par texto/fundo fica abaixo de 4.5:1.
 *
 * Uso: node scripts/verificar-contraste.mjs [--json]
 */
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { LIMITE_NAO_TEXTO, LIMITE_TEXTO, avaliarPares, lerBlocoCss } from './lib/contraste.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIMITE = LIMITE_TEXTO

let varsClaro
let varsEscuro
let overridesClaro
let overridesEscuro
try {
  varsClaro = lerBlocoCss(raiz, 'src/renderer/styles/tokens.css', /:root,\s*\nbody\.tema-claro\s*\{/)
  varsEscuro = lerBlocoCss(raiz, 'src/renderer/styles/tokens.css', /body\.tema-escuro\s*\{/, varsClaro)
  overridesClaro = lerBlocoCss(raiz, 'src/renderer/styles.css', /^\.dg-alto-contraste\s*\{/m)
  overridesEscuro = lerBlocoCss(
    raiz,
    'src/renderer/styles.css',
    /^body\.tema-escuro\.dg-alto-contraste\s*\{/m,
    overridesClaro
  )
} catch (e) {
  console.error('[contraste] falha ao ler tokens: ' + e.message)
  process.exit(1)
}

const TEMAS = [
  { nome: 'claro', vars: varsClaro, origem: () => 'tokens.css' },
  {
    nome: 'claro + alto contraste',
    vars: { ...varsClaro, ...overridesClaro },
    origem: (t) => (overridesClaro[t] != null ? 'styles.css' : 'tokens.css')
  },
  { nome: 'escuro', vars: varsEscuro, origem: () => 'tokens.css' },
  {
    nome: 'escuro + alto contraste',
    vars: { ...varsEscuro, ...overridesEscuro },
    origem: (t) => (overridesEscuro[t] != null ? 'styles.css' : 'tokens.css')
  }
]

const TEXTO_GERAL = [
  '--dg-text',
  '--dg-text-muted',
  '--dg-text-faint',
  '--dg-danger',
  '--dg-git-m',
  '--dg-git-a',
  '--dg-git-d',
  '--dg-git-outro'
]
const TEXTO_TERMINAL = [
  '--dg-term-black',
  '--dg-term-red',
  '--dg-term-green',
  '--dg-term-yellow',
  '--dg-term-blue',
  '--dg-term-magenta',
  '--dg-term-cyan',
  '--dg-term-white',
  '--dg-term-bright-black',
  '--dg-term-bright-red',
  '--dg-term-bright-green',
  '--dg-term-bright-yellow',
  '--dg-term-bright-blue',
  '--dg-term-bright-magenta',
  '--dg-term-bright-cyan',
  '--dg-term-bright-white'
]
const SUPERFICIES = ['--dg-bg', '--dg-surface', '--dg-sidebar']

const pares = []
for (const fg of TEXTO_GERAL) {
  for (const bg of SUPERFICIES) pares.push({ fg, bg, limite: LIMITE })
  // Hover: superfícies elevadas são usadas em :hover de itens de lista/menus.
  pares.push({ fg, bg: '--dg-surface-raised', limite: LIMITE })
}
pares.push({ fg: '--dg-placeholder', bg: '--dg-surface', limite: LIMITE })
// As 16 cores ANSI são texto sobre o fundo real do terminal.
for (const fg of TEXTO_TERMINAL) pares.push({ fg, bg: '--dg-bg', limite: LIMITE })
pares.push({ fg: '--dg-ink-on-accent', bg: '--dg-accent', limite: LIMITE })

// WCAG 1.4.11 (não-textual): anel de foco e estados desabilitados.
const paresNaoTexto = []
for (const bg of [...SUPERFICIES, '--dg-surface-raised']) {
  paresNaoTexto.push({ fg: '--dg-accent-brand', bg, limite: LIMITE_NAO_TEXTO })
}
for (const bg of ['--dg-disabled-surface', '--dg-surface-raised', ...SUPERFICIES]) {
  paresNaoTexto.push({ fg: '--dg-disabled-text', bg, limite: LIMITE_NAO_TEXTO })
}

const resultados = []
const falhas = []
for (const tema of TEMAS) {
  const itens = [...avaliarPares(tema.vars, pares), ...avaliarPares(tema.vars, paresNaoTexto)]
  for (const item of itens) {
    const origens = [...new Set([tema.origem(item.fg), tema.origem(item.bg)])]
    const linha = { tema: tema.nome, arquivo: origens.join(' + '), ...item }
    resultados.push(linha)
    if (!item.ok) falhas.push(linha)
  }
}

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify(
      { limite: LIMITE, limiteNaoTexto: LIMITE_NAO_TEXTO, total: resultados.length, falhas },
      null,
      2
    )
  )
} else {
  for (const r of falhas) {
    console.log(
      `  FALHA [${r.tema}] ${r.fg} sobre ${r.bg}: ${r.razao}:1 (< ${r.limite}:1) [${r.arquivo}]`
    )
  }
  if (falhas.length) {
    const porArquivo = new Map()
    for (const r of falhas) porArquivo.set(r.arquivo, (porArquivo.get(r.arquivo) || 0) + 1)
    console.log('  resumo por arquivo:')
    for (const [arquivo, qtd] of porArquivo) console.log(`    ${arquivo}: ${qtd} falha(s)`)
  }
  console.log(
    `verificar:contraste — ${resultados.length - falhas.length}/${resultados.length} pares AA` +
      (falhas.length ? `, ${falhas.length} abaixo do limite` : '')
  )
}
process.exit(falhas.length ? 1 : 0)
