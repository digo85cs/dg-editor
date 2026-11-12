/**
 * Painel Navegador embutido — WebContentsView (chrome + conteúdo).
 * App: View host filha da BrowserWindow principal (aba Browser).
 * Smoke (DG_NAV_SMOKE=1): BaseWindow temporária (host com bounds controláveis).
 * Smoke embed (DG_NAV_SMOKE=1 + DG_NAV_SMOKE_EMBED=1): mesmo host View de produção
 *   (BrowserWindow pai injetada em index.ts) — cobre o caminho embed no smoke.
 * Partition persist:dgnav = sessão (cookies/localStorage) em disco.
 *
 * DÍVIDA DE ARQUITETURA — DOIS HOSTS (conteúdo unificado)
 *
 * DG_NAV_SMOKE=1 (sem EMBED) -> BaseWindow oculta (host legado; smoke 22/22).
 * DG_NAV_SMOKE_EMBED=1 -> View host (produção) com pai injetável.
 * Modo normal -> View host na BrowserWindow (bounds via navegador:bounds).
 *
 * Mitigação: criarViews + carregarUrlNasViews + layoutInterno são compartilhados.
 * Produção coberta por navegador:embed-status + e2e ui.browser.*.
 */
import {
  BaseWindow,
  BrowserWindow,
  View,
  WebContentsView,
  app,
  ipcMain,
  type WebContents
} from 'electron'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { dglog } from '../dglog'
import { projectStateDir, resolverRaizProjeto } from '../paths'

const PARTITION = 'persist:dgnav'
const CHROME_H = 52

export type OpcoesJanelaNavegador = {
  /** true = show+focus (app: torna visível no painel); smoke: show BaseWindow */
  mostrar?: boolean
}

let chamadasCriacao = 0
const timestampsCriacao: number[] = []

/** Isolamento de token/downloads do smoke (qualquer host). */
function emSmokeNav(): boolean {
  return process.env.DG_NAV_SMOKE === '1'
}

/** Host legado BaseWindow — só smoke clássico, sem EMBED. */
function usaHostBaseWindow(): boolean {
  return process.env.DG_NAV_SMOKE === '1' && process.env.DG_NAV_SMOKE_EMBED !== '1'
}

function registrarChamadaCriacao(): void {
  chamadasCriacao += 1
  const agora = Date.now()
  timestampsCriacao.push(agora)
  while (timestampsCriacao.length && agora - timestampsCriacao[0] > 5000) {
    timestampsCriacao.shift()
  }
  dglog(`[navegador] criarJanelaNavegador #${chamadasCriacao} (em5s=${timestampsCriacao.length})`)
  if (timestampsCriacao.length > 20) {
    dglog(
      `[navegador] AVISO: criarJanelaNavegador chamada ${timestampsCriacao.length}x em 5s — possível loop`
    )
  }
}

function caminhoUltimaUrl(): string {
  const nome =
    process.env.DG_NAV_SMOKE === '1' ? 'nav-ultima-url.smoke' : 'nav-ultima-url'
  return join(projectStateDir(resolverRaizProjeto()), nome)
}

export function lerUltimaUrlNavegador(): string {
  try {
    const p = caminhoUltimaUrl()
    if (!existsSync(p)) return 'about:blank'
    const u = readFileSync(p, 'utf8').trim()
    if (!u || u === 'about:blank' || u.startsWith('data:')) return 'about:blank'
    return u
  } catch {
    return 'about:blank'
  }
}

function salvarUltimaUrl(url: string): void {
  try {
    if (!url || url === 'about:blank' || url.startsWith('data:')) return
    const p = caminhoUltimaUrl()
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, url, 'utf8')
  } catch {
    /* best-effort */
  }
}

