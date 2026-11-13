/**
 * Painel de terminal: abas, perfis, split, drag-and-drop e restauração de layout.
 */
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { lerPreferenciasA11y } from './features/ui/acessibilidade.js'
import '@xterm/xterm/css/xterm.css'

const LS_HEIGHT = 'dg-terminal-height'
const LS_MODE = 'dg-terminal-mode'
const LS_ORIENT = 'dg-terminal-orient'
const LS_SPLIT_RATIO = 'dg-terminal-split-ratio'
const LS_LAYOUT = 'dg.terminal.layout'
const LS_PERFIS = 'dg.terminal.perfis'
const MAX_ABAS_RESTORE = 4
const MAX_SCROLLBACK_LINHAS = 80
const MAX_SCROLLBACK_CHARS = 8000

function lerPerfis() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_PERFIS) || '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter((p) => p && typeof p.id === 'string' && typeof p.nome === 'string')
      .slice(0, 30)
      .map((p) => ({
        id: p.id,
        nome: String(p.nome).slice(0, 60),
        shellId: typeof p.shellId === 'string' && p.shellId ? p.shellId : null,
        cwd: typeof p.cwd === 'string' && p.cwd ? p.cwd : null
      }))
  } catch {
    return []
  }
}

function gravarPerfis(lista) {
  try {
    localStorage.setItem(LS_PERFIS, JSON.stringify(lista.slice(0, 30)))
  } catch {
    /* quota cheia */
  }
}

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
    black: cssVar('--dg-term-black', '#4a4a4a'),
    red: cssVar('--dg-term-red', '#f07178'),
    green: cssVar('--dg-term-green', '#4fbf82'),
    yellow: cssVar('--dg-term-yellow', '#e3c34a'),
    blue: cssVar('--dg-term-blue', '#82aaff'),
    magenta: cssVar('--dg-term-magenta', '#c792ea'),
    cyan: cssVar('--dg-term-cyan', '#89ddff'),
    brightBlack: cssVar('--dg-term-bright-black', '#a0a0a0'),
    brightRed: cssVar('--dg-term-bright-red', '#f07178'),
    brightGreen: cssVar('--dg-term-bright-green', '#4fbf82'),
    brightYellow: cssVar('--dg-term-bright-yellow', '#e3c34a'),
    brightBlue: cssVar('--dg-term-bright-blue', '#82aaff'),
    brightMagenta: cssVar('--dg-term-bright-magenta', '#c792ea'),
    brightCyan: cssVar('--dg-term-bright-cyan', '#89ddff'),
    white: cssVar('--dg-term-white', '#f5f5f5'),
    brightWhite: cssVar('--dg-term-bright-white', '#ffffff')
  }
}

function apiTerm() {
  return window.api?.terminal
}

function formatShellLabel(shell) {
  if (!shell) return ''
  if (typeof shell === 'string') return rotuloDoShellId(shell)
  if (shell.tipo === 'pwsh' || shell.tipo === 'pwsh-preview') {
    return `pwsh ${shell.versao || ''}`.trim()
  }
  if (shell.tipo === 'powershell') return 'Windows PowerShell'
  return shell.tipo || 'shell'
}

/** Traduz o id tecnico do shell (pwsh-7.5.4 / powershell-5.1 / cmd) para rotulo. */
function rotuloDoShellId(id) {
  if (typeof id !== 'string' || !id) return ''
  if (id === 'cmd') return 'cmd'
  if (id.startsWith('powershell-')) return 'Windows PowerShell ' + id.slice('powershell-'.length)
  if (id.startsWith('pwsh-preview-')) return 'pwsh ' + id.slice('pwsh-preview-'.length) + ' (preview)'
  if (id.startsWith('pwsh-')) return 'pwsh ' + id.slice('pwsh-'.length)
  return id
}

function shellIdFromInfo(shell) {
  if (!shell) return null
  if (shell.tipo === 'cmd') return 'cmd'
  if (shell.tipo === 'powershell') return 'powershell-' + (shell.versao || '5.1')
  if (shell.tipo === 'pwsh-preview') return 'pwsh-preview-' + (shell.versao || 'x')
  return 'pwsh-' + (shell.versao || 'x')
}

