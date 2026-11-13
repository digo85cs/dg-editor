/**
 * Minimapa leve do editor (canvas, sem dependencias).
 * Desenha a densidade de cada linha, destaca o viewport e permite
 * clicar/arrastar/rolar para navegar no documento.
 */
import { EditorView } from '@codemirror/view'
import { resumoLinha, linhaPorFracao } from './minimap-math.js'

const LARGURA = 76
const COLUNAS = 120
const MAX_AMOSTRAS = 4000

export { resumoLinha, linhaPorFracao }

function amostrarLinhas(doc) {
  const total = doc.lines
  const passo = Math.max(1, Math.ceil(total / MAX_AMOSTRAS))
  const out = []
  for (let n = 1; n <= total; n += passo) {
    const r = resumoLinha(doc.line(n).text)
    out.push({ n, indent: r.indent, len: r.len })
  }
  return out
}

export function anexarMinimapa(view, { temaEscuro } = {}) {
  const host = view.dom
  if (!host) return { alternar() {}, visivel: () => false, destroy() {}, redesenhar() {} }

  let el = host.querySelector('.dg-minimapa')
  if (!el) {
    el = document.createElement('canvas')
    el.className = 'dg-minimapa'
    el.setAttribute('aria-label', 'Minimapa do documento')
    el.setAttribute('role', 'img')
    el.title = 'Minimapa — clique ou arraste para navegar'
    host.appendChild(el)
  }
  const canvas = el
  const ctx = canvas.getContext('2d')
  let raf = 0
  let amostras = null
  let docRef = null
  let arrastando = false

  const eEscuro = () => (typeof temaEscuro === 'function' ? !!temaEscuro() : true)

  function medir() {
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    const w = LARGURA
    const h = Math.max(40, Math.floor(host.clientHeight || 0))
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    return { w, h }
  }

  function desenhar() {
    if (!ctx || canvas.hidden) return
    const { w, h } = medir()
    const doc = view.state.doc
    if (docRef !== doc) {
      amostras = amostrarLinhas(doc)
      docRef = doc
    }
    const escuro = eEscuro()
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = escuro ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.03)'
    ctx.fillRect(0, 0, w, h)

    const total = doc.lines
    const passoY = h / total
    const ink = escuro ? 'rgba(224,232,240,0.34)' : 'rgba(40,48,56,0.38)'
    ctx.fillStyle = ink
    const alt = Math.max(1, Math.min(3, passoY))
    for (const a of amostras || []) {
      if (!a.len) continue
      const x = Math.min(w - 3, (a.indent / COLUNAS) * w)
      const largura = Math.max(1, Math.min(w - x - 1, (a.len / COLUNAS) * w))
      ctx.fillRect(x, (a.n - 1) * passoY, largura, alt)
    }

    let de = 1
    let ate = 1
    try {
      de = doc.lineAt(view.viewport.from).number
      ate = doc.lineAt(view.viewport.to).number
    } catch {
      /* viewport em transicao */
    }
    const y = ((de - 1) / total) * h
    const hh = Math.max(8, Math.min(h, ((ate - de + 1) / total) * h))
    ctx.fillStyle = escuro ? 'rgba(88,166,255,0.17)' : 'rgba(9,105,218,0.13)'
    ctx.fillRect(0, y, w, hh)
    ctx.strokeStyle = escuro ? 'rgba(88,166,255,0.5)' : 'rgba(9,105,218,0.4)'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, Math.min(h - 1, y) + 0.5, w - 1, Math.max(1, Math.min(hh, h - y) - 1))
  }

  function agendar() {
    if (canvas.hidden) return
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      desenhar()
    })
  }

  function irParaY(clientY) {
    const r = canvas.getBoundingClientRect()
    const frac = (clientY - r.top) / Math.max(1, r.height)
    const ln = linhaPorFracao(frac, view.state.doc.lines)
    const pos = view.state.doc.line(ln).from
    view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) })
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    arrastando = true
    canvas.setPointerCapture?.(e.pointerId)
    irParaY(e.clientY)
    e.preventDefault()
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!arrastando) return
    irParaY(e.clientY)
  })
  const soltar = (e) => {
    if (!arrastando) return
    arrastando = false
    canvas.releasePointerCapture?.(e.pointerId)
  }
  canvas.addEventListener('pointerup', soltar)
  canvas.addEventListener('pointercancel', soltar)
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      view.scrollDOM.scrollTop += e.deltaY
    },
    { passive: false }
  )

  const ro = new ResizeObserver(agendar)
  ro.observe(host)
  view.scrollDOM.addEventListener('scroll', agendar, { passive: true })

  function visivel() {
    return !canvas.hidden
  }
  function alternar(mostrar) {
    const on = mostrar === undefined ? canvas.hidden : !!mostrar
    canvas.hidden = !on
    host.style.setProperty('--dg-editor-pad-right', on ? '100px' : '14px')
    if (on) agendar()
    return on
  }
  canvas.hidden = true
  host.style.setProperty('--dg-editor-pad-right', '14px')

  function redesenhar() {
    docRef = null
    agendar()
  }

  function destroy() {
    if (raf) cancelAnimationFrame(raf)
    ro.disconnect()
    view.scrollDOM.removeEventListener('scroll', agendar)
    canvas.remove()
  }

  return { alternar, visivel, destroy, redesenhar, atualizar: agendar, elemento: canvas }
}
