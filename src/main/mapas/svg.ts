/**
 * Renderiza um mapa mental como SVG (layout horizontal em árvore).
 * Saída pura — sem I/O — para testes e para exportação PNG via captura HTML.
 */
import { contarNos, profundidadeMax, type NoMapa } from './outline'

export type OpcoesSvgMapa = {
  titulo?: string
  fundo?: string
  maxCaracteres?: number
}

export type ResultadoSvgMapa = {
  svg: string
  largura: number
  altura: number
  nos: number
  profundidade: number
}

type Medida = { linhas: string[]; largura: number; altura: number }
type NoLayout = {
  no: NoMapa
  nivel: number
  x: number
  y: number
  w: number
  h: number
  linhas: string[]
  alturaSub: number
}

const PAD = 32
const GAP_X = 58
const GAP_Y = 14
const FONTE = 13
const CHAR_W = 7.3

const PALETA = [
  { fundo: '#2f5fd0', texto: '#ffffff', borda: '#22489e' },
  { fundo: '#e8f0ff', texto: '#17233a', borda: '#b7cdf5' },
  { fundo: '#e9f7ee', texto: '#17233a', borda: '#bfe3cb' },
  { fundo: '#fff2e0', texto: '#17233a', borda: '#f0d3a8' },
  { fundo: '#f1e9ff', texto: '#17233a', borda: '#d5c2f7' },
  { fundo: '#e6f6fb', texto: '#17233a', borda: '#b9e2ee' }
]