const CHROME_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>DG Nav</title>
<style>
  html,body{margin:0;padding:0;height:100%;width:100%;font:13px/1.3 system-ui,Segoe UI,sans-serif;background:#1a1a1a;color:#e8e8e8;user-select:none}
  #bar{display:flex;align-items:center;gap:6px;height:100%;width:100%;padding:0 8px;box-sizing:border-box;border-bottom:1px solid #333}
  button{background:#2a2a2a;border:1px solid #444;color:#eee;border-radius:4px;padding:4px 10px;cursor:pointer}
  button:disabled{opacity:.35;cursor:default}
  button:hover:not(:disabled){background:#333}
  #url{flex:1;min-width:0;background:#111;border:1px solid #444;color:#eee;border-radius:4px;padding:6px 8px;outline:none}
  #url:focus{border-color:#6af}
  #titulo{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.7;font-size:12px}
</style>
</head>
<body>
<div id="bar">
  <button id="back" title="Voltar" disabled>◀</button>
  <button id="fwd" title="Avançar" disabled>▶</button>
  <button id="rel" title="Recarregar">↻</button>
  <input id="url" type="text" spellcheck="false" placeholder="https://…"/>
  <button id="go">Ir</button>
  <span id="titulo"></span>
</div>
<script>
  const url=document.getElementById('url')
  const back=document.getElementById('back')
  const fwd=document.getElementById('fwd')
  const rel=document.getElementById('rel')
  const go=document.getElementById('go')
  const titulo=document.getElementById('titulo')
  function navegar(){
    let u=url.value.trim()
    if(!u) return
    if(!/^https?:\\/\\//i.test(u)) u='https://'+u
    window.dgnav.navegar(u)
  }
  go.onclick=navegar
  url.addEventListener('keydown',e=>{ if(e.key==='Enter') navegar() })
  back.onclick=()=>window.dgnav.voltar()
  fwd.onclick=()=>window.dgnav.avancar()
  rel.onclick=()=>window.dgnav.recarregar()
  window.dgnav.onEstado(s=>{
    if(typeof s.url==='string' && document.activeElement!==url) url.value=s.url
    if(typeof s.titulo==='string') titulo.textContent=s.titulo||''
    back.disabled=!s.canBack
    fwd.disabled=!s.canForward
  })
</script>
</body>
</html>`

const CHROME_PRELOAD = `'use strict'
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('dgnav', {
  navegar: (url) => ipcRenderer.send('dgnav:navegar', url),
  voltar: () => ipcRenderer.send('dgnav:voltar'),
  avancar: () => ipcRenderer.send('dgnav:avancar'),
  recarregar: () => ipcRenderer.send('dgnav:recarregar'),
  onEstado: (cb) => {
    const handler = (_e, s) => cb(s)
    ipcRenderer.on('dgnav:estado', handler)
    return () => ipcRenderer.removeListener('dgnav:estado', handler)
  }
})
`

export type EstadoNavegador = {
  aberto: boolean
  url: string
  titulo: string
  carregando: boolean
  logado: boolean | null
}

type Listeners = {
  onNavigate?: (url: string) => void
  onFinish?: (url: string) => void
  onTitle?: (titulo: string) => void
  onClose?: () => void
}

type Bounds = { x: number; y: number; width: number; height: number }

/** Smoke: BaseWindow host. App: null (usa hostView na principal). */
let janelaSmoke: BaseWindow | null = null
/** App: container View na BrowserWindow principal. */
let hostView: View | null = null
let chromeView: WebContentsView | null = null
let contentView: WebContentsView | null = null
let parentWin: BrowserWindow | null = null
let carregando = false
let ipcPronto = false
let embutidoVisivel = false
let ultimoBounds: Bounds = { x: 0, y: 0, width: 0, height: 0 }
let hostAnexado = false
/** true após criar; false após fechar (mesmo com views ainda em memória no app). */
let sessaoAberta = false
const listeners: Listeners = {}

function garantirChromePreload(): string {
  const dir = join(app.getPath('userData'), 'navegador-ui')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const p = join(dir, 'chrome-preload.cjs')
  writeFileSync(p, CHROME_PRELOAD, 'utf8')
  return p
}

/** Layout relativo ao host (smoke BaseWindow ou View embutida). */
function layoutInterno(width: number, height: number): void {
  if (!chromeView || !contentView) return
  chromeView.setBounds({ x: 0, y: 0, width, height: CHROME_H })
  contentView.setBounds({
    x: 0,
    y: CHROME_H,
    width,
    height: Math.max(0, height - CHROME_H)
  })
}

function layoutSmoke(): void {
  if (!janelaSmoke || janelaSmoke.isDestroyed()) return
  const { width, height } = janelaSmoke.getContentBounds()
  layoutInterno(width, height)
}

/** Bounds do #browser-mount (coordenadas da content area da janela principal). */
export function layoutNavegador(b: Bounds): void {
  if (usaHostBaseWindow()) {
    layoutSmoke()
    return
  }
  if (!hostView || !chromeView || !contentView) return
  ultimoBounds = {
    x: Math.round(b.x),
    y: Math.round(b.y),
    width: Math.max(0, Math.round(b.width)),
    height: Math.max(0, Math.round(b.height))
  }
  if (!embutidoVisivel) {
    hostView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    return
  }
  hostView.setBounds(ultimoBounds)
  layoutInterno(ultimoBounds.width, ultimoBounds.height)
}

export function mostrarNavegadorEmbutido(mostrar: boolean): void {
  if (usaHostBaseWindow()) return
  embutidoVisivel = !!mostrar
  if (!hostView) return
  if (!mostrar) {
    hostView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    return
  }
  if (ultimoBounds.width > 0 && ultimoBounds.height > 0) {
    hostView.setBounds(ultimoBounds)
    layoutInterno(ultimoBounds.width, ultimoBounds.height)
  }
}

export function definirJanelaPrincipalNavegador(win: BrowserWindow | null): void {
  parentWin = win
  if (win && !win.isDestroyed()) {
    win.on('closed', () => {
      if (parentWin === win) {
        destruirNavegador()
        parentWin = null
      }
    })
  }
}

function canGoBack(wc: WebContents): boolean {
  const nh = (wc as WebContents & { navigationHistory?: { canGoBack(): boolean } }).navigationHistory
  if (nh && typeof nh.canGoBack === 'function') return nh.canGoBack()
  return typeof wc.canGoBack === 'function' ? wc.canGoBack() : false
}

function canGoForward(wc: WebContents): boolean {
  const nh = (wc as WebContents & { navigationHistory?: { canGoForward(): boolean } }).navigationHistory
  if (nh && typeof nh.canGoForward === 'function') return nh.canGoForward()
  return typeof wc.canGoForward === 'function' ? wc.canGoForward() : false
}

function goBack(wc: WebContents): void {
  const nh = (wc as WebContents & { navigationHistory?: { goBack(): void } }).navigationHistory
  if (nh && typeof nh.goBack === 'function') nh.goBack()
  else if (typeof wc.goBack === 'function') wc.goBack()
}

function goForward(wc: WebContents): void {
  const nh = (wc as WebContents & { navigationHistory?: { goForward(): void } }).navigationHistory
  if (nh && typeof nh.goForward === 'function') nh.goForward()
  else if (typeof wc.goForward === 'function') wc.goForward()
}

function emitirEstadoChrome(): void {
  if (!chromeView || !contentView) return
  const wc = contentView.webContents
  chromeView.webContents.send('dgnav:estado', {
    url: wc.getURL(),
    titulo: wc.getTitle(),
    canBack: canGoBack(wc),
    canForward: canGoForward(wc)
  })
}

function registrarIpc(): void {
  if (ipcPronto) return
  ipcPronto = true
  ipcMain.on('dgnav:navegar', (_e, url: string) => {
    if (contentView && typeof url === 'string') void navegarPara(url)
  })
  ipcMain.on('dgnav:voltar', () => {
    if (contentView) goBack(contentView.webContents)
  })
  ipcMain.on('dgnav:avancar', () => {
    if (contentView) goForward(contentView.webContents)
  })
  ipcMain.on('dgnav:recarregar', () => {
    contentView?.webContents.reload()
  })
}

/** Heurística simples: cookie de sessão OU ausência de input password. */
export async function detectarLogado(): Promise<boolean | null> {
  if (!contentView) return null
  const wc = contentView.webContents
  const url = wc.getURL()
  if (!url || url === 'about:blank') return null
  try {
    let hasSessionCookie = false
    try {
      const cookies = await wc.session.cookies.get({ url })
      hasSessionCookie = cookies.some((c) =>
        /session|sess|auth|token|sid|jwt|login|user/i.test(c.name)
      )
    } catch {
      /* url inválida p/ cookies */
    }
    const hasPassword = await wc.executeJavaScript(
      `!!document.querySelector('input[type="password"]')`,
      true
    )
    return hasSessionCookie || !hasPassword
  } catch {
    return null
  }
}

/** Controles de histórico/recarregar para a toolbar do Bloco 3. */
export function navegadorVoltar(): { ok: boolean; canBack?: boolean; erro?: string } {
  if (!contentView) return { ok: false, erro: 'navegador fechado' }
  const wc = contentView.webContents
  if (!canGoBack(wc)) return { ok: true, canBack: false }
  goBack(wc)
  emitirEstadoChrome()
  return { ok: true, canBack: true }
}

export function navegadorAvancar(): { ok: boolean; canForward?: boolean; erro?: string } {
  if (!contentView) return { ok: false, erro: 'navegador fechado' }
  const wc = contentView.webContents
  if (!canGoForward(wc)) return { ok: true, canForward: false }
  goForward(wc)
  emitirEstadoChrome()
  return { ok: true, canForward: true }
}

export function navegadorRecarregar(): { ok: boolean; erro?: string } {
  if (!contentView) return { ok: false, erro: 'navegador fechado' }
  try {
    contentView.webContents.reload()
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: String(e) }
  }
}

export function getContentWebContents(): WebContents | null {
  return contentView?.webContents ?? null
}

export function getContentView(): WebContentsView | null {
  return contentView
}

/** Reaplica bounds chrome+conteúdo (necessário antes de capturePage). */
export function forcarLayoutNavegador(): { width: number; height: number } | null {
  if (!contentView) return null
  if (usaHostBaseWindow()) {
    if (!janelaSmoke || janelaSmoke.isDestroyed()) return null
    layoutSmoke()
  } else if (hostView && embutidoVisivel && ultimoBounds.width > 0) {
    layoutNavegador(ultimoBounds)
  } else if (hostView) {
    // smoke embed / controle: força tamanho mínimo para screenshot
    hostView.setBounds({ x: 0, y: 0, width: 1280, height: 800 })
    layoutInterno(1280, 800)
  } else {
    return null
  }
  const b = contentView.getBounds()
  return { width: b.width, height: b.height }
}

export function getPartition(): string {
  return PARTITION
}

function navegadorAberto(): boolean {
  if (!contentView || !sessaoAberta) return false
  if (usaHostBaseWindow()) return !!(janelaSmoke && !janelaSmoke.isDestroyed())
  return hostAnexado
}

export function estadoAtual(): EstadoNavegador {
  if (!contentView || !navegadorAberto()) {
    return { aberto: false, url: '', titulo: '', carregando: false, logado: null }
  }
  const wc = contentView.webContents
  return {
    aberto: true,
    url: wc.getURL(),
    titulo: wc.getTitle(),
    carregando,
    logado: null
  }
}

/** Status do caminho de produção (embed) vs smoke — para UI/diagnóstico. */
export function statusEmbedNavegador(): {
  modo: 'smoke' | 'embed'
  host: 'smoke' | 'embed'
  hostAnexado: boolean
  embutidoVisivel: boolean
  aberto: boolean
  bounds: Bounds | null
  conteudoCompartilhado: true
} {
  const host = caminhoHostNavegador()
  return {
    modo: host,
    host,
    hostAnexado,
    embutidoVisivel,
    aberto: navegadorAberto(),
    bounds: ultimoBounds.width > 0 ? { ...ultimoBounds } : null,
    /** chrome/content/loadURL via criarViews+carregarUrlNasViews nos dois hosts */
    conteudoCompartilhado: true
  }
}

export async function estadoComLogado(): Promise<EstadoNavegador> {
  const base = estadoAtual()
  if (!base.aberto) return base
  return { ...base, logado: await detectarLogado() }
}

export function focarJanela(): void {
  if (usaHostBaseWindow() && janelaSmoke && !janelaSmoke.isDestroyed()) {
    if (janelaSmoke.isMinimized()) janelaSmoke.restore()
    janelaSmoke.focus()
    return
  }
  if (parentWin && !parentWin.isDestroyed()) parentWin.focus()
}

/** Smoke: BaseWindow. App embutido: null. */
export function getJanelaNavegador(): BaseWindow | null {
  if (!janelaSmoke || janelaSmoke.isDestroyed()) return null
  return janelaSmoke
}

export async function navegarPara(
  url: string,
  timeoutMs = 30_000
): Promise<{ ok: boolean; url: string; erro?: string }> {
  if (!contentView) return { ok: false, url: '', erro: 'navegador fechado' }
  const wc = contentView.webContents
  let destino = url.trim()
  if (
    !/^https?:\/\//i.test(destino) &&
    !destino.startsWith('about:') &&
    !destino.startsWith('data:') &&
    !destino.startsWith('file:')
  ) {
    destino = 'https://' + destino
  }
  return new Promise((resolve) => {
    let done = false
    const finish = (ok: boolean, erro?: string) => {
      if (done) return
      done = true
      clearTimeout(timer)
      wc.removeListener('did-finish-load', onOk)
      wc.removeListener('did-fail-load', onFail)
      resolve({ ok, url: wc.getURL(), erro })
    }
    const timer = setTimeout(() => finish(false, 'timeout did-finish-load'), timeoutMs)
    const onOk = () => finish(true)
    const onFail = (
      _e: Electron.Event,
      _ec: number,
      errorDescription: string,
      _validatedURL: string,
      isMainFrame: boolean
    ) => {
      if (!isMainFrame) return
      finish(false, errorDescription || 'falha navegacao')
    }
    wc.addListener('did-finish-load', onOk)
    wc.addListener('did-fail-load', onFail)
    void wc.loadURL(destino)
  })
}

function ligarEventosContent(wc: WebContents): void {
  wc.setWindowOpenHandler(({ url }) => {
    void wc.loadURL(url)
    return { action: 'deny' }
  })
  wc.on('did-start-loading', () => {
    carregando = true
  })
  wc.on('did-stop-loading', () => {
    carregando = false
    emitirEstadoChrome()
  })
  wc.on('did-navigate', (_e, url) => {
    salvarUltimaUrl(url)
    listeners.onNavigate?.(url)
    emitirEstadoChrome()
  })
  wc.on('did-navigate-in-page', (_e, url) => {
    salvarUltimaUrl(url)
    listeners.onNavigate?.(url)
    emitirEstadoChrome()
  })
  wc.on('did-finish-load', () => {
    listeners.onFinish?.(wc.getURL())
    emitirEstadoChrome()
  })
  wc.on('page-title-updated', (_e, title) => {
    listeners.onTitle?.(title)
    if (janelaSmoke && !janelaSmoke.isDestroyed()) {
      janelaSmoke.setTitle(title ? `DG Navegador — ${title}` : 'DG Navegador')
    }
    emitirEstadoChrome()
  })
}

function criarViews(): void {
  const preload = garantirChromePreload()
  chromeView = new WebContentsView({
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  contentView = new WebContentsView({
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  })
  try {
    contentView.webContents.session.setSpellCheckerLanguages(['pt-BR', 'en-US'])
  } catch {
    /* ignore */
  }
  chromeView.webContents.loadURL(
    'data:text/html;charset=utf-8,' + encodeURIComponent(CHROME_HTML)
  )
  ligarEventosContent(contentView.webContents)
}

/** Caminho de conteúdo compartilhado smoke↔embed (loadURL na contentView). */
function carregarUrlNasViews(url: string): void {
  if (!contentView) return
  void contentView.webContents.loadURL(url || 'about:blank')
}

/** Host atual: smoke (BaseWindow) ou embed (View na principal / smoke-embed). */
export function caminhoHostNavegador(): 'smoke' | 'embed' {
  return usaHostBaseWindow() ? 'smoke' : 'embed'
}

function destruirNavegador(): void {
  try {
    if (janelaSmoke && !janelaSmoke.isDestroyed()) janelaSmoke.close()
  } catch {
    /* ignore */
  }
  janelaSmoke = null
  try {
    if (hostView && parentWin && !parentWin.isDestroyed()) {
      parentWin.contentView.removeChildView(hostView)
    }
  } catch {
    /* ignore */
  }
  hostView = null
  chromeView = null
  contentView = null
  hostAnexado = false
  embutidoVisivel = false
  sessaoAberta = false
  carregando = false
  dglog('[navegador] painel destruido (refs null)')
  try {
    listeners.onClose?.()
  } catch {
    /* ignore */
  }
}

/**
 * Cria/reutiliza o navegador.
 * Smoke: BaseWindow oculta. App: View host na janela principal.
 * Retorno tipado como BaseWindow | null — smoke usa a BaseWindow; app retorna null.
 */
export function criarJanelaNavegador(
  urlInicial?: string,
  opts?: OpcoesJanelaNavegador
): BaseWindow {
  registrarChamadaCriacao()
  const mostrar = opts?.mostrar === true
  const destino =
    urlInicial && urlInicial !== 'about:blank'
      ? urlInicial
      : urlInicial === 'about:blank'
        ? 'about:blank'
        : undefined

  // --- SMOKE clássico: BaseWindow (cenários 7/12 dependem do host) ---
  // Conteúdo (criarViews + carregarUrlNasViews + layoutInterno) = mesmo do embed.
  // Com DG_NAV_SMOKE_EMBED=1 cai no caminho APP abaixo (View host).
  if (usaHostBaseWindow()) {
    if (janelaSmoke && !janelaSmoke.isDestroyed()) {
      if (destino != null) carregarUrlNasViews(destino)
      if (mostrar) {
        if (!janelaSmoke.isVisible()) janelaSmoke.show()
        janelaSmoke.focus()
      }
      sessaoAberta = true
      dglog(`[navegador] smoke singleton reutilizado mostrar=${mostrar}`)
      return janelaSmoke
    }
    registrarIpc()
    janelaSmoke = new BaseWindow({
      width: 1280,
      height: 800,
      minWidth: 800,
      minHeight: 500,
      title: 'DG Navegador',
      backgroundColor: '#1a1a1a',
      show: false
    })
    criarViews()
    janelaSmoke.contentView.addChildView(chromeView!)
    janelaSmoke.contentView.addChildView(contentView!)
    layoutSmoke()
    janelaSmoke.on('resize', () => layoutSmoke())
    janelaSmoke.on('closed', () => {
      janelaSmoke = null
      chromeView = null
      contentView = null
      carregando = false
      sessaoAberta = false
      dglog('[navegador] smoke BaseWindow closed')
      try {
        listeners.onClose?.()
      } catch {
        /* ignore */
      }
    })
    sessaoAberta = true
    const urlLoad = destino || 'about:blank'
    carregarUrlNasViews(urlLoad)
    if (mostrar) {
      janelaSmoke.show()
      janelaSmoke.focus()
    }
    dglog(`[navegador] smoke BaseWindow criada url=${urlLoad}`)
    return janelaSmoke
  }

  // --- APP: embutido na janela principal ---
  registrarIpc()
  if (hostAnexado && hostView && chromeView && contentView) {
    sessaoAberta = true
    if (destino != null) carregarUrlNasViews(destino)
    if (mostrar) {
      embutidoVisivel = true
      if (ultimoBounds.width > 0) layoutNavegador(ultimoBounds)
    }
    dglog(`[navegador] embutido singleton reutilizado mostrar=${mostrar}`)
    return janelaSmoke as unknown as BaseWindow
  }

  if (!parentWin || parentWin.isDestroyed()) {
    dglog('[navegador] ERRO: janela principal nao definida — chamar definirJanelaPrincipalNavegador')
    throw new Error('navegador: janela principal ausente')
  }

  criarViews()
  hostView = new View()
  hostView.addChildView(chromeView!)
  hostView.addChildView(contentView!)
  parentWin.contentView.addChildView(hostView)
  hostAnexado = true
  sessaoAberta = true
  hostView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
  layoutInterno(0, 0)

  const urlLoad = destino || 'about:blank'
  carregarUrlNasViews(urlLoad)
  if (mostrar || process.env.DG_NAV_SMOKE_EMBED === '1') {
    embutidoVisivel = true
    if (process.env.DG_NAV_SMOKE_EMBED === '1') {
      // smoke-embed: pai oculta — força bounds úteis p/ captura/HTTP
      hostView.setBounds({ x: 0, y: 0, width: 1280, height: 800 })
      layoutInterno(1280, 800)
      ultimoBounds = { x: 0, y: 0, width: 1280, height: 800 }
    }
  }
  dglog(`[navegador] embutido criado partition=${PARTITION} url=${urlLoad}`)
  return janelaSmoke as unknown as BaseWindow
}

export function fecharJanelaNavegador(): void {
  if (usaHostBaseWindow()) {
    if (janelaSmoke && !janelaSmoke.isDestroyed()) janelaSmoke.close()
    return
  }
  // App / smoke-embed: ocultar (não destruir) — reabrir a aba reutiliza as views
  sessaoAberta = false
  mostrarNavegadorEmbutido(false)
  try {
    listeners.onClose?.()
  } catch {
    /* ignore */
  }
}

/** Destrói de verdade (sair do app). */
export function destruirJanelaNavegador(): void {
  destruirNavegador()
}

export function onNavegadorEventos(l: Listeners): void {
  Object.assign(listeners, l)
}
