/**
 * Painel Navegador embutido — BaseWindow + WebContentsView (Electron 30+).
 * Partition persist:dgnav = sessão (cookies/localStorage) em disco.
 * Sem BrowserView, sem <webview>, sem iframe.
 */
import {
  BaseWindow,
  WebContentsView,
  app,
  ipcMain,
  type WebContents
} from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { dglog } from '../dglog'

const PARTITION = 'persist:dgnav'
const CHROME_H = 52

const CHROME_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>DG Nav</title>
<style>
  html,body{margin:0;padding:0;height:100%;font:13px/1.3 system-ui,Segoe UI,sans-serif;background:#1a1a1a;color:#e8e8e8;user-select:none}
  #bar{display:flex;align-items:center;gap:6px;height:100%;padding:0 8px;box-sizing:border-box;border-bottom:1px solid #333}
  button{background:#2a2a2a;border:1px solid #444;color:#eee;border-radius:4px;padding:4px 10px;cursor:pointer}
  button:disabled{opacity:.35;cursor:default}
  button:hover:not(:disabled){background:#333}
  #url{flex:1;background:#111;border:1px solid #444;color:#eee;border-radius:4px;padding:6px 8px;outline:none}
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
}

let janela: BaseWindow | null = null
let chromeView: WebContentsView | null = null
let contentView: WebContentsView | null = null
let carregando = false
let ipcPronto = false
const listeners: Listeners = {}

function garantirChromePreload(): string {
  const dir = join(app.getPath('userData'), 'navegador-ui')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const p = join(dir, 'chrome-preload.cjs')
  writeFileSync(p, CHROME_PRELOAD, 'utf8')
  return p
}

function layout(): void {
  if (!janela || !chromeView || !contentView) return
  const { width, height } = janela.getContentBounds()
  chromeView.setBounds({ x: 0, y: 0, width, height: CHROME_H })
  contentView.setBounds({ x: 0, y: CHROME_H, width, height: Math.max(0, height - CHROME_H) })
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

export function getContentWebContents(): WebContents | null {
  return contentView?.webContents ?? null
}

export function getContentView(): WebContentsView | null {
  return contentView
}

export function getPartition(): string {
  return PARTITION
}

export function estadoAtual(): EstadoNavegador {
  if (!contentView || !janela || janela.isDestroyed()) {
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

export async function estadoComLogado(): Promise<EstadoNavegador> {
  const base = estadoAtual()
  if (!base.aberto) return base
  return { ...base, logado: await detectarLogado() }
}

export function focarJanela(): void {
  if (janela && !janela.isDestroyed()) {
    if (janela.isMinimized()) janela.restore()
    janela.focus()
  }
}

export async function navegarPara(url: string, timeoutMs = 30_000): Promise<{ ok: boolean; url: string; erro?: string }> {
  if (!contentView) return { ok: false, url: '', erro: 'navegador fechado' }
  const wc = contentView.webContents
  let destino = url.trim()
  if (!/^https?:\/\//i.test(destino) && !destino.startsWith('about:')) {
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

export function criarJanelaNavegador(urlInicial = 'https://example.com'): BaseWindow {
  if (janela && !janela.isDestroyed()) {
    focarJanela()
    if (urlInicial) void navegarPara(urlInicial)
    return janela
  }

  registrarIpc()

  janela = new BaseWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: 'DG Navegador',
    backgroundColor: '#1a1a1a',
    show: false
  })

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
      // UA real do Chromium — não sobrescrever com string falsa
      spellcheck: true
    }
  })

  // locale pt-BR na sessão da partition
  try {
    contentView.webContents.session.setSpellCheckerLanguages(['pt-BR', 'en-US'])
  } catch {
    /* ignore */
  }

  janela.contentView.addChildView(chromeView)
  janela.contentView.addChildView(contentView)
  layout()

  chromeView.webContents.loadURL(
    'data:text/html;charset=utf-8,' + encodeURIComponent(CHROME_HTML)
  )

  const wc = contentView.webContents
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
    listeners.onNavigate?.(url)
    emitirEstadoChrome()
  })
  wc.on('did-navigate-in-page', (_e, url) => {
    listeners.onNavigate?.(url)
    emitirEstadoChrome()
  })
  wc.on('did-finish-load', () => {
    listeners.onFinish?.(wc.getURL())
    emitirEstadoChrome()
  })
  wc.on('page-title-updated', (_e, title) => {
    listeners.onTitle?.(title)
    if (janela && !janela.isDestroyed()) janela.setTitle(title ? `DG Navegador — ${title}` : 'DG Navegador')
    emitirEstadoChrome()
  })

  janela.on('resize', () => layout())
  janela.on('closed', () => {
    janela = null
    chromeView = null
    contentView = null
    carregando = false
    dglog('[navegador] painel fechado')
  })

  void wc.loadURL(urlInicial)
  janela.show()
  dglog('[navegador] painel aberto partition=' + PARTITION)
  return janela
}

export function fecharJanelaNavegador(): void {
  if (janela && !janela.isDestroyed()) janela.close()
}

export function onNavegadorEventos(l: Listeners): void {
  Object.assign(listeners, l)
}
