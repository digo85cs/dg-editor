/**
 * Servidor de controle HTTP do navegador embutido.
 * Bind APENAS 127.0.0.1:47821 — nunca 0.0.0.0.
 * Auth: header X-DG-Token == conteúdo de .dg-editor/nav-token.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import type { DownloadItem, Event as ElectronEvent } from 'electron'
import { projectStateDir, resolverRaizProjeto } from '../paths'
import { dglog } from '../dglog'
import {
  estadoAtual,
  estadoComLogado,
  getContentWebContents,
  getContentView,
  navegarPara,
  criarJanelaNavegador
} from './janela'
import { garantirNavToken } from './token'

export const NAV_HOST = '127.0.0.1'
export const NAV_PORT = 47821
const CAP = 200_000

let server: Server | null = null
let token = ''

type Json = Record<string, unknown>

function send(res: ServerResponse, status: number, body: Json): void {
  const raw = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(raw)
  })
  res.end(raw)
}

function lerBody(req: IncomingMessage, limite = 1_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (c: Buffer) => {
      total += c.length
      if (total > limite) {
        reject(new Error('body grande demais'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function parseJson(req: IncomingMessage): Promise<Json> {
  const raw = await lerBody(req)
  if (!raw.trim()) return {}
  return JSON.parse(raw) as Json
}

function downloadsDir(): string {
  const d = join(projectStateDir(resolverRaizProjeto()), 'downloads')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

const JS_SELECTORES = `(() => {
  const out = []
  const seen = new Set()
  const push = (s) => { if (s && !seen.has(s) && seen.size < 30) { seen.add(s); out.push(s) } }
  document.querySelectorAll('a[href],button,input,textarea,select,[role="button"]').forEach((el, i) => {
    if (el.id) push('#' + CSS.escape(el.id))
    else if (el.name) push(el.tagName.toLowerCase() + '[name=' + JSON.stringify(el.name) + ']')
    else if (el.getAttribute('data-testid')) push('[data-testid=' + JSON.stringify(el.getAttribute('data-testid')) + ']')
    else push(el.tagName.toLowerCase() + ':nth-of-type(' + (i + 1) + ')')
  })
  return out
})()`

async function extrairSelectores(): Promise<string[]> {
  const wc = getContentWebContents()
  if (!wc) return []
  try {
    return (await wc.executeJavaScript(JS_SELECTORES, true)) as string[]
  } catch {
    return []
  }
}

async function handleLer(body: Json): Promise<Json> {
  const wc = getContentWebContents()
  if (!wc) return { erro: 'navegador fechado' }
  const modo = String(body.modo || 'texto')
  const seletor = body.seletor ? String(body.seletor) : null

  const script = `(() => {
    const modo = ${JSON.stringify(modo)};
    const seletor = ${JSON.stringify(seletor)};
    const CAP = ${CAP};
    const root = seletor ? document.querySelector(seletor) : document.body;
    if (!root) return { ok: false, motivo: 'seletor nao encontrado', selectoresDisponiveis: null };
    if (modo === 'texto') {
      const t = (root.innerText || '').slice(0, CAP);
      return { ok: true, modo, texto: t, chars: t.length };
    }
    if (modo === 'html') {
      const h = (root.outerHTML || '').slice(0, CAP);
      return { ok: true, modo, html: h, chars: h.length };
    }
    if (modo === 'links') {
      const links = [];
      (root.querySelectorAll ? root : document).querySelectorAll('a[href]').forEach(a => {
        const r = a.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        links.push({ texto: (a.innerText || a.textContent || '').trim().slice(0, 200), href: a.href });
      });
      return { ok: true, modo, links };
    }
    if (modo === 'tabela') {
      const tabelas = [];
      (root.querySelectorAll ? root : document).querySelectorAll('table').forEach(table => {
        const rows = [];
        table.querySelectorAll('tr').forEach(tr => {
          const cells = [];
          tr.querySelectorAll('th,td').forEach(td => cells.push((td.innerText || '').trim()));
          if (cells.length) rows.push(cells);
        });
        if (rows.length) tabelas.push(rows);
      });
      return { ok: true, modo, tabelas };
    }
    return { ok: false, motivo: 'modo invalido: ' + modo };
  })()`

  const r = (await wc.executeJavaScript(script, true)) as Json
  if (r && r.ok === false) {
    r.selectoresDisponiveis = await extrairSelectores()
  }
  return r
}

async function handleClicar(body: Json): Promise<Json> {
  const wc = getContentWebContents()
  if (!wc) return { erro: 'navegador fechado' }
  const seletor = body.seletor != null ? String(body.seletor) : ''
  const texto = body.texto != null ? String(body.texto) : ''

  const script = `(() => {
    const seletor = ${JSON.stringify(seletor)};
    const texto = ${JSON.stringify(texto)};
    let el = null;
    let usado = '';
    if (seletor) {
      el = document.querySelector(seletor);
      if (el) usado = seletor;
    }
    if (!el && texto) {
      const candidatos = Array.from(document.querySelectorAll('button,a,input[type=submit],input[type=button],[role=button]'));
      el = candidatos.find(e => {
        const t = (e.innerText || e.textContent || e.value || '').trim();
        return t === texto;
      }) || null;
      if (el) usado = 'texto:' + texto;
    }
    if (!el) return { ok: false, motivo: 'elemento nao encontrado' };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.click();
    return {
      ok: true,
      elemento: {
        tag: el.tagName.toLowerCase(),
        texto: ((el.innerText || el.textContent || el.value || '') + '').trim().slice(0, 120),
        seletorUsado: usado
      }
    };
  })()`

  const r = (await wc.executeJavaScript(script, true)) as Json
  if (r && r.ok === false) {
    r.selectoresDisponiveis = await extrairSelectores()
  }
  return r
}

async function handlePreencher(body: Json): Promise<Json> {
  const wc = getContentWebContents()
  if (!wc) return { erro: 'navegador fechado' }
  const seletor = String(body.seletor || '')
  const valor = String(body.valor ?? '')
  if (!seletor) return { ok: false, motivo: 'seletor obrigatorio' }

  const script = `(() => {
    const seletor = ${JSON.stringify(seletor)};
    const valor = ${JSON.stringify(valor)};
    const el = document.querySelector(seletor);
    if (!el) return { ok: false, motivo: 'elemento nao encontrado' };
    el.focus();
    const proto = el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, valor);
    else el.value = valor;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return { ok: true, seletor, valorLido: el.value };
  })()`

  const r = (await wc.executeJavaScript(script, true)) as Json
  if (r && r.ok === false) {
    r.selectoresDisponiveis = await extrairSelectores()
  }
  return r
}

async function handleBaixar(body: Json): Promise<Json> {
  const wc = getContentWebContents()
  const view = getContentView()
  if (!wc || !view) return { erro: 'navegador fechado' }

  let url = body.url != null ? String(body.url) : ''
  const seletor = body.seletor != null ? String(body.seletor) : ''

  if (!url && seletor) {
    url = (await wc.executeJavaScript(
      `(() => { const el = document.querySelector(${JSON.stringify(seletor)}); if (!el) return ''; return el.href || el.src || el.getAttribute('href') || ''; })()`,
      true
    )) as string
  }
  if (!url) return { ok: false, motivo: 'informe url ou seletor com href/src' }

  const dir = downloadsDir()
  const stamp = Date.now()
  const nomeFallback = 'download-' + stamp

  return new Promise((resolve) => {
    const sess = wc.session
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      sess.removeListener('will-download', onWill)
      resolve({ ok: false, motivo: 'timeout download 60s' })
    }, 60_000)

    const onWill = (_e: ElectronEvent, item: DownloadItem) => {
      const filename = item.getFilename() || nomeFallback
      const dest = join(dir, `${stamp}-${filename}`)
      item.setSavePath(dest)
      item.once('done', (_ev, state) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        sess.removeListener('will-download', onWill)
        if (state === 'completed') {
          resolve({ ok: true, caminho: dest, bytes: item.getTotalBytes(), filename })
        } else {
          resolve({ ok: false, motivo: 'download ' + state, caminho: dest })
        }
      })
    }
    sess.on('will-download', onWill)
    try {
      wc.downloadURL(url)
    } catch (e) {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        sess.removeListener('will-download', onWill)
        resolve({ ok: false, motivo: String((e as Error).message || e) })
      }
    }
  })
}

async function handleScreenshot(): Promise<Json> {
  const wc = getContentWebContents()
  if (!wc) return { erro: 'navegador fechado' }
  const img = await wc.capturePage()
  const png = img.toPNG()
  return {
    ok: true,
    mime: 'image/png',
    base64: png.toString('base64'),
    bytes: png.length
  }
}

async function despachar(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const host = req.socket.remoteAddress || ''
  if (host !== '127.0.0.1' && host !== '::1' && host !== '::ffff:127.0.0.1') {
    send(res, 403, { erro: 'apenas loopback' })
    return
  }

  const hdr = String(req.headers['x-dg-token'] || '')
  if (!hdr || hdr !== token) {
    send(res, 401, { erro: 'token invalido ou ausente' })
    return
  }

  const url = new URL(req.url || '/', `http://${NAV_HOST}:${NAV_PORT}`)
  const path = url.pathname

  if (req.method === 'GET' && path === '/status') {
    send(res, 200, await estadoComLogado())
    return
  }

  if (req.method !== 'POST') {
    send(res, 405, { erro: 'method not allowed' })
    return
  }

  // garantir janela aberta para ações (exceto se explicitamente fechada e for só status)
  const aberto = estadoAtual().aberto

  let body: Json = {}
  try {
    body = await parseJson(req)
  } catch (e) {
    send(res, 400, { erro: 'JSON invalido: ' + (e as Error).message })
    return
  }

  if (path === '/abrir') {
    const dest = String(body.url || '')
    if (!dest) {
      send(res, 400, { erro: 'url obrigatoria' })
      return
    }
    if (!aberto) criarJanelaNavegador('about:blank')
    const r = await navegarPara(dest, 30_000)
    send(res, r.ok ? 200 : 504, r)
    return
  }

  if (!aberto) {
    send(res, 409, { erro: 'navegador fechado' })
    return
  }

  if (path === '/ler') {
    send(res, 200, await handleLer(body))
    return
  }
  if (path === '/clicar') {
    send(res, 200, await handleClicar(body))
    return
  }
  if (path === '/preencher') {
    send(res, 200, await handlePreencher(body))
    return
  }
  if (path === '/baixar') {
    send(res, 200, await handleBaixar(body))
    return
  }
  if (path === '/screenshot') {
    send(res, 200, await handleScreenshot())
    return
  }

  send(res, 404, { erro: 'endpoint desconhecido' })
}

export function iniciarControleNavegador(): void {
  if (server) return
  token = garantirNavToken()
  // guardrail: nunca bind em 0.0.0.0
  const host = NAV_HOST
  if (host !== '127.0.0.1') {
    throw new Error('ABORT: controle do navegador so pode bind em 127.0.0.1')
  }

  server = createServer((req, res) => {
    void despachar(req, res).catch((e) => {
      send(res, 500, { erro: String((e as Error).message || e) })
    })
  })

  server.listen(NAV_PORT, host, () => {
    dglog(`[navegador] controle http://${host}:${NAV_PORT} token=${token.slice(0, 4)}…`)
  })

  server.on('error', (e) => {
    dglog('[navegador] controle erro: ' + (e as Error).message)
  })
}

export function pararControleNavegador(): void {
  if (!server) return
  server.close()
  server = null
}

/** Exposto para smoke tests sem vazar o token completo. */
export function prefixoTokenControle(): string {
  return token ? token.slice(0, 4) : ''
}

export function gerarNonceTeste(): string {
  return randomBytes(8).toString('hex')
}
