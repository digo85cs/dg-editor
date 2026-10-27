/**
 * Painel de terminal inferior (xterm.js + node-pty via IPC).
 */
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

const TERM_ID = 'main'
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

export function initTerminalPanel() {
  const panel = document.getElementById('terminal-panel')
  const mount = document.getElementById('terminal-mount')
  const label = document.getElementById('terminal-shell-label')
  const btnClose = document.getElementById('terminal-btn-close')
  const btnClear = document.getElementById('terminal-btn-clear')
  const btnToggle = document.getElementById('btn-terminal-toggle')
  const handle = document.getElementById('terminal-resize-handle')
  if (!panel || !mount || !apiTerm()) return

  let term = null
  let fitAddon = null
  let aberto = false
  let unsubData = null
  let unsubExit = null
  let observer = null

  const alturaSalva = parseInt(localStorage.getItem(LS_HEIGHT) || '220', 10)
  panel.style.height = Math.max(120, alturaSalva) + 'px'

  function aplicarTema() {
    if (term) term.options.theme = temaXterm()
  }

  function fitEResize() {
    if (!term || !fitAddon || !aberto) return
    try {
      fitAddon.fit()
      const dims = fitAddon.proposeDimensions?.() || { cols: term.cols, rows: term.rows }
      apiTerm().resize(TERM_ID, dims.cols || term.cols, dims.rows || term.rows)
    } catch {
      /* ignora */
    }
  }

  async function abrir() {
    if (aberto) return
    aberto = true
    panel.classList.add('open')
    panel.setAttribute('aria-hidden', 'false')

    if (!term) {
      fitAddon = new FitAddon()
      term = new Terminal({
        cursorBlink: true,
        fontFamily: "Cascadia Code, Consolas, monospace",
        fontSize: 13,
        scrollback: 5000,
        theme: temaXterm(),
        allowProposedApi: true
      })
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())
      term.open(mount)
      term.onData((data) => apiTerm().write(TERM_ID, data))
    }

    const shell = await apiTerm().shell()
    if (label) {
      const nome =
        shell?.tipo === 'pwsh' || shell?.tipo === 'pwsh-preview'
          ? `pwsh ${shell.versao || ''}`.trim()
          : shell?.tipo === 'powershell'
            ? 'Windows PowerShell'
            : shell?.tipo || 'shell'
      label.textContent = nome
    }

    const created = await apiTerm().create(TERM_ID, {
      cols: term.cols,
      rows: term.rows,
      cwd: undefined
    })
    if (created?.shell && label) {
      const s = created.shell
      label.textContent =
        s.tipo === 'pwsh' || s.tipo === 'pwsh-preview'
          ? `pwsh ${s.versao || ''}`.trim()
          : s.tipo
    }
    if (created?.erro) {
      term.writeln('\r\n[erro] ' + created.erro)
    }

    unsubData?.()
    unsubExit?.()
    unsubData = apiTerm().onData(({ id, data }) => {
      if (id === TERM_ID && term) term.write(data)
    })
    unsubExit = apiTerm().onExit(({ id, code }) => {
      if (id === TERM_ID && term) term.writeln(`\r\n[exit ${code}]`)
    })

    requestAnimationFrame(() => {
      fitEResize()
      term.focus()
    })

    if (!observer) {
      observer = new ResizeObserver(() => fitEResize())
      observer.observe(mount)
    }
  }

  async function fechar() {
    if (!aberto) return
    aberto = false
    panel.classList.remove('open')
    panel.setAttribute('aria-hidden', 'true')
    unsubData?.()
    unsubExit?.()
    unsubData = null
    unsubExit = null
    await apiTerm().kill(TERM_ID)
    if (term) {
      term.dispose()
      term = null
      fitAddon = null
      mount.innerHTML = ''
    }
  }

  function toggle() {
    if (aberto) fechar()
    else abrir()
  }

  btnClose?.addEventListener('click', () => fechar())
  btnClear?.addEventListener('click', () => term?.clear())
  btnToggle?.addEventListener('click', () => toggle())

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === '`') {
      e.preventDefault()
      toggle()
    }
  })

  // Resize pela borda superior
  if (handle) {
    let startY = 0
    let startH = 0
    const onMove = (e) => {
      const dy = startY - e.clientY
      const max = Math.floor(window.innerHeight * 0.6)
      const h = Math.min(max, Math.max(120, startH + dy))
      panel.style.height = h + 'px'
      fitEResize()
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

  // Tema: observa classe do body
  const mo = new MutationObserver(() => aplicarTema())
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'] })

  window.addEventListener('resize', () => fitEResize())
}
