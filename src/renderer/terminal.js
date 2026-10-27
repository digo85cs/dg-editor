/**
 * Painel de terminal inferior com abas múltiplas (xterm.js + node-pty via IPC).
 */
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

const LS_HEIGHT = 'dg-terminal-height'

function cssVar(name, fallback) {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim()
  return v || fallback
}

function temaXterm() {
  return {
    background: cssVar('--dg-bg', '#1a1a1a'),
    foreground: cssVar('--dg-text', '#f2f2f2'),
    cursor: cssVar('--dg-accent', '#2dd4a0'),
    cursorAccent: cssVar('--dg-bg', '#1a1a1a'),
    selectionBackground: cssVar('--dg-selection', 'rgba(45,212,160,0.28)'),
    black: cssVar('--dg-sidebar', '#151515'),
    brightBlack: cssVar('--dg-text-muted', '#bdbdbd'),
    white: cssVar('--dg-text', '#f2f2f2'),
    brightWhite: cssVar('--dg-text', '#f2f2f2')
  }
}

function apiTerm() {
  return window.api?.terminal
}

function formatShellLabel(shell) {
  if (!shell) return ''
  if (shell.tipo === 'pwsh' || shell.tipo === 'pwsh-preview') {
    return `pwsh ${shell.versao || ''}`.trim()
  }
  if (shell.tipo === 'powershell') return 'Windows PowerShell'
  return shell.tipo || 'shell'
}

