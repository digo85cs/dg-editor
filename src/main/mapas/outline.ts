/**
 * Mapa mental a partir de outline Markdown indentado (estilo MindNode).
 *
 * Formato de origem (também serve de armazenamento):
 *   - Raiz
 *     - Filho
 *       - Neto
 */

export type NoMapa = {
  texto: string
  filhos: NoMapa[]
}

const RE_MARCADOR = /^(?:[-*+]|\d+[.)])\s+/

export function limparTextoMapa(bruto: string): string {
  let t = String(bruto || '').trim()
  t = t.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, alvo: string, disp?: string) =>
    String(disp || alvo).trim()
  )
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  t = t.replace(/`([^`]+)`/g, '$1')
  t = t.replace(/(\*\*|__)(.*?)\1/g, '$2')
  t = t.replace(/(^|[\s(])([*_])([^*_]+)\2/g, '$1$3')
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

type LinhaOutline = { nivel: number; texto: string }

function linhasComNivel(texto: string): LinhaOutline[] {
  const brutas: { indent: number; texto: string }[] = []
  for (const original of String(texto || '').replace(/\r\n?/g, '\n').split('\n')) {
    if (!original.trim()) continue
    const m = /^([ \t]*)(.*)$/.exec(original)!
    let indent = 0
    for (const ch of m[1]) indent += ch === '\t' ? 4 : 1
    let corpo = m[2].trim()
    corpo = corpo.replace(/^#{1,6}\s+/, '')
    corpo = corpo.replace(RE_MARCADOR, '')
    const limpo = limparTextoMapa(corpo)
    if (!limpo) continue
    brutas.push({ indent, texto: limpo })
  }
  if (!brutas.length) return []

  const distintos = [...new Set(brutas.map((b) => b.indent).filter((i) => i > 0))].sort(
    (a, b) => a - b
  )
  const unidade = distintos[0] || 2
  return brutas.map((b) => ({
    nivel: Math.max(0, Math.round(b.indent / unidade)),
    texto: b.texto
  }))
}

export function parseOutline(texto: string): NoMapa | null {
  const linhas = linhasComNivel(texto)
  if (!linhas.length) return null
  const raizes: NoMapa[] = []
  const pilha: { nivel: number; no: NoMapa }[] = []
  for (const linha of linhas) {
    const no: NoMapa = { texto: linha.texto, filhos: [] }
    while (pilha.length && pilha[pilha.length - 1].nivel >= linha.nivel) pilha.pop()
    if (!pilha.length) raizes.push(no)
    else pilha[pilha.length - 1].no.filhos.push(no)
    pilha.push({ nivel: linha.nivel, no })
  }
  if (raizes.length === 1) return raizes[0]
  return { texto: 'Mapa mental', filhos: raizes }
}

export function serializarOutline(raiz: NoMapa): string {
  const linhas: string[] = []
  const andar = (no: NoMapa, nivel: number) => {
    const texto = String(no.texto || '').replace(/\s+/g, ' ').trim() || 'sem título'
    linhas.push('  '.repeat(nivel) + '- ' + texto)
    for (const filho of no.filhos) andar(filho, nivel + 1)
  }
  andar(raiz, 0)
  return linhas.join('\n') + '\n'
}

export function contarNos(raiz: NoMapa): number {
  let total = 1
  for (const f of raiz.filhos) total += contarNos(f)
  return total
}

export function profundidadeMax(raiz: NoMapa): number {
  let maior = 0
  for (const f of raiz.filhos) maior = Math.max(maior, profundidadeMax(f))
  return maior + 1
}
