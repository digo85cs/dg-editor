/**
 * Painel de terminal: abas, perfis, split, drag-and-drop e restauração de layout.
 */
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

const LS_HEIGHT = 'dg-terminal-height'
const LS_MODE = 'dg-terminal-mode'
const LS_ORIENT = 'dg-terminal-orient'
const LS_SPLIT_RATIO = 'dg-terminal-split-ratio'
const LS_LAYOUT = 'dg.terminal.layout'
const MAX_ABAS_RESTORE = 4

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

function shellIdFromInfo(shell) {
  if (!shell) return null
  if (shell.tipo === 'cmd') return 'cmd'
  if (shell.tipo === 'powershell') return 'powershell-' + (shell.versao || '5.1')
  if (shell.tipo === 'pwsh-preview') return 'pwsh-preview-' + (shell.versao || 'x')
  return 'pwsh-' + (shell.versao || 'x')
}

/**
 * @typedef {{ id: string, titulo: string, shellId: string|null, xterm: any, fit: any, pane: HTMLElement, tabBtn: HTMLElement, unsubData: (()=>void)|null, unsubExit: (()=>void)|null }} Aba
 * @typedef {{ key: string, root: HTMLElement, bar: HTMLElement, tabsEl: HTMLElement, panesEl: HTMLElement, abas: Map<string, Aba>, ativoId: string|null }} Grupo
 */