export function initTerminalPanel() {
  const panel = document.getElementById('terminal-panel')
  const panesEl = document.getElementById('terminal-panes')
  const tabsEl = document.getElementById('terminal-tabs')
  const label = document.getElementById('terminal-shell-label')
  const btnClose = document.getElementById('terminal-btn-close')
  const btnClear = document.getElementById('terminal-btn-clear')
  const btnAdd = document.getElementById('terminal-btn-add')
  const btnToggle = document.getElementById('btn-terminal-toggle')
  const handle = document.getElementById('terminal-resize-handle')
  if (!panel || !panesEl || !tabsEl || !apiTerm()) return

  /** @type {Map<string, { id: string, titulo: string, xterm: import('@xterm/xterm').Terminal, fit: import('@xterm/addon-fit').FitAddon, pane: HTMLElement, tabBtn: HTMLElement, unsubData: (() => void)|null, unsubExit: (() => void)|null }>} */
  const abas = new Map()
  let ativoId = null
  let aberto = false
  let tabSeq = 0
  let observer = null

  const alturaSalva = parseInt(localStorage.getItem(LS_HEIGHT) || '220', 10)
  panel.style.height = Math.max(120, alturaSalva) + 'px'

  function abaAtiva() {
    return ativoId ? abas.get(ativoId) || null : null
  }

  function aplicarTema() {
    const theme = temaXterm()
    for (const a of abas.values()) {
      a.xterm.options.theme = theme
    }
  }

  function fitEResize(id) {
    if (!aberto) return
    const a = id ? abas.get(id) : abaAtiva()
    if (!a) return
    try {
      a.fit.fit()
      const dims = a.fit.proposeDimensions?.() || { cols: a.xterm.cols, rows: a.xterm.rows }
      apiTerm().resize(a.id, dims.cols || a.xterm.cols, dims.rows || a.xterm.rows)
    } catch {
      /* ignora */
    }
  }

  function renderTabs() {
    const ids = [...abas.keys()]
    for (const a of abas.values()) {
      const idx = ids.indexOf(a.id) + 1
      a.titulo = `Terminal ${idx}`
      a.tabBtn.textContent = ''
      const title = document.createElement('span')
      title.className = 'terminal-tab-title'
      title.textContent = a.titulo
      const close = document.createElement('button')
      close.type = 'button'
      close.className = 'terminal-tab-close'
      close.title = 'Fechar aba'
      close.setAttribute('aria-label', 'Fechar aba')
      close.textContent = '×'
      close.addEventListener('click', (e) => {
        e.stopPropagation()
        void fecharAba(a.id)
      })
      a.tabBtn.appendChild(title)
      a.tabBtn.appendChild(close)
      a.tabBtn.classList.toggle('ativa', a.id === ativoId)
      a.pane.style.display = a.id === ativoId ? 'block' : 'none'
    }
  }

  async function ativarAba(id) {
    if (!abas.has(id)) return
    ativoId = id
    renderTabs()
    requestAnimationFrame(() => {
      fitEResize(id)
      abas.get(id)?.xterm.focus()
    })
  }

  async function criarAba() {
    tabSeq += 1
    const id = `term-${Date.now()}-${tabSeq}`
    const titulo = `Terminal ${abas.size + 1}`

    const pane = document.createElement('div')
    pane.className = 'terminal-tab-pane'
    pane.dataset.termId = id
    panesEl.appendChild(pane)

    const tabBtn = document.createElement('button')
    tabBtn.type = 'button'
    tabBtn.className = 'terminal-tab'
    tabBtn.dataset.termId = id
    tabBtn.addEventListener('click', () => void ativarAba(id))
    tabsEl.appendChild(tabBtn)

    const fit = new FitAddon()
    const xterm = new Terminal({
      cursorBlink: true,
      fontFamily: 'Cascadia Code, Consolas, monospace',
      fontSize: 13,
      scrollback: 5000,
      theme: temaXterm(),
      allowProposedApi: true
    })
    xterm.loadAddon(fit)
    xterm.loadAddon(new WebLinksAddon())
    xterm.open(pane)
    xterm.onData((data) => apiTerm().write(id, data))

    const entry = {
      id,
      titulo,
      xterm,
      fit,
      pane,
      tabBtn,
      unsubData: null,
      unsubExit: null
    }
    abas.set(id, entry)

    const created = await apiTerm().create(id, {
      cols: xterm.cols,
      rows: xterm.rows
    })
    if (created?.shell && label) {
      label.textContent = formatShellLabel(created.shell)
    }
    if (created?.erro) {
      xterm.writeln('\r\n[erro] ' + created.erro)
    }

    entry.unsubData = apiTerm().onData(({ id: sid, data }) => {
      if (sid === id) xterm.write(data)
    })
    entry.unsubExit = apiTerm().onExit(({ id: sid, code }) => {
      if (sid === id) xterm.writeln(`\r\n[exit ${code}]`)
    })

    await ativarAba(id)
    return entry
  }

  async function fecharAba(id) {
    const a = abas.get(id)
    if (!a) return
    a.unsubData?.()
    a.unsubExit?.()
    try {
      await apiTerm().kill(id)
    } catch {
      /* ignora */
    }
    try {
      a.xterm.dispose()
    } catch {
      /* ignora */
    }
    a.pane.remove()
    a.tabBtn.remove()
    abas.delete(id)

    if (abas.size === 0) {
      ativoId = null
      await fecharPainel(false)
      return
    }
    if (ativoId === id) {
      const next = [...abas.keys()].pop()
      await ativarAba(next)
    } else {
      renderTabs()
    }
  }

  async function destruirTodasAbas() {
    const ids = [...abas.keys()]
    for (const id of ids) {
      const a = abas.get(id)
      if (!a) continue
      a.unsubData?.()
      a.unsubExit?.()
      try {
        await apiTerm().kill(id)
      } catch {
        /* ignora */
      }
      try {
        a.xterm.dispose()
      } catch {
        /* ignora */
      }
      a.pane.remove()
      a.tabBtn.remove()
      abas.delete(id)
    }
    ativoId = null
    tabsEl.innerHTML = ''
    panesEl.innerHTML = ''
  }

  async function abrirPainel() {
    if (aberto) return
    aberto = true
    panel.classList.add('open')
    panel.setAttribute('aria-hidden', 'false')

    const shell = await apiTerm().shell()
    if (label) label.textContent = formatShellLabel(shell)

    if (abas.size === 0) {
      await criarAba()
    } else {
      fitEResize(ativoId)
      abaAtiva()?.xterm.focus()
    }

    if (!observer) {
      observer = new ResizeObserver(() => fitEResize(ativoId))
      observer.observe(panesEl)
    }
  }

  async function fecharPainel(destruir = true) {
    if (!aberto && !destruir) {
      panel.classList.remove('open')
      panel.setAttribute('aria-hidden', 'true')
      return
    }
    aberto = false
    panel.classList.remove('open')
    panel.setAttribute('aria-hidden', 'true')
    if (destruir) await destruirTodasAbas()
  }

  function toggle() {
    if (aberto) void fecharPainel(true)
    else void abrirPainel()
  }

  btnClose?.addEventListener('click', () => void fecharPainel(true))
  btnClear?.addEventListener('click', () => abaAtiva()?.xterm.clear())
  btnAdd?.addEventListener('click', () => {
    if (!aberto) void abrirPainel()
    else void criarAba()
  })
  btnToggle?.addEventListener('click', () => toggle())

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === '`') {
      e.preventDefault()
      toggle()
      return
    }
    if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) {
      if (!aberto || abas.size === 0) return
      const idx = parseInt(e.key, 10) - 1
      const ids = [...abas.keys()]
      if (idx >= 0 && idx < ids.length) {
        e.preventDefault()
        void ativarAba(ids[idx])
      }
    }
  })

  if (handle) {
    let startY = 0
    let startH = 0
    const onMove = (e) => {
      const dy = startY - e.clientY
      const max = Math.floor(window.innerHeight * 0.6)
      const h = Math.min(max, Math.max(120, startH + dy))
      panel.style.height = h + 'px'
      fitEResize(ativoId)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      localStorage.setItem(LS_HEIGHT, String(parseInt(panel.style.height, 10) || 220))
    }
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault()
      startY = e.clientY
      startH = panel.getBoundingClientRect().height
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
  }

  const mo = new MutationObserver(() => aplicarTema())
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'] })

  window.addEventListener('resize', () => fitEResize(ativoId))
}
