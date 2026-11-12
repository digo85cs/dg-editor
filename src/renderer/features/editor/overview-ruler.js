/**
 * Overview ruler estilo Cursor: faixa fina a direita com ticks
 * (cursor, selecao, busca, diff/git, alteracoes locais).
 */
import { EditorView } from '@codemirror/view'
import { getSearchQuery, searchPanelOpen } from '@codemirror/search'

const CORES = {
  conteudo: 'rgba(140, 140, 150, 0.55)',
  cursor: '#ffffff',
  selecao: 'rgba(255, 255, 255, 0.85)',
  busca: 'rgba(234, 179, 8, 0.95)',
  add: 'rgba(61, 214, 140, 0.95)',
  del: 'rgba(248, 81, 73, 0.95)',
  mudado: 'rgba(88, 166, 255, 0.9)',
  ia: 'rgba(163, 113, 247, 0.95)'
}

function lineAtY(el, y, totalLines) {
  const rect = el.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (y - rect.top) / Math.max(1, rect.height)))
  return Math.max(1, Math.min(totalLines, Math.round(ratio * (totalLines - 1)) + 1))
}

function yForLine(line, totalLines, height) {
  if (totalLines <= 1) return 0
  return ((line - 1) / (totalLines - 1)) * Math.max(0, height - 2)
}

function coletarBusca(state) {
  const linhas = new Set()
  try {
    if (!searchPanelOpen(state)) return linhas
    const q = getSearchQuery(state)
    if (!q || !q.valid || !String(q.search || '').length) return linhas
    const cursor = q.getCursor(state.doc)
    let n = 0
    for (let item = cursor.next(); !item.done; item = cursor.next()) {
      const line = state.doc.lineAt(item.value.from).number
      linhas.add(line)
      if (++n > 800) break
    }
  } catch {
    /* search opcional */
  }
  return linhas
}

function linhasAlteradas(doc, salvo) {
  const out = new Set()
  if (salvo == null) return out
  const a = String(salvo).split(/\n/)
  const lines = doc.lines
  const max = Math.max(a.length, lines)
  for (let i = 0; i < max; i++) {
    const atual = i < lines ? doc.line(i + 1).text : null
    const ant = i < a.length ? a[i] : null
    if (atual !== ant) out.add(i + 1)
  }
  return out
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{ getSalvo?: () => string, getDiff?: () => { del?: number[], add?: number[], ia?: number[] } }} opts
 */
export function anexarOverviewRuler(view, opts = {}) {
  const host = view.dom
  if (!host) return { destroy() {}, refresh() {}, setDiff() {} }

  let el = host.querySelector('.dg-overview-ruler')
  if (!el) {
    el = document.createElement('div')
    el.className = 'dg-overview-ruler'
    el.setAttribute('role', 'navigation')
    el.setAttribute('aria-label', 'Visao geral do arquivo')
    el.title = 'Visao geral — clique para ir a linha'
    host.appendChild(el)
  }

  let diff = { del: [], add: [], ia: [] }
  let tip = null

  function garantirTip() {
    if (tip) return tip
    tip = document.createElement('div')
    tip.className = 'dg-overview-tip'
    tip.hidden = true
    document.body.appendChild(tip)
    return tip
  }

  function setDiff(parcial) {
    diff = {
      del: parcial?.del || [],
      add: parcial?.add || [],
      ia: parcial?.ia || []
    }
    refresh()
  }

  function refresh() {
    const state = view.state
    const doc = state.doc
    const total = Math.max(1, doc.lines)
    const height = el.clientHeight || host.clientHeight || 1
    const ticks = []

    const passo = Math.max(1, Math.ceil(total / 48))
    for (let ln = 1; ln <= total; ln += passo) {
      const text = doc.line(ln).text
      if (!text.trim()) continue
      ticks.push({ line: ln, kind: 'conteudo', label: 'Conteudo · L' + ln })
    }

    const salvo = typeof opts.getSalvo === 'function' ? opts.getSalvo() : null
    for (const ln of linhasAlteradas(doc, salvo)) {
      ticks.push({ line: ln, kind: 'mudado', label: 'Alterado · L' + ln })
    }

    for (const ln of diff.del || []) {
      ticks.push({ line: ln, kind: 'del', label: 'Removido / git - · L' + ln })
    }
    for (const ln of diff.add || []) {
      ticks.push({ line: ln, kind: 'add', label: 'Adicionado / git + · L' + ln })
    }
    for (const ln of diff.ia || []) {
      ticks.push({ line: ln, kind: 'ia', label: 'Proposta IA · L' + ln })
    }

    for (const ln of coletarBusca(state)) {
      ticks.push({ line: ln, kind: 'busca', label: 'Busca · L' + ln })
    }

    const sel = state.selection.main
    if (!sel.empty) {
      const from = doc.lineAt(sel.from).number
      const to = doc.lineAt(sel.to).number
      for (let ln = from; ln <= to; ln++) {
        ticks.push({ line: ln, kind: 'selecao', label: 'Selecao · L' + ln })
      }
    }

    const cursorLine = doc.lineAt(sel.head).number
    ticks.push({ line: cursorLine, kind: 'cursor', label: 'Cursor · L' + cursorLine })

    const prio = { conteudo: 1, mudado: 2, busca: 3, add: 4, del: 4, ia: 4, selecao: 5, cursor: 6 }
    const porLinha = new Map()
    for (const t of ticks) {
      const prev = porLinha.get(t.line)
      if (!prev || (prio[t.kind] || 0) >= (prio[prev.kind] || 0)) porLinha.set(t.line, t)
    }

    const frag = document.createDocumentFragment()
    for (const t of porLinha.values()) {
      const mark = document.createElement('button')
      mark.type = 'button'
      mark.className = 'dg-overview-tick dg-overview-tick--' + t.kind
      mark.style.top = yForLine(t.line, total, height) + 'px'
      mark.style.background = CORES[t.kind] || CORES.conteudo
      mark.dataset.line = String(t.line)
      mark.dataset.kind = t.kind
      mark.setAttribute('aria-label', t.label)
      mark.title = t.label
      frag.appendChild(mark)
    }
    el.replaceChildren(frag)
  }

  function irParaLinha(ln) {
    const doc = view.state.doc
    const line = doc.line(Math.max(1, Math.min(doc.lines, ln)))
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: 'center' })
    })
    view.focus()
  }

  function onClick(ev) {
    const target = ev.target
    if (target && target.classList && target.classList.contains('dg-overview-tick')) {
      irParaLinha(Number(target.dataset.line) || 1)
      return
    }
    irParaLinha(lineAtY(el, ev.clientY, view.state.doc.lines))
  }

  function onMove(ev) {
    const ln = lineAtY(el, ev.clientY, view.state.doc.lines)
    const t = garantirTip()
    t.hidden = false
    t.textContent = 'L' + ln
    t.style.left = Math.min(window.innerWidth - 48, ev.clientX - 28) + 'px'
    t.style.top = Math.max(8, ev.clientY - 22) + 'px'
  }

  function onLeave() {
    if (tip) tip.hidden = true
  }

  el.addEventListener('click', onClick)
  el.addEventListener('mousemove', onMove)
  el.addEventListener('mouseleave', onLeave)

  let raf = 0
  function schedule() {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      refresh()
    })
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
  if (ro) ro.observe(host)
  schedule()

  return {
    refresh: schedule,
    setDiff,
    destroy() {
      el.removeEventListener('click', onClick)
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
      if (ro) ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
      if (tip) tip.remove()
      el.remove()
    }
  }
}