/**
 * @typedef {{ id: string, titulo: string, shellId: string|null, cwd: string|null, xterm: any, fit: any, pane: HTMLElement, tabBtn: HTMLElement, unsubData: (()=>void)|null, unsubExit: (()=>void)|null }} Aba
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
  const perfisEl = document.getElementById('terminal-perfil-select')
  const btnPerfilSalvar = document.getElementById('terminal-btn-perfil-salvar')
  const btnPerfilRemover = document.getElementById('terminal-btn-perfil-remover')
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
  let perfis = lerPerfis()
  let perfilSelecionado = null
  let timerSnapshotCwd = null
  let timerSnapshotOcioso = null

  function agendarSnapshotOcioso() {
    if (timerSnapshotOcioso) clearTimeout(timerSnapshotOcioso)
    timerSnapshotOcioso = setTimeout(() => {
      timerSnapshotOcioso = null
      if (aberto) salvarSnapshot()
    }, 2500)
  }

  function escreverScrollbackRestaurado(xterm, texto) {
    const linhas = String(texto).replace(/\r/g, '').split('\n').slice(-MAX_SCROLLBACK_LINHAS)
    if (!linhas.length) return
    try {
      xterm.write('\x1b[90m' + linhas.join('\r\n') + '\x1b[0m\r\n')
    } catch {
      /* xterm descartado */
    }
  }
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

  function resumoScrollback(a) {
    try {
      const txt = bufferTexto(a.id)
      if (!txt) return ''
      const linhas = txt.replace(/\r/g, '').split('\n')
      while (linhas.length && !linhas[linhas.length - 1].trim()) linhas.pop()
      return linhas.slice(-MAX_SCROLLBACK_LINHAS).join('\n').slice(-MAX_SCROLLBACK_CHARS)
    } catch {
      return ''
    }
  }

  function salvarSnapshot() {
    try {
      const keys = [...grupos.keys()].sort()
      const snap = {
        modo,
        orientacao,
        grupos: keys.map((k) => ({
          abas: [...(grupos.get(k)?.abas.values() || [])].map((a) => ({
            shellId: a.shellId || '',
            cwd: a.cwd || '',
            perfilNome: a.perfilNome || '',
            scrollback: resumoScrollback(a)
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

  /** Aplica o tamanho de fonte preferido em todas as abas abertas. */
  function aplicarFonte(px) {
    const n = Math.max(10, Math.min(18, Math.round(Number(px) || 13)))
    for (const g of grupos.values()) {
      for (const a of g.abas.values()) {
        try {
          a.xterm.options.fontSize = n
        } catch {
          /* xterm já descartado */
        }
      }
      fitEResize(g, g.ativoId)
    }
    return n
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
      a.titulo = a.perfilNome || `Terminal ${idx}`
      a.tabBtn.title = a.cwd ? a.cwd : a.titulo
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
      const r = await apiTerm().shells()
      const lista = r && Array.isArray(r.shells) ? r.shells : Array.isArray(r) ? r : []
      shellsCache = lista
    } catch {
      shellsCache = []
    }
    try {
      const r = await apiTerm().getShellPadrao()
      const id = r && typeof r === 'object' && 'shell' in r ? r.shell : r
      shellPadraoId = typeof id === 'string' && id ? id : null
    } catch {
      shellPadraoId = null
    }
    return shellsCache
  }

  function syncShellUi() {
    const g = grupoAtivo()
    const a = abaAtivaDoGrupo(g)
    const lista = shellsCache || []
    syncPerfisUi()
    if (!selectEl || !label) return

    if (!lista.length) {
      selectEl.hidden = true
      if (btnPadrao) btnPadrao.hidden = true
      if (btnPadraoClear) btnPadraoClear.hidden = true
      label.hidden = false
      label.textContent = a ? formatShellLabel(a.shellId || 'pwsh') : ''
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

  function syncPerfisUi() {
    if (!perfisEl) return
    perfisEl.innerHTML = ''
    const ph = document.createElement('option')
    ph.value = ''
    ph.textContent = perfis.length ? 'Perfis…' : 'Perfis (vazio)'
    perfisEl.appendChild(ph)
    for (const p of perfis) {
      const opt = document.createElement('option')
      opt.value = p.id
      opt.textContent = p.nome + (p.shellId ? ' · ' + rotuloDoShellId(p.shellId) : '')
      if (p.cwd) opt.title = p.cwd
      perfisEl.appendChild(opt)
    }
    perfisEl.disabled = !aberto
    perfisEl.value = ''
    const a = abaAtivaDoGrupo(grupoAtivo())
    if (btnPerfilSalvar) btnPerfilSalvar.hidden = !aberto || !a
    if (btnPerfilRemover) btnPerfilRemover.hidden = !aberto || !perfis.length
  }

  perfisEl?.addEventListener('change', () => {
    const pid = perfisEl.value
    perfilSelecionado = pid || null
    perfisEl.value = ''
    const p = perfis.find((x) => x.id === pid)
    if (!p || !aberto) return
    const g = grupoAtivo()
    if (!g) return
    void criarAba(g, p.shellId || null, p.cwd || undefined, { perfilNome: p.nome })
  })

  btnPerfilSalvar?.addEventListener('click', () => {
    const a = abaAtivaDoGrupo(grupoAtivo())
    if (!a) return
    const sugestao = (a.perfilNome || 'Perfil') + ' ' + (perfis.length + 1)
    const nome = String(window.prompt('Nome do perfil:', sugestao) || '').trim()
    if (!nome) return
    perfis.push({
      id: 'perfil-' + Date.now().toString(36),
      nome: nome.slice(0, 60),
      shellId: a.shellId || null,
      cwd: a.cwd || null
    })
    gravarPerfis(perfis)
    syncPerfisUi()
  })

  btnPerfilRemover?.addEventListener('click', () => {
    const pid = perfisEl?.value || perfilSelecionado
    const p = perfis.find((x) => x.id === pid)
    if (!p) return
    if (!window.confirm('Remover o perfil "' + p.nome + '"?')) return
    perfis = perfis.filter((x) => x.id !== p.id)
    perfilSelecionado = null
    gravarPerfis(perfis)
    syncPerfisUi()
  })

  apiTerm().onCwd?.(({ id, cwd }) => {
    const a = acharAba(id)
    if (!a || typeof cwd !== 'string' || !cwd) return
    a.cwd = cwd
    for (const g of grupos.values()) {
      if (g.abas.has(id)) {
        renderTabs(g)
        break
      }
    }
    if (timerSnapshotCwd) clearTimeout(timerSnapshotCwd)
    timerSnapshotCwd = setTimeout(() => {
      timerSnapshotCwd = null
      salvarSnapshot()
    }, 500)
  })

  async function criarAba(g, shellIdHeranca, cwdOpt, extra = {}) {
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
      fontSize: lerPreferenciasA11y().tamanhoTerminal,
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
      titulo: extra.perfilNome || `Terminal ${g.abas.size + 1}`,
      perfilNome: extra.perfilNome || null,
      shellId: heranca,
      cwd: cwdOpt || null,
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
    if (created?.cwd) entry.cwd = created.cwd
    if (created?.erro) xterm.writeln('\r\n[erro] ' + created.erro)

    // O shell limpa a tela ao iniciar; grava o historico quando a saida ficar ociosa.
    let scrollPendente = extra.scrollback ? String(extra.scrollback) : ''
    let timerScroll = null
    const aplicarScroll = () => {
      if (!scrollPendente) return
      const txt = scrollPendente
      scrollPendente = ''
      if (timerScroll) clearTimeout(timerScroll)
      timerScroll = null
      escreverScrollbackRestaurado(xterm, txt)
    }
    if (scrollPendente) {
      timerScroll = setTimeout(aplicarScroll, 2500)
    }

    entry.unsubData = apiTerm().onData(({ id: sid, data }) => {
      if (sid !== id) return
      xterm.write(data)
      if (scrollPendente) {
        if (timerScroll) clearTimeout(timerScroll)
        timerScroll = setTimeout(aplicarScroll, 300)
      }
      agendarSnapshotOcioso()
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
    if (a.cwd) opts.cwd = a.cwd
    const created = await apiTerm().create(a.id, opts)
    if (created?.shell) a.shellId = shellIdFromInfo(created.shell) || shellId
    if (created?.erro) a.xterm.writeln('\r\n[erro] ' + created.erro)
    a.unsubData = apiTerm().onData(({ id: sid, data }) => {
      if (sid !== a.id) return
      a.xterm.write(data)
      agendarSnapshotOcioso()
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
          await criarAba(g, sid, meta?.cwd || undefined, {
            scrollback: typeof meta?.scrollback === 'string' ? meta.scrollback : '',
            perfilNome: typeof meta?.perfilNome === 'string' && meta.perfilNome ? meta.perfilNome : null
          })
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
    syncPerfisUi()
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
      // Ocultar preserva as abas e os ptys vivos (Ctrl+` volta na mesma sessão).
      salvarSnapshot()
      void fecharPainel(false)
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
    cwdAtual: () => abaAtivaDoGrupo(grupoAtivo())?.cwd || null,
    abrir: () =>
      abrirPainel().then(() => {
        requestAnimationFrame(() => fitTodos())
      }),
    alternar: toggle,
    ocultar: () => {
      if (!aberto) return Promise.resolve()
      salvarSnapshot()
      return fecharPainel(false)
    },
    fechar: () => fecharPainel(true),
    fit: fitTodos,
    aplicarFonte,
    isOpen: () => aberto
  }

  // Drag vertical / dblclick de altura removidos (P6): terminal docked no painel direito.
  // #terminal-resize-handle permanece no HTML (oculto via CSS). window.resize → fitTodos mantido.

  const mo = new MutationObserver(() => aplicarTema())
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'] })
  window.addEventListener('resize', () => fitTodos())
}
