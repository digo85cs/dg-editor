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
  dialog,
  ipcMain,
  type WebContents
} from 'electron'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { dglog } from '../dglog'
import { projectStateDir, resolverRaizProjeto } from '../paths'
import { resolverCaminhoDownload } from './download-nome'

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

const HTML_INICIO = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Início — DG Navegador</title>
<style>
  :root{color-scheme:dark}
  html,body{height:100%;margin:0}
  body{display:flex;align-items:center;justify-content:center;background:#15171a;color:#e8e8e8;font:15px/1.5 system-ui,Segoe UI,sans-serif}
  main{width:min(640px,88vw);padding:24px}
  h1{margin:0 0 4px;font-size:24px;font-weight:600;letter-spacing:.2px}
  p.sub{margin:0 0 20px;opacity:.65;font-size:13px}
  form{display:flex;gap:8px;margin-bottom:22px}
  input[type=search]{flex:1;min-width:0;background:#0f1113;border:1px solid #343a40;color:#eee;border-radius:8px;padding:11px 14px;font-size:14px;outline:none}
  input[type=search]:focus{border-color:#5b9dff}
  button{background:#2b6cb0;border:0;color:#fff;border-radius:8px;padding:11px 18px;font-size:14px;cursor:pointer}
  button:hover{background:#2f7ac6}
  section{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:24px}
  a{display:block;padding:9px 14px;border:1px solid #2c3138;border-radius:8px;color:#cbd5e1;text-decoration:none;font-size:13px;background:#191c20}
  a:hover{border-color:#5b9dff;color:#fff}
  p.hint{margin:0;opacity:.5;font-size:12px}
</style>
</head>
<body>
<main>
  <h1>DG Navegador</h1>
  <p class="sub">Pesquise ou abra um endereço. Atalho: Ctrl+Shift+N.</p>
  <form action="https://duckduckgo.com/" method="get">
    <input type="search" name="q" placeholder="Pesquisar no DuckDuckGo" autofocus/>
    <button type="submit">Pesquisar</button>
  </form>
  <section>
    <a href="https://developer.mozilla.org/pt-BR/docs/Web">MDN Web Docs</a>
    <a href="https://github.com">GitHub</a>
    <a href="https://docs.ollama.com">Ollama</a>
    <a href="http://localhost:3000">localhost:3000</a>
    <a href="http://localhost:5173">localhost:5173</a>
    <a href="http://localhost:8080">localhost:8080</a>
  </section>
  <p class="hint">Página inicial local — funciona offline.</p>
</main>
</body>
</html>`

let urlInicioCache: string | null = null

/** Página inicial local (arquivo em userData) — evita about:blank vazio. */
export function urlPaginaInicialNavegador(): string {
  if (urlInicioCache) return urlInicioCache
  try {
    const dir = join(app.getPath('userData'), 'navegador-ui')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const p = join(dir, 'inicio.html')
    writeFileSync(p, HTML_INICIO, 'utf8')
    urlInicioCache = pathToFileURL(p).href
  } catch {
    urlInicioCache = 'data:text/html;charset=utf-8,' + encodeURIComponent(HTML_INICIO)
  }
  return urlInicioCache
}

function ehPaginaInicial(url: string): boolean {
  if (!url) return false
  return url === urlPaginaInicialNavegador() || url.includes('/navegador-ui/inicio.html')
}

export function lerUltimaUrlNavegador(): string {
  try {
    const p = caminhoUltimaUrl()
    if (!existsSync(p)) return urlPaginaInicialNavegador()
    const u = readFileSync(p, 'utf8').trim()
    if (!u || u === 'about:blank' || u.startsWith('data:')) return urlPaginaInicialNavegador()
    return u
  } catch {
    return urlPaginaInicialNavegador()
  }
}

function salvarUltimaUrl(url: string): void {
  try {
    if (!url || url === 'about:blank' || url.startsWith('data:')) return
    if (ehPaginaInicial(url)) return
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
  onDownload?: (info: InfoDownloadNavegador) => void
  onDownloadProgress?: (info: ProgressoDownloadNavegador) => void
}

/** Progresso incremental enviado à UI (toolbar do painel Browser). */
export type ProgressoDownloadNavegador = {
  id: string
  nomeOriginal: string
  caminho: string
  recebido: number
  total: number
  percentual: number
  estado: 'iniciado' | 'andamento' | 'concluido' | 'cancelado' | 'interrompido'
}

export type InfoDownloadNavegador = {
  ok: boolean
  estado: string
  caminho: string
  nomeOriginal: string
  nomeSalvo: string
  renomeado: boolean
  bytes: number
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

/**
 * handleBaixar (controle.ts) assume o will-download enquanto ativo;
 * o handler persistente ignora esses itens para não duplicar o salvamento.
 */
let downloadsExplicitos = 0
export function iniciarDownloadExplicito(): () => void {
  downloadsExplicitos += 1
  let encerrado = false
  return () => {
    if (encerrado) return
    encerrado = true
    downloadsExplicitos = Math.max(0, downloadsExplicitos - 1)
  }
}

let downloadHandlerLigado = false
/** Downloads em andamento por id — permite cancelamento pela UI. */
const downloadsAtivos = new Map<string, Electron.DownloadItem>()
let seqDownload = 0

function emitirProgressoDownload(info: ProgressoDownloadNavegador): void {
  try {
    listeners.onDownloadProgress?.(info)
  } catch {
    /* ignore */
  }
}

/** Cancela um download persistente pelo id (toolbar do painel Browser). */
export function cancelarDownloadNavegador(id: string): { ok: boolean; erro?: string } {
  const item = downloadsAtivos.get(id)
  if (!item) return { ok: false, erro: 'download nao encontrado' }
  try {
    item.cancel()
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
  }
}

function downloadsDirNavegador(): string {
  const base = join(projectStateDir(resolverRaizProjeto()), 'downloads')
  const d = emSmokeNav() ? join(base, '_smoke') : base
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

/** Downloads iniciados pelo usuário (clique em link) vão para a pasta do projeto. */
function ligarDownloadsPersistentes(wc: WebContents): void {
  if (downloadHandlerLigado) return
  downloadHandlerLigado = true
  wc.session.on('will-download', (_e, item) => {
    if (downloadsExplicitos > 0) return
    try {
      const dir = downloadsDirNavegador()
      const { caminho, nomeOriginal, nomeSalvo, renomeado } = resolverCaminhoDownload(
        dir,
        item.getFilename() || `download-${Date.now()}`
      )
      item.setSavePath(caminho)
      const id = `dl-${++seqDownload}`
      downloadsAtivos.set(id, item)
      const progresso = (
        estado: ProgressoDownloadNavegador['estado']
      ): ProgressoDownloadNavegador => {
        const total = item.getTotalBytes()
        const recebido = item.getReceivedBytes()
        return {
          id,
          nomeOriginal,
          caminho,
          recebido,
          total,
          percentual: total > 0 ? Math.min(100, Math.round((recebido / total) * 100)) : 0,
          estado
        }
      }
      emitirProgressoDownload(progresso('iniciado'))
      item.on('updated', (_ev, state) => {
        emitirProgressoDownload(progresso(state === 'interrupted' ? 'interrompido' : 'andamento'))
      })
      item.once('done', (_ev, state) => {
        downloadsAtivos.delete(id)
        emitirProgressoDownload(
          progresso(
            state === 'completed'
              ? 'concluido'
              : state === 'cancelled'
                ? 'cancelado'
                : 'interrompido'
          )
        )
        const info: InfoDownloadNavegador = {
          ok: state === 'completed',
          estado: state,
          caminho,
          nomeOriginal,
          nomeSalvo,
          renomeado,
          bytes: item.getTotalBytes()
        }
        dglog(`[navegador] download ${state}: ${caminho}`)
        try {
          listeners.onDownload?.(info)
        } catch {
          /* ignore */
        }
      })
    } catch (e) {
      dglog('[navegador] download falhou: ' + String((e as Error).message || e))
    }
  })
}

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
  const atual = wc.getURL()
  chromeView.webContents.send('dgnav:estado', {
    url: ehPaginaInicial(atual) ? '' : atual,
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
  url: string
  ehPaginaInicial: boolean
} {
  const host = caminhoHostNavegador()
  const url = contentView ? contentView.webContents.getURL() : ''
  return {
    modo: host,
    host,
    hostAnexado,
    embutidoVisivel,
    aberto: navegadorAberto(),
    bounds: ultimoBounds.width > 0 ? { ...ultimoBounds } : null,
    /** chrome/content/loadURL via criarViews+carregarUrlNasViews nos dois hosts */
    conteudoCompartilhado: true,
    url,
    ehPaginaInicial: ehPaginaInicial(url)
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
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const key = input.key || ''
    const ctrlOuMeta = input.control || input.meta
    if (key === 'F5' || (ctrlOuMeta && key.toLowerCase() === 'r')) {
      event.preventDefault()
      wc.reload()
      return
    }
    if (input.alt && key === 'ArrowLeft') {
      event.preventDefault()
      goBack(wc)
      emitirEstadoChrome()
      return
    }
    if (input.alt && key === 'ArrowRight') {
      event.preventDefault()
      goForward(wc)
      emitirEstadoChrome()
    }
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

/** Permissões inofensivas passam direto; sensíveis pedem confirmação ao usuário. */
const PERMISSOES_LIVRES = new Set([
  'clipboard-sanitized-write',
  'clipboard-write',
  'fullscreen',
  'pointerLock'
])
const PERMISSOES_SENSIVEIS = new Set([
  'media',
  'geolocation',
  'notifications',
  'midi',
  'midiSysex',
  'clipboard-read',
  'display-capture'
])

function ligarPermissoes(sess: Electron.Session): void {
  sess.setPermissionRequestHandler((_wc, permission, callback, details) => {
    if (PERMISSOES_LIVRES.has(permission)) {
      callback(true)
      return
    }
    if (!PERMISSOES_SENSIVEIS.has(permission)) {
      callback(false)
      return
    }
    // Smoke/QA: sem diálogo modal (evita travar execução automatizada).
    if (process.env.DG_QA_E2E === '1' || process.env.DG_NAV_SMOKE === '1') {
      callback(false)
      return
    }
    const tipos = ((details as { mediaTypes?: string[] })?.mediaTypes || []).join(', ')
    const rotulo: Record<string, string> = {
      media: 'câmera/microfone',
      geolocation: 'localização',
      notifications: 'notificações',
      midi: 'dispositivos MIDI',
      midiSysex: 'dispositivos MIDI',
      'clipboard-read': 'área de transferência',
      'display-capture': 'captura de tela'
    }
    const alvo = parentWin && !parentWin.isDestroyed() ? parentWin : null
    let host = ''
    try {
      host = new URL(details.requestingUrl || '').host
    } catch {
      /* url inválida */
    }
    const opts: Electron.MessageBoxOptions = {
      type: 'question',
      buttons: ['Permitir', 'Bloquear'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      title: 'Permissão do navegador',
      message: `Permitir acesso a ${rotulo[permission] || permission}?`,
      detail: (host ? `Site: ${host}` : 'Site desconhecido') + (tipos ? ` (${tipos})` : '')
    }
    const dialogo = alvo ? dialog.showMessageBox(alvo, opts) : dialog.showMessageBox(opts)
    void dialogo
      .then((r) => callback(r.response === 0))
      .catch(() => callback(false))
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
  ligarPermissoes(contentView.webContents.session)
  chromeView.webContents.loadURL(
    'data:text/html;charset=utf-8,' + encodeURIComponent(CHROME_HTML)
  )
  ligarEventosContent(contentView.webContents)
  ligarDownloadsPersistentes(contentView.webContents)
}

/** Caminho de conteúdo compartilhado smoke↔embed (loadURL na contentView). */
function carregarUrlNasViews(url: string): void {
  if (!contentView) return
  void contentView.webContents.loadURL(url || urlPaginaInicialNavegador())
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
    const urlLoad = destino || urlPaginaInicialNavegador()
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

  const urlLoad = destino || urlPaginaInicialNavegador()
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
