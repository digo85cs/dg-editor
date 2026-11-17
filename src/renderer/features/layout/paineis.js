import { agendarSalvarWorkspace } from '../../workspace-ui.js'

const $ = (id) => document.getElementById(id)

let deps = {
  enviarBoundsBrowser: () => {},
  ativarAbaDireita: () => {}
}

export function configurarPaineis(d) {
  deps = { ...deps, ...d }
}

// ---------- Layout persistido ----------
export const LAYOUT_MIN = { sidebar: 200, right: 320, center: 420 }
export const LAYOUT_MAX = { sidebar: 340, right: 460 }
export const LAYOUT_ICONBAR = 48
export const LAYOUT_TRILHOS = 8

export function larguraTotalApp() {
  const app = $('app')
  return app?.clientWidth || window.innerWidth
}

/** Larguras finais respeitando o minimo do centro (chat/composer legivel). */
export function largurasPermitidas() {
  const app = $('app')
  const total = larguraTotalApp()
  let sidebar = parseInt(getComputedStyle(app).getPropertyValue('--dg-sidebar-w'), 10) || 260
  let right = parseInt(getComputedStyle(app).getPropertyValue('--dg-panel-w'), 10) || 420
  sidebar = Math.min(LAYOUT_MAX.sidebar, Math.max(LAYOUT_MIN.sidebar, sidebar))
  const rightMax = Math.max(
    LAYOUT_MIN.right,
    Math.min(LAYOUT_MAX.right, total - LAYOUT_ICONBAR - LAYOUT_TRILHOS - sidebar - LAYOUT_MIN.center)
  )
  right = Math.min(rightMax, Math.max(LAYOUT_MIN.right, right))
  const sobraSidebar = total - LAYOUT_ICONBAR - LAYOUT_TRILHOS - right - LAYOUT_MIN.center
  if (sobraSidebar < sidebar) sidebar = Math.max(LAYOUT_MIN.sidebar, sobraSidebar)
  return { sidebar, right }
}

export function aplicarLarguras({ sidebar, right }) {
  const app = $('app')
  app.style.setProperty('--dg-sidebar-w', sidebar + 'px')
  app.style.setProperty('--dg-sidebar-width', sidebar + 'px')
  app.style.setProperty('--dg-panel-w', right + 'px')
  app.style.setProperty('--dg-right-panel-width', right + 'px')
}

/** Reaplica limites em qualquer largura de janela. Retorna as larguras usadas. */
export function clamparLayout() {
  const l = largurasPermitidas()
  aplicarLarguras(l)
  return l
}

export function carregarLayout() {
  try {
    const raw = localStorage.getItem('dg-layout')
    if (!raw) { clamparLayout(); return }
    const L = JSON.parse(raw)
    const app = $('app')
    // Inline sobrepoe tokens; nomes novos (--dg-sidebar-w / --dg-panel-w) + aliases legados
    if (L.sidebarWidth) {
      app.style.setProperty('--dg-sidebar-w', L.sidebarWidth + 'px')
      app.style.setProperty('--dg-sidebar-width', L.sidebarWidth + 'px')
    }
    if (L.rightWidth) {
      app.style.setProperty('--dg-panel-w', L.rightWidth + 'px')
      app.style.setProperty('--dg-right-panel-width', L.rightWidth + 'px')
    }
    if (L.sidebarCollapsed) app.classList.add('sidebar-collapsed')
    // Bloco 3: migração — se ficou recolhido “para sempre”, reabre uma vez
    const mig = localStorage.getItem('dg-bloco3-v2')
    if (mig !== '1') {
      app.classList.remove('right-collapsed')
      localStorage.setItem('dg-bloco3-v2', '1')
      try {
        localStorage.setItem(
          'dg-layout',
          JSON.stringify({ ...L, rightCollapsed: false })
        )
      } catch { /* */ }
    } else if (L.rightCollapsed) {
      app.classList.add('right-collapsed')
    }
  } catch { /* ignora */ }
  clamparLayout()
}

export function salvarLayout() {
  const app = $('app')
  const sw = parseInt(getComputedStyle(app).getPropertyValue('--dg-sidebar-w'), 10) || 260
  const rw = parseInt(getComputedStyle(app).getPropertyValue('--dg-panel-w'), 10) || 420
  localStorage.setItem(
    'dg-layout',
    JSON.stringify({
      sidebarWidth: sw,
      rightWidth: rw,
      sidebarCollapsed: app.classList.contains('sidebar-collapsed'),
      rightCollapsed: app.classList.contains('right-collapsed')
    })
  )
  agendarSalvarWorkspace()
}