function escaparXml(t: string): string {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function quebrarTexto(texto: string, maxCaracteres: number): string[] {
  const palavras = String(texto || '').split(/\s+/).filter(Boolean)
  if (!palavras.length) return ['sem título']
  const linhas: string[] = []
  let atual = ''
  for (const palavra of palavras) {
    const cand = atual ? atual + ' ' + palavra : palavra
    if (cand.length <= maxCaracteres) {
      atual = cand
      continue
    }
    if (atual) linhas.push(atual)
    atual = palavra
    while (atual.length > maxCaracteres) {
      linhas.push(atual.slice(0, maxCaracteres))
      atual = atual.slice(maxCaracteres)
    }
  }
  if (atual) linhas.push(atual)
  const limite = 3
  if (linhas.length > limite) {
    linhas.length = limite
    const ultima = linhas[limite - 1]
    linhas[limite - 1] = ultima.slice(0, Math.max(1, maxCaracteres - 1)) + '…'
  }
  return linhas
}

function medir(texto: string, maxCaracteres: number): Medida {
  const linhas = quebrarTexto(texto, maxCaracteres)
  const maior = linhas.reduce((m, l) => Math.max(m, l.length), 0)
  const largura = Math.min(250, Math.max(96, Math.round(maior * CHAR_W + 28)))
  const altura = Math.max(36, linhas.length * (FONTE + 4) + 16)
  return { linhas, largura, altura }
}

export function svgMapa(raiz: NoMapa, opcoes: OpcoesSvgMapa = {}): ResultadoSvgMapa {
  const maxCaracteres = Math.max(12, Math.min(60, opcoes.maxCaracteres ?? 26))
  const medidas = new Map<NoMapa, Medida>()
  const medirNo = (no: NoMapa) => {
    const m = medir(no.texto, maxCaracteres)
    medidas.set(no, m)
    for (const f of no.filhos) medirNo(f)
  }
  medirNo(raiz)

  const alturaSub = new Map<NoMapa, number>()
  const calcularAltura = (no: NoMapa): number => {
    const propria = medidas.get(no)!.altura
    if (!no.filhos.length) {
      alturaSub.set(no, propria)
      return propria
    }
    const filhos = no.filhos.map(calcularAltura)
    const soma = filhos.reduce((a, b) => a + b, 0) + GAP_Y * (filhos.length - 1)
    const total = Math.max(propria, soma)
    alturaSub.set(no, total)
    return total
  }
  calcularAltura(raiz)

  const larguraPorNivel: number[] = []
  const coletarLarguras = (no: NoMapa, nivel: number) => {
    const l = medidas.get(no)!.largura
    larguraPorNivel[nivel] = Math.max(larguraPorNivel[nivel] || 0, l)
    for (const f of no.filhos) coletarLarguras(f, nivel + 1)
  }
  coletarLarguras(raiz, 0)
  const xPorNivel: number[] = []
  for (let i = 0; i < larguraPorNivel.length; i++) {
    xPorNivel[i] = i === 0 ? PAD : xPorNivel[i - 1] + larguraPorNivel[i - 1] + GAP_X
  }

  const nos: NoLayout[] = []
  const posicionar = (no: NoMapa, nivel: number, topo: number) => {
    const m = medidas.get(no)!
    const altura = alturaSub.get(no)!
    const x = xPorNivel[nivel]
    const y = topo + altura / 2
    nos.push({
      no,
      nivel,
      x,
      y,
      w: m.largura,
      h: m.altura,
      linhas: m.linhas,
      alturaSub: altura
    })
    if (!no.filhos.length) return
    const alturas = no.filhos.map((f) => alturaSub.get(f)!)
    const total = alturas.reduce((a, b) => a + b, 0) + GAP_Y * (no.filhos.length - 1)
    let cursor = topo + (altura - total) / 2
    for (const filho of no.filhos) {
      posicionar(filho, nivel + 1, cursor)
      cursor += alturaSub.get(filho)! + GAP_Y
    }
  }
  posicionar(raiz, 0, PAD)

  const largura = Math.ceil(
    nos.reduce((m, n) => Math.max(m, n.x + n.w), 0) + PAD
  )
  const altura = Math.ceil(alturaSub.get(raiz)! + PAD * 2)

  const partes: string[] = []
  partes.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}" font-family="Inter, Segoe UI, system-ui, sans-serif">`
  )
  const fundo = opcoes.fundo ?? '#ffffff'
  if (fundo) {
    partes.push(`<rect x="0" y="0" width="${largura}" height="${altura}" fill="${escaparXml(fundo)}"/>`)
  }

  const porNo = new Map(nos.map((n) => [n.no, n]))
  const arestas: string[] = []
  const ligar = (pai: NoLayout) => {
    for (const filhoNo of pai.no.filhos) {
      const filho = porNo.get(filhoNo)!
      const x1 = pai.x + pai.w
      const y1 = pai.y
      const x2 = filho.x
      const y2 = filho.y
      const mx = x1 + Math.max(18, (x2 - x1) / 2)
      arestas.push(
        `<path d="M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}" fill="none" stroke="#9aa7bd" stroke-width="1.6" stroke-linecap="round"/>`
      )
      ligar(filho)
    }
  }
  ligar(nos[0])

  partes.push('<g data-camada="arestas">', ...arestas, '</g>')
  partes.push('<g data-camada="nos">')
  for (const n of nos) {
    const cor = PALETA[n.nivel % PALETA.length]
    const x = Math.round(n.x)
    const topo = Math.round(n.y - n.h / 2)
    partes.push(`<g data-nivel="${n.nivel}">`)
    partes.push(
      `<rect x="${x}" y="${topo}" width="${n.w}" height="${Math.round(n.h)}" rx="10" fill="${cor.fundo}" stroke="${cor.borda}" stroke-width="1.2"/>`
    )
    const inicioTexto = topo + (n.h - n.linhas.length * (FONTE + 4)) / 2 + FONTE
    partes.push(
      `<text x="${x + n.w / 2}" y="${Math.round(inicioTexto)}" fill="${cor.texto}" font-size="${FONTE}" text-anchor="middle">`
    )
    n.linhas.forEach((linha, i) => {
      partes.push(
        `<tspan x="${x + n.w / 2}" dy="${i === 0 ? 0 : FONTE + 4}">${escaparXml(linha)}</tspan>`
      )
    })
    partes.push('</text></g>')
  }
  partes.push('</g>')

  if (opcoes.titulo) {
    partes.push(
      `<text x="${PAD}" y="${altura - 10}" fill="#68738a" font-size="11">${escaparXml(opcoes.titulo)}</text>`
    )
  }
  partes.push('</svg>')

  return {
    svg: partes.join('\n'),
    largura,
    altura,
    nos: contarNos(raiz),
    profundidade: profundidadeMax(raiz)
  }
}