export function initTerminalPanel() {
  const panel = document.getElementById('terminal-panel')
  const splitEl = document.getElementById('terminal-split')
  const label = document.getElementById('terminal-shell-label')
  const selectEl = document.getElementById('terminal-shell-select')
  const btnPadrao = document.getElementById('terminal-btn-padrao')
  const btnPadraoClear = document.getElementById('terminal-btn-padrao-clear')
  const btnClose = document.getElementById('terminal-btn-close')
  const btnClear = document.getElementById('terminal-btn-clear')
  const btnSplit = document.getElementById('terminal-btn-split')
  const btnOrient = document.getElementById('terminal-btn-orient')
  const btnUnsplit = document.getElementById('terminal-btn-unsplit')
  const btnToggle = document.getElementById('btn-terminal-toggle')
  const handle = document.getElementById('terminal-resize-handle')
  if (!panel || !splitEl || !apiTerm()) return

  /** @type {Map<string, Grupo>} */
  const grupos = new Map()
  let grupoAtivoKey = 'A'
  let modo = localStorage.getItem(LS_MODE) === 'split' ? 'split' : 'single'
  let orientacao = localStorage.getItem(LS_ORIENT) === 'vertical' ? 'vertical' : 'horizontal'
  let aberto = false
  let tabSeq = 0
  /** @type {Array<{id:string,rotulo:string}>|null} */
  let shellsCache = null
  let shellPadraoId = null
  let observer = null
  let divisorEl = null
  const ratioRef = {
    value: Math.min(0.8, Math.max(0.2, parseFloat(localStorage.getItem(LS_SPLIT_RATIO) || '0.5') || 0.5))
  }

  const docked = panel.classList.contains('terminal-panel--docked')
  const alturaSalva = parseInt(localStorage.getItem(LS_HEIGHT) || '220', 10)
  // Docked: altura vem do painel direito (CSS 100%). Inline height só no layout inferior legado.
  if (!docked) panel.style.height = Math.max(120, alturaSalva) + 'px'
  else panel.style.height = ''

  function grupoAtivo() {
    return grupos.get(grupoAtivoKey) || null
  }

  function abaAtivaDoGrupo(g) {
    if (!g || !g.ativoId) return null
    return g.abas.get(g.ativoId) || null
  }

  function persistLayout() {
    localStorage.setItem(LS_MODE, modo)
    localStorage.setItem(LS_ORIENT, orientacao)
  }

  function salvarSnapshot() {
    try {
      const keys = [...grupos.keys()].sort()
      const snap = {
        modo,
        orientacao,
        grupos: keys.map((k) => ({
          abas: [...(grupos.get(k)?.abas.values() || [])].map((a) => ({
            shellId: a.shellId || ''
          }))
        })),
        grupoAtivo: Math.max(0, keys.indexOf(grupoAtivoKey))
      }
      localStorage.setItem(LS_LAYOUT, JSON.stringify(snap))
      persistLayout()
    } catch {
      /* ignora */
    }
  }

  function lerSnapshot() {
    try {
      const raw = localStorage.getItem(LS_LAYOUT)
      if (!raw) return null
      const snap = JSON.parse(raw)
      if (!snap || (snap.modo !== 'single' && snap.modo !== 'split')) return null
      if (!Array.isArray(snap.grupos) || snap.grupos.length < 1) return null
      return snap
    } catch {
      try {
        localStorage.removeItem(LS_LAYOUT)
      } catch {
        /* */
      }
      return null
    }
  }

  function aplicarTema() {
    const theme = temaXterm()
    for (const g of grupos.values()) {
      for (const a of g.abas.values()) a.xterm.options.theme = theme
    }
  }

  function fitEResize(g, id) {
    if (!aberto || !g) return
    const a = id ? g.abas.get(id) : abaAtivaDoGrupo(g)
    if (!a) return
    try {
      a.fit.fit()
      const dims = a.fit.proposeDimensions?.() || { cols: a.xterm.cols, rows: a.xterm.rows }
      apiTerm().resize(a.id, dims.cols || a.xterm.cols, dims.rows || a.xterm.rows)
    } catch {
      /* ignora */
    }
  }

  function fitTodos() {
    for (const g of grupos.values()) fitEResize(g, g.ativoId)
  }

  function marcarGrupoAtivo(key) {
    if (!grupos.has(key)) return
    grupoAtivoKey = key
    for (const [k, g] of grupos) {
      g.root.classList.toggle('ativo', k === key)
    }
    syncShellUi()
    const a = abaAtivaDoGrupo(grupoAtivo())
    a?.xterm.focus()
  }

  function limparDropAlvo() {
    for (const g of grupos.values()) {
      g.bar?.classList.remove('drop-alvo')
      g.tabsEl?.classList.remove('drop-alvo')
    }
  }

  function wireDrag(g, a) {
    const btn = a.tabBtn
    btn.draggable = modo === 'split'
    btn.ondragstart = (e) => {
      if (modo !== 'split') {
        e.preventDefault()
        return
      }
      e.dataTransfer.setData('text/plain', a.id)
      e.dataTransfer.setData('application/x-dg-grupo', g.key)
      e.dataTransfer.effectAllowed = 'move'
    }
    btn.ondragend = () => limparDropAlvo()
  }

  function wireDropZone(g) {
    const zone = g.bar
    zone.ondragover = (e) => {
      if (modo !== 'split') return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      limparDropAlvo()
      zone.classList.add('drop-alvo')
    }
    zone.ondragleave = (e) => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('drop-alvo')
    }
    zone.ondrop = (e) => {
      e.preventDefault()
      limparDropAlvo()
      const abaId = e.dataTransfer.getData('text/plain')
      if (!abaId) return
      let beforeId = null
      const el = e.target?.closest?.('.terminal-tab')
      if (el?.dataset?.termId && el.dataset.termId !== abaId) beforeId = el.dataset.termId
      void moverAba(abaId, g.key, beforeId)
    }
  }

  function renderTabs(g) {
    const ids = [...g.abas.keys()]
    for (const a of g.abas.values()) {
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
      close.textContent = '×'
      close.addEventListener('click', (e) => {
        e.stopPropagation()
        void fecharAba(g, a.id)
      })
      a.tabBtn.appendChild(title)
      a.tabBtn.appendChild(close)
      a.tabBtn.classList.toggle('ativa', a.id === g.ativoId)
      a.tabBtn.draggable = modo === 'split'
      a.pane.style.display = a.id === g.ativoId ? 'block' : 'none'
      wireDrag(g, a)
    }
  }

  async function ativarAba(g, id) {
    if (!g.abas.has(id)) return
    g.ativoId = id
    renderTabs(g)
    marcarGrupoAtivo(g.key)
    requestAnimationFrame(() => {
      fitEResize(g, id)
      g.abas.get(id)?.xterm.focus()
    })
    syncShellUi()
  }

  async function carregarShells() {
    try {
      const lista = await apiTerm().shells()
      shellsCache = Array.isArray(lista) ? lista : []
    } catch {
      shellsCache = []
    }
    try {
      shellPadraoId = await apiTerm().getShellPadrao()
    } catch {
      shellPadraoId = null
    }
    return shellsCache
  }

  function syncShellUi() {
    const g = grupoAtivo()
    const a = abaAtivaDoGrupo(g)
    const lista = shellsCache || []
    if (!selectEl || !label) return

    if (!lista.length) {
      selectEl.hidden = true
      if (btnPadrao) btnPadrao.hidden = true
      if (btnPadraoClear) btnPadraoClear.hidden = true
      label.hidden = false
      label.textContent = a ? formatShellLabel({ tipo: 'pwsh', versao: a.shellId }) : ''
      return
    }

    selectEl.hidden = false
    label.hidden = true
    if (btnPadrao) btnPadrao.hidden = false
    if (btnPadraoClear) btnPadraoClear.hidden = !shellPadraoId
    selectEl.innerHTML = ''
    for (const op of lista) {
      const opt = document.createElement('option')
      opt.value = op.id
      opt.textContent = op.rotulo + (shellPadraoId === op.id ? ' ★' : '')
      selectEl.appendChild(opt)
    }
    if (a?.shellId && lista.some((o) => o.id === a.shellId)) {
      selectEl.value = a.shellId
    } else if (lista[0]) {
      selectEl.value = lista[0].id
    }
    if (btnPadrao) {
      btnPadrao.textContent = shellPadraoId && selectEl.value === shellPadraoId ? '★' : '☆'
      btnPadrao.classList.toggle('ativa', !!(shellPadraoId && selectEl.value === shellPadraoId))
    }
  }

  async function criarAba(g, shellIdHeranca, cwdOpt) {
    tabSeq += 1
    const id = `term-${Date.now()}-${tabSeq}`
    const heranca =
      shellIdHeranca ||
      abaAtivaDoGrupo(g)?.shellId ||
      shellPadraoId ||
      (shellsCache && shellsCache[0] && shellsCache[0].id) ||
      null

    const pane = document.createElement('div')
    pane.className = 'terminal-tab-pane'
    pane.dataset.termId = id
    g.panesEl.appendChild(pane)

    const tabBtn = document.createElement('button')
    tabBtn.type = 'button'
    tabBtn.className = 'terminal-tab'
    tabBtn.dataset.termId = id
    tabBtn.addEventListener('click', () => void ativarAba(g, id))
    g.tabsEl.appendChild(tabBtn)

    const fit = new FitAddon()
    const scrollbackCfg = Math.min(
      50000,
      Math.max(500, parseInt(localStorage.getItem('dg-terminal-scrollback') || '5000', 10) || 5000)
    )
    const xterm = new Terminal({
      cursorBlink: true,
      fontFamily: 'Cascadia Code, Consolas, monospace',
      fontSize: 13,
      scrollback: scrollbackCfg,
      theme: temaXterm(),
      allowProposedApi: true
    })
    xterm.loadAddon(fit)
    xterm.loadAddon(new WebLinksAddon())
    xterm.open(pane)
    xterm.onData((data) => apiTerm().write(id, data))

    /** @type {Aba} */
    const entry = {
      id,
      titulo: `Terminal ${g.abas.size + 1}`,
      shellId: heranca,
      xterm,
      fit,
      pane,
      tabBtn,
      unsubData: null,
      unsubExit: null
    }
    g.abas.set(id, entry)
    wireDrag(g, entry)

    const opts = { cols: xterm.cols, rows: xterm.rows }
    if (heranca) opts.shellId = heranca
    if (cwdOpt) opts.cwd = cwdOpt
    let created = await apiTerm().create(id, opts)
    if (created?.erro && opts.cwd) {
      console.warn('[terminal] cwd invalido, usando padrao:', opts.cwd, created.erro)
      delete opts.cwd
      created = await apiTerm().create(id, opts)
    }
    if (created?.shell) {
      entry.shellId = shellIdFromInfo(created.shell) || heranca
    }
    if (created?.erro) xterm.writeln('\r\n[erro] ' + created.erro)

    entry.unsubData = apiTerm().onData(({ id: sid, data }) => {
      if (sid === id) xterm.write(data)
    })
    entry.unsubExit = apiTerm().onExit(({ id: sid, code }) => {
      if (sid === id) xterm.writeln(`\r\n[exit ${code}]`)
    })

    await ativarAba(g, id)
    salvarSnapshot()
    return entry
  }

  async function reiniciarAbaComShell(g, a, shellId) {
    a.unsubData?.()
    a.unsubExit?.()
    try {
      await apiTerm().kill(a.id)
    } catch {
      /* */
    }
    a.shellId = shellId
    a.xterm.reset()
    a.xterm.clear()
    const opts = { cols: a.xterm.cols, rows: a.xterm.rows, shellId }
    const created = await apiTerm().create(a.id, opts)
    if (created?.shell) a.shellId = shellIdFromInfo(created.shell) || shellId
    if (created?.erro) a.xterm.writeln('\r\n[erro] ' + created.erro)
    a.unsubData = apiTerm().onData(({ id: sid, data }) => {
      if (sid === a.id) a.xterm.write(data)
    })
    a.unsubExit = apiTerm().onExit(({ id: sid, code }) => {
      if (sid === a.id) a.xterm.writeln(`\r\n[exit ${code}]`)
    })
    fitEResize(g, a.id)
    a.xterm.focus()
    syncShellUi()
    salvarSnapshot()
  }

  async function destruirAbaObj(g, a) {
    a.unsubData?.()
    a.unsubExit?.()
    try {
      await apiTerm().kill(a.id)
    } catch {
      /* */
    }
    try {
      a.xterm.dispose()
    } catch {
      /* */
    }
    a.pane.remove()
    a.tabBtn.remove()
    g.abas.delete(a.id)
  }

  /** Grupo vazio em split: remove DOM do grupo; se sobrar 1, volta a single (sem matar o outro). */
  async function aposEsvaziarGrupo(key) {
    const g = grupos.get(key)
    if (!g) return
    if (g.abas.size > 0) return
    g.root.remove()
    grupos.delete(key)
    if (grupoAtivoKey === key) {
      grupoAtivoKey = [...grupos.keys()][0] || 'A'
    }
    if (grupos.size <= 1) {
      await voltarSinglePreservando()
    } else {
      marcarGrupoAtivo(grupoAtivoKey)
      aplicarSplitCss()
    }
    salvarSnapshot()
  }

  async function fecharAba(g, id) {
    const a = g.abas.get(id)
    if (!a) return
    await destruirAbaObj(g, a)

    if (g.abas.size === 0) {
      g.ativoId = null
      if (modo === 'single') {
        await fecharPainel(false)
        salvarSnapshot()
        return
      }
      await aposEsvaziarGrupo(g.key)
      return
    }
    if (g.ativoId === id) {
      const next = [...g.abas.keys()].pop()
      await ativarAba(g, next)
    } else {
      renderTabs(g)
    }
    salvarSnapshot()
  }

  function encontrarGrupoDaAba(abaId) {
    for (const g of grupos.values()) {
      if (g.abas.has(abaId)) return g
    }
    return null
  }

  /** Move aba entre grupos ou reordena — NÃO mata/recria pty. */
  async function moverAba(abaId, destKey, beforeId) {
    const fromG = encontrarGrupoDaAba(abaId)
    const toG = grupos.get(destKey)
    if (!fromG || !toG) return
    const a = fromG.abas.get(abaId)
    if (!a) return

    fromG.abas.delete(abaId)
    if (fromG.ativoId === abaId) {
      fromG.ativoId = [...fromG.abas.keys()].pop() || null
    }

    const ids = [...toG.abas.keys()].filter((id) => id !== abaId)
    const idx = beforeId ? ids.indexOf(beforeId) : -1
    if (idx >= 0) ids.splice(idx, 0, abaId)
    else ids.push(abaId)

    const bag = new Map(toG.abas)
    bag.set(abaId, a)
    const next = new Map()
    for (const id of ids) {
      const item = bag.get(id)
      if (item) next.set(id, item)
    }
    toG.abas = next

    // DOM: move tab + pane (xterm viaja junto)
    if (beforeId && toG.abas.get(beforeId)?.tabBtn) {
      toG.tabsEl.insertBefore(a.tabBtn, toG.abas.get(beforeId).tabBtn)
    } else {
      toG.tabsEl.appendChild(a.tabBtn)
    }
    toG.panesEl.appendChild(a.pane)

    if (fromG !== toG) renderTabs(fromG)
    await ativarAba(toG, abaId)
    requestAnimationFrame(() => fitEResize(toG, abaId))

    if (fromG !== toG && fromG.abas.size === 0) {
      await aposEsvaziarGrupo(fromG.key)
    } else {
      salvarSnapshot()
    }
  }

  async function destruirGrupoCompleto(g) {
    for (const id of [...g.abas.keys()]) {
      const a = g.abas.get(id)
      if (a) await destruirAbaObj(g, a)
    }
    g.root.remove()
    grupos.delete(g.key)
  }

  async function removerGrupo(key) {
    const g = grupos.get(key)
    if (!g) return
    await destruirGrupoCompleto(g)
    if (grupoAtivoKey === key) {
      grupoAtivoKey = [...grupos.keys()][0] || 'A'
      if (grupos.has(grupoAtivoKey)) marcarGrupoAtivo(grupoAtivoKey)
    }
  }

  function criarDomGrupo(key) {
    const root = document.createElement('div')
    root.className = 'terminal-grupo'
    root.dataset.grupo = key
    root.addEventListener('mousedown', () => marcarGrupoAtivo(key))

    const bar = document.createElement('div')
    bar.className = 'terminal-grupo-bar'
    const tabsEl = document.createElement('div')
    tabsEl.className = 'terminal-tabs'
    tabsEl.setAttribute('role', 'tablist')
    const btnAdd = document.createElement('button')
    btnAdd.type = 'button'
    btnAdd.className = 'terminal-btn-add'
    btnAdd.title = 'Nova aba'
    btnAdd.textContent = '+'
    btnAdd.addEventListener('click', (e) => {
      e.stopPropagation()
      marcarGrupoAtivo(key)
      void criarAba(grupos.get(key))
    })
    bar.appendChild(tabsEl)
    bar.appendChild(btnAdd)

    const panesEl = document.createElement('div')
    panesEl.className = 'terminal-panes'

    root.appendChild(bar)
    root.appendChild(panesEl)

    /** @type {Grupo} */
    const g = { key, root, bar, tabsEl, panesEl, abas: new Map(), ativoId: null }
    grupos.set(key, g)
    wireDropZone(g)
    return g
  }

  function aplicarSplitCss() {
    splitEl.classList.toggle('single', modo === 'single')
    splitEl.classList.toggle('split', modo === 'split')
    splitEl.classList.toggle('horizontal', orientacao === 'horizontal')
    splitEl.classList.toggle('vertical', orientacao === 'vertical')
    if (btnOrient) btnOrient.hidden = modo !== 'split'
    if (btnUnsplit) btnUnsplit.hidden = modo !== 'split'
    if (btnSplit) btnSplit.hidden = modo === 'split'

    for (const g of grupos.values()) {
      for (const a of g.abas.values()) {
        a.tabBtn.draggable = modo === 'split'
      }
    }

    if (modo === 'split' && grupos.size >= 2) {
      const pct = Math.round(ratioRef.value * 100)
      if (orientacao === 'horizontal') {
        splitEl.style.gridTemplateColumns = `${pct}% 4px 1fr`
        splitEl.style.gridTemplateRows = '1fr'
      } else {
        splitEl.style.gridTemplateRows = `${pct}% 4px 1fr`
        splitEl.style.gridTemplateColumns = '1fr'
      }
    } else {
      splitEl.style.gridTemplateColumns = '1fr'
      splitEl.style.gridTemplateRows = '1fr'
    }
  }

  function montarDivisor() {
    if (divisorEl) divisorEl.remove()
    divisorEl = document.createElement('div')
    divisorEl.className = 'terminal-split-divisor'
    divisorEl.title = 'Arrastar para redimensionar'
    const onMove = (e) => {
      const rect = splitEl.getBoundingClientRect()
      let r =
        orientacao === 'horizontal'
          ? (e.clientX - rect.left) / rect.width
          : (e.clientY - rect.top) / rect.height
      r = Math.min(0.8, Math.max(0.2, r))
      ratioRef.value = r
      localStorage.setItem(LS_SPLIT_RATIO, String(r))
      const pct = Math.round(r * 100)
      if (orientacao === 'horizontal') splitEl.style.gridTemplateColumns = `${pct}% 4px 1fr`
      else splitEl.style.gridTemplateRows = `${pct}% 4px 1fr`
      fitTodos()
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    divisorEl.addEventListener('mousedown', (e) => {
      e.preventDefault()
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
    return divisorEl
  }

  async function voltarSinglePreservando() {
    const keys = [...grupos.keys()]
    const keepKey = grupos.has('A') ? 'A' : keys[0]
    for (const k of keys) {
      if (k !== keepKey) await removerGrupo(k)
    }
    if (divisorEl) {
      divisorEl.remove()
      divisorEl = null
    }
    modo = 'single'
    persistLayout()
    splitEl.innerHTML = ''
    const keep = grupos.get(keepKey)
    if (keep) {
      if (keepKey !== 'A') {
        grupos.delete(keepKey)
        keep.key = 'A'
        keep.root.dataset.grupo = 'A'
        grupos.set('A', keep)
      }
      splitEl.appendChild(keep.root)
      grupoAtivoKey = 'A'
      marcarGrupoAtivo('A')
    }
    aplicarSplitCss()
    fitTodos()
    salvarSnapshot()
  }

  async function ativarSplit() {
    if (modo === 'split') return
    const gA = grupos.get('A') || grupoAtivo()
    if (!gA) return
    modo = 'split'
    persistLayout()

    if (gA.key !== 'A') {
      grupos.delete(gA.key)
      gA.key = 'A'
      gA.root.dataset.grupo = 'A'
      grupos.set('A', gA)
    }

    splitEl.innerHTML = ''
    splitEl.appendChild(gA.root)
    const div = montarDivisor()
    splitEl.appendChild(div)
    const gB = criarDomGrupo('B')
    splitEl.appendChild(gB.root)

    aplicarSplitCss()
    const heranca = abaAtivaDoGrupo(gA)?.shellId
    await criarAba(gB, heranca)
    marcarGrupoAtivo('B')
    fitTodos()
    salvarSnapshot()
  }

  async function fecharSplit() {
    if (modo !== 'split') return
    await voltarSinglePreservando()
  }

  function alternarOrientacao() {
    if (modo !== 'split') return
    orientacao = orientacao === 'horizontal' ? 'vertical' : 'horizontal'
    persistLayout()
    aplicarSplitCss()
    requestAnimationFrame(() => fitTodos())
    salvarSnapshot()
  }

  async function restaurarDoSnapshot(snap) {
    try {
      modo = snap.modo === 'split' ? 'split' : 'single'
      orientacao = snap.orientacao === 'vertical' ? 'vertical' : 'horizontal'
      persistLayout()
      splitEl.innerHTML = ''
      grupos.clear()
      divisorEl = null

      const defs = snap.grupos.slice(0, 2)
      const keys = defs.length >= 2 && modo === 'split' ? ['A', 'B'] : ['A']
      if (keys.length === 1) modo = 'single'

      for (let i = 0; i < keys.length; i++) {
        const g = criarDomGrupo(keys[i])
        if (i === 0) splitEl.appendChild(g.root)
        else {
          splitEl.appendChild(montarDivisor())
          splitEl.appendChild(g.root)
        }
        let abasDef = Array.isArray(defs[i]?.abas) ? defs[i].abas : [{ shellId: '' }]
        if (abasDef.length > MAX_ABAS_RESTORE) {
          console.info('[terminal] snapshot truncado a ' + MAX_ABAS_RESTORE + ' abas/grupo')
          abasDef = abasDef.slice(0, MAX_ABAS_RESTORE)
        }
        if (abasDef.length === 0) abasDef = [{ shellId: '' }]
        for (const meta of abasDef) {
          const sid =
            meta?.shellId && shellsCache?.some((o) => o.id === meta.shellId)
              ? meta.shellId
              : shellPadraoId || shellsCache?.[0]?.id || null
          await criarAba(g, sid)
        }
      }

      const ativoIdx = typeof snap.grupoAtivo === 'number' ? snap.grupoAtivo : 0
      const ativoKey = keys[Math.min(ativoIdx, keys.length - 1)] || 'A'
      grupoAtivoKey = ativoKey
      aplicarSplitCss()
      marcarGrupoAtivo(ativoKey)
      fitTodos()
      return true
    } catch (e) {
      console.info('[terminal] restore falhou, single 1 aba', e)
      return false
    }
  }

  async function abrirPainel() {
    if (aberto) return
    await carregarShells()

    aberto = true
    panel.classList.add('open')
    panel.setAttribute('aria-hidden', 'false')

    if (grupos.size === 0) {
      const snap = lerSnapshot()
      let ok = false
      if (snap) ok = await restaurarDoSnapshot(snap)
      if (!ok) {
        for (const key of [...grupos.keys()]) {
          try {
            await removerGrupo(key)
          } catch {
            /* */
          }
        }
        splitEl.innerHTML = ''
        grupos.clear()
        divisorEl = null
        const gA = criarDomGrupo('A')
        splitEl.appendChild(gA.root)
        grupoAtivoKey = 'A'
        modo = 'single'
        aplicarSplitCss()
        await criarAba(gA)
      }
    } else {
      aplicarSplitCss()
      fitTodos()
      abaAtivaDoGrupo(grupoAtivo())?.xterm.focus()
    }

    syncShellUi()

    if (!observer) {
      observer = new ResizeObserver(() => fitTodos())
      observer.observe(splitEl)
    }
  }

  async function fecharPainel(destruir = true) {
    aberto = false
    panel.classList.remove('open')
    panel.setAttribute('aria-hidden', 'true')
    if (destruir) {
      salvarSnapshot()
      for (const key of [...grupos.keys()]) {
        await removerGrupo(key)
      }
      splitEl.innerHTML = ''
      divisorEl = null
      modo = localStorage.getItem(LS_MODE) === 'split' ? 'split' : 'single'
    }
  }

  function toggle() {
    if (aberto) {
      void fecharPainel(true)
      return
    }
    // Docked: abrir painel direito na aba Terminal (Ctrl+` / icon-bar)
    try {
      window.dgUi?.toggleRight?.(true)
      window.dgUi?.ativarAbaDireita?.('terminal')
    } catch {
      /* app ainda nao expoe dgUi */
    }
    void abrirPainel().then(() => {
      requestAnimationFrame(() => fitTodos())
    })
  }

  selectEl?.addEventListener('focus', () => {
    void carregarShells().then(() => syncShellUi())
  })
  selectEl?.addEventListener('change', () => {
    const g = grupoAtivo()
    const a = abaAtivaDoGrupo(g)
    if (!g || !a || !selectEl.value) return
    void reiniciarAbaComShell(g, a, selectEl.value)
  })

  btnPadrao?.addEventListener('click', async () => {
    const id = selectEl?.value
    if (!id) return
    try {
      await apiTerm().setShellPadrao(id)
      shellPadraoId = id
      if (btnPadrao) {
        btnPadrao.textContent = '★'
        btnPadrao.classList.add('ativa')
        setTimeout(() => {
          btnPadrao.classList.remove('flash')
        }, 1500)
        btnPadrao.classList.add('flash')
      }
      syncShellUi()
    } catch (e) {
      console.warn('[terminal] setShellPadrao falhou', e)
    }
  })

  btnPadraoClear?.addEventListener('click', async () => {
    try {
      await apiTerm().setShellPadrao(null)
      shellPadraoId = null
      syncShellUi()
    } catch (e) {
      console.warn('[terminal] clear padrao falhou', e)
    }
  })

  btnClose?.addEventListener('click', () => void fecharPainel(true))
  btnClear?.addEventListener('click', () => abaAtivaDoGrupo(grupoAtivo())?.xterm.clear())
  btnSplit?.addEventListener('click', () => {
    if (!aberto) void abrirPainel().then(() => ativarSplit())
    else void ativarSplit()
  })
  btnUnsplit?.addEventListener('click', () => void fecharSplit())
  btnOrient?.addEventListener('click', () => alternarOrientacao())
  btnToggle?.addEventListener('click', () => toggle())

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === '`') {
      e.preventDefault()
      toggle()
      return
    }
    if (!aberto) return

    if (e.ctrlKey && e.altKey) {
      if (modo === 'split') {
        if (orientacao === 'horizontal' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          e.preventDefault()
          marcarGrupoAtivo(e.key === 'ArrowLeft' ? 'A' : 'B')
          return
        }
        if (orientacao === 'vertical' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault()
          marcarGrupoAtivo(e.key === 'ArrowUp' ? 'A' : 'B')
          return
        }
      }
    }

    if ((e.ctrlKey || e.metaKey) && !e.altKey && /^[1-9]$/.test(e.key)) {
      const g = grupoAtivo()
      if (!g || g.abas.size === 0) return
      const idx = parseInt(e.key, 10) - 1
      const ids = [...g.abas.keys()]
      if (idx >= 0 && idx < ids.length) {
        e.preventDefault()
        void ativarAba(g, ids[idx])
      }
    }
  })

  function alturaUtilMax() {
    return Math.floor(window.innerHeight * 0.6)
  }

  function alturaPadraoReset() {
    const max = alturaUtilMax()
    return Math.max(120, Math.min(300, max))
  }

  function aplicarAlturaPainel(px, comTransicao) {
    const max = alturaUtilMax()
    const h = Math.min(max, Math.max(120, px))
    if (comTransicao) {
      panel.style.transition = 'height 120ms ease'
      const limpar = () => {
        panel.style.transition = ''
        panel.removeEventListener('transitionend', limpar)
      }
      panel.addEventListener('transitionend', limpar)
      setTimeout(limpar, 200)
    } else {
      panel.style.transition = ''
    }
    panel.style.height = h + 'px'
    localStorage.setItem(LS_HEIGHT, String(h))
    fitTodos()
  }

  /**
   * Abre o painel (se colapsado), cria aba no grupo ativo com cwd opcional e foca.
   * Exposto como window.dgTerminal.abrirEm para a árvore (app.js).
   */
  async function abrirEm(cwd) {
    const useCwd = typeof cwd === 'string' && cwd.trim() ? cwd.trim() : null
    if (!aberto) await abrirPainel()
    const g = grupoAtivo()
    if (!g) return null
    const shellId = abaAtivaDoGrupo(g)?.shellId
    const entry = await criarAba(g, shellId, useCwd)
    entry?.xterm?.focus()
    return entry
  }

  /**
   * Lê o buffer do xterm (canvas nao expoe texto no DOM).
   * @param {string} [abaId] id da aba; se omitido, usa a aba ativa do grupo ativo
   * @returns {string}
   */
  function acharAba(abaId) {
    if (abaId) {
      for (const g of grupos.values()) {
        if (g.abas.has(abaId)) return g.abas.get(abaId)
      }
    }
    return abaAtivaDoGrupo(grupoAtivo())
  }

  function bufferTexto(abaId) {
    const aba = acharAba(abaId)
    if (!aba || !aba.xterm) return ''
    try {
      const buf = aba.xterm.buffer.active
      const linhas = []
      // baseY..baseY+rows cobre o viewport; length cobre scrollback
      const fim = Math.max(buf.length, (buf.baseY || 0) + (aba.xterm.rows || 0))
      for (let i = 0; i < fim; i++) {
        const l = buf.getLine(i)
        if (l) linhas.push(l.translateToString(true))
      }
      return linhas.join('\n')
    } catch {
      return ''
    }
  }

  window.dgTerminal = {
    abrirEm,
    bufferTexto,
    abrir: () =>
      abrirPainel().then(() => {
        requestAnimationFrame(() => fitTodos())
      }),
    fit: fitTodos,
    isOpen: () => aberto
  }

  if (handle) {
    let startY = 0
    let startH = 0
    let startX = 0
    let dragging = false
    const onMove = (e) => {
      const dx = Math.abs(e.clientX - startX)
      const dy = Math.abs(e.clientY - startY)
      if (!dragging) {
        if (dx + dy <= 3) return
        dragging = true
        panel.style.transition = ''
      }
      const max = alturaUtilMax()
      const h = Math.min(max, Math.max(120, startH + (startY - e.clientY)))
      panel.style.height = h + 'px'
      fitTodos()
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (dragging) {
        localStorage.setItem(LS_HEIGHT, String(parseInt(panel.style.height, 10) || 220))
      }
      dragging = false
    }
    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      startY = e.clientY
      startX = e.clientX
      startH = panel.getBoundingClientRect().height
      dragging = false
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
    handle.addEventListener('dblclick', (e) => {
      e.preventDefault()
      e.stopPropagation()
      aplicarAlturaPainel(alturaPadraoReset(), true)
    })
  }

  const mo = new MutationObserver(() => aplicarTema())
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'] })
  window.addEventListener('resize', () => fitTodos())
}