export function initResizers() {
  const bind = (el, kind) => {
    if (!el) return
    let startX = 0
    let startW = 0
    const onMove = (e) => {
      const dx = e.clientX - startX
      const total = larguraTotalApp()
      if (kind === 'sidebar') {
        const outra = parseInt(getComputedStyle($('app')).getPropertyValue('--dg-panel-w'), 10) || 420
        const max = Math.min(
          LAYOUT_MAX.sidebar,
          Math.max(LAYOUT_MIN.sidebar, total - LAYOUT_ICONBAR - LAYOUT_TRILHOS - outra - LAYOUT_MIN.center)
        )
        const w = Math.min(max, Math.max(LAYOUT_MIN.sidebar, startW + dx))
        $('app').style.setProperty('--dg-sidebar-w', w + 'px')
        $('app').style.setProperty('--dg-sidebar-width', w + 'px')
      } else {
        const outra = parseInt(getComputedStyle($('app')).getPropertyValue('--dg-sidebar-w'), 10) || 260
        const max = Math.min(
          LAYOUT_MAX.right,
          Math.max(LAYOUT_MIN.right, total - LAYOUT_ICONBAR - LAYOUT_TRILHOS - outra - LAYOUT_MIN.center)
        )
        const w = Math.min(max, Math.max(LAYOUT_MIN.right, startW - dx))
        $('app').style.setProperty('--dg-panel-w', w + 'px')
        $('app').style.setProperty('--dg-right-panel-width', w + 'px')
        if (typeof enviarBoundsBrowser === 'function') deps.enviarBoundsBrowser()
      }
    }
    const onUp = () => {
      el.classList.remove('dragging')
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      salvarLayout()
      if (typeof enviarBoundsBrowser === 'function') deps.enviarBoundsBrowser()
    }
    el.addEventListener('mousedown', (e) => {
      e.preventDefault()
      startX = e.clientX
      const prop = kind === 'sidebar' ? '--dg-sidebar-w' : '--dg-panel-w'
      startW = parseInt(getComputedStyle($('app')).getPropertyValue(prop), 10) || (kind === 'sidebar' ? 260 : 320)
      el.classList.add('dragging')
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
    el.addEventListener('dblclick', () => {
      if (kind === 'sidebar') {
        $('app').style.setProperty('--dg-sidebar-w', '260px')
        $('app').style.setProperty('--dg-sidebar-width', '260px')
      } else {
        $('app').style.setProperty('--dg-panel-w', '420px')
        $('app').style.setProperty('--dg-right-panel-width', '420px')
      }
      clamparLayout()
      salvarLayout()
    })
  }
  bind($('resize-sidebar'), 'sidebar')
  bind($('resize-right'), 'right')

  let timerJanela = 0
  window.addEventListener('resize', () => {
    clamparLayout()
    clearTimeout(timerJanela)
    timerJanela = setTimeout(() => {
      salvarLayout()
      if (typeof enviarBoundsBrowser === 'function') deps.enviarBoundsBrowser()
    }, 250)
  })
}

export function toggleSidebar(forcar) {
  const app = $('app')
  if (typeof forcar === 'boolean') {
    app.classList.toggle('sidebar-collapsed', !forcar)
  } else {
    app.classList.toggle('sidebar-collapsed')
  }
  salvarLayout()
  setActivityActive('explorer', !app.classList.contains('sidebar-collapsed'))
}

export function sincronizarBotoesPainelDireito() {
  const recolhido = $('app').classList.contains('right-collapsed')
  const pressed = String(recolhido)
  $('btn-right-collapse')?.setAttribute('aria-pressed', pressed)
  $('btn-right-expand')?.setAttribute('aria-pressed', pressed)
  const tog = $('btn-right-toggle')
  if (tog) {
    tog.hidden = false
    tog.style.display = 'inline-flex'
    tog.setAttribute('aria-pressed', pressed)
    tog.title = recolhido
      ? 'Abrir Bloco 3 (Execução, Terminal, Navegador)'
      : 'Fechar Bloco 3'
    tog.textContent = recolhido ? 'Abrir Bloco 3' : 'Bloco 3'
  }
  const exp = $('btn-right-expand')
  if (exp) exp.hidden = true
  const rail = $('rail-collapse')
  if (rail) {
    rail.title = recolhido ? 'Expandir Bloco 3' : 'Recolher Bloco 3'
    rail.setAttribute('aria-label', rail.title)
    rail.setAttribute('aria-pressed', pressed)
  }
  const edge = $('bloco3-edge')
  if (edge) {
    edge.hidden = !recolhido
    edge.setAttribute('aria-hidden', recolhido ? 'false' : 'true')
    edge.title = 'Abrir Bloco 3'
  }
}

export function toggleRight(forcar) {
  const app = $('app')
  if (typeof forcar === 'boolean') {
    app.classList.toggle('right-collapsed', !forcar)
  } else {
    app.classList.toggle('right-collapsed')
  }
  salvarLayout()
  sincronizarBotoesPainelDireito()
}

export function setActivityActive(action, on) {
  document.querySelectorAll('.ab-btn').forEach((b) => {
    if (b.dataset.action === action) b.classList.toggle('active', !!on)
  })
}

export function abrirTerminalNoBloco3() {
  toggleRight(true)
  // ativarAbaDireita aguarda o módulo lazy e chama dgTerminal.abrir()
  deps.ativarAbaDireita('terminal')
}

/** Ctrl+`: abre; se já está visível na aba Terminal, apenas oculta (ptys continuam vivos). */
export function alternarTerminalNoBloco3() {
  const dg = window.dgTerminal
  const tabTerminalAtiva = document
    .querySelector('.right-tab[data-pane="terminal"]')
    ?.classList.contains('active')
  const direitaVisivel = !$('app')?.classList.contains('right-collapsed')
  if (dg?.isOpen?.() && tabTerminalAtiva && direitaVisivel) {
    void dg.ocultar?.()
    return
  }
  abrirTerminalNoBloco3()
}
