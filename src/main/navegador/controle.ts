/**
 * Servidor de controle HTTP do navegador embutido.
 * Bind APENAS 127.0.0.1:47821 — nunca 0.0.0.0.
 * Auth: header X-DG-Token == conteúdo de .dg-editor/nav-token.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import type {
  DownloadItem,
  Event as ElectronEvent,
  NativeImage,
  Rectangle,
  WebContents,
  WebFrameMain
} from 'electron'
import { projectStateDir, resolverRaizProjeto } from '../paths'
import { dglog } from '../dglog'
import {
  estadoAtual,
  estadoComLogado,
  getContentWebContents,
  getContentView,
  navegarPara,
  criarJanelaNavegador,
  forcarLayoutNavegador
} from './janela'
import { garantirTokenSessao, validarToken, getTokenSessao } from './token'
import { resolverCaminhoDownload } from './download-nome'
import { checarRateLimit, resetarRateLimit } from './rate-limit'
import { extrairDoFrame } from './debugger-fallback'

export const NAV_HOST = '127.0.0.1'
export const NAV_PORT = 47821
const CAP = 200_000

let server: Server | null = null

export { resetarRateLimit }

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
  const base = join(projectStateDir(resolverRaizProjeto()), 'downloads')
  const d = process.env.DG_NAV_SMOKE === '1' ? join(base, '_smoke') : base
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

type FrameInfo = { indice: number; url: string; nome: string }

function listarFrames(wc: WebContents): FrameInfo[] {
  try {
    const main = wc.mainFrame
    const frames = main.framesInSubtree || []
    return frames.map((f, i) => ({
      indice: i,
      url: f.url || '',
      nome: f.name || ''
    }))
  } catch {
    return []
  }
}

function resolverFrame(wc: WebContents, frame?: number | string): WebFrameMain | null {
  try {
    const main = wc.mainFrame
    if (frame === undefined || frame === null || frame === '') return main
    const frames = main.framesInSubtree || []
    if (typeof frame === 'number') return frames[frame] || null
    const s = String(frame)
    return frames.find((f) => (f.url || '').includes(s) || (f.name || '').includes(s)) || null
  } catch {
    return null
  }
}

async function execNoAlvo(
  wc: WebContents,
  script: string,
  frame?: number | string,
  opts?: { forceDebugger?: boolean }
): Promise<{ valor: unknown; tentouDebugger?: boolean }> {
  const r = await extrairDoFrame(wc, frame, script, resolverFrame, {
    forceDebugger: opts?.forceDebugger
  })
  if (!r.ok) {
    const err = new Error(r.erro) as Error & { tentouDebugger?: boolean }
    err.tentouDebugger = r.tentouDebugger
    throw err
  }
  return { valor: r.dados, tentouDebugger: r.tentouDebugger }
}

async function esperarSeletorNoAlvo(
  wc: WebContents,
  seletor: string,
  timeoutMs: number,
  frame?: number | string
): Promise<boolean> {
  const deadline = Date.now() + Math.max(0, timeoutMs)
  const js = `!!document.querySelector(${JSON.stringify(seletor)})`
  while (Date.now() < deadline) {
    try {
      const r = await execNoAlvo(wc, js, frame)
      if (r.valor) return true
    } catch {
      /* frame ainda carregando */
    }
    await sleep(200)
  }
  return false
}

/** Espera silêncio de mutações (MutationObserver) após seletor existir. */
async function aguardarDomEstavel(
  wc: WebContents,
  seletor: string,
  estavelMs: number,
  timeoutMs: number,
  frame?: number | string
): Promise<{ ok: boolean; aviso?: string }> {
  const script = `(() => {
    const seletor = ${JSON.stringify(seletor)};
    const estavelMs = ${Math.max(0, estavelMs)};
    const timeoutMs = ${Math.max(0, timeoutMs)};
    return new Promise((resolve) => {
      let quietTimer = null;
      let hard = null;
      let finished = false;
      const obs = new MutationObserver(() => bump());
      const finish = (aviso) => {
        if (finished) return;
        finished = true;
        try { obs.disconnect(); } catch (_) {}
        clearTimeout(quietTimer);
        clearTimeout(hard);
        resolve({ ok: !!document.querySelector(seletor), aviso: aviso || null });
      };
      const bump = () => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(() => finish(null), estavelMs);
      };
      try {
        obs.observe(document.documentElement || document.body, {
          childList: true, subtree: true, attributes: true, characterData: true
        });
      } catch (_) {}
      bump();
      hard = setTimeout(() => finish('dom_ainda_mutando'), timeoutMs);
    });
  })()`
  try {
    const r = await execNoAlvo(wc, script, frame)
    const v = r.valor as { ok?: boolean; aviso?: string | null }
    return { ok: !!v?.ok, aviso: v?.aviso || undefined }
  } catch (e) {
    return { ok: false, aviso: String((e as Error).message || e) }
  }
}

/** Candidatos clicáveis/estruturais para o agente se auto-corrigir (cap 30). */
const JS_CANDIDATOS = `(() => {
  const out = [];
  const seen = new Set();
  const add = (el, tipo) => {
    if (out.length >= 30) return;
    const txt = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 60);
    let sel = '';
    if (el.id) sel = '#' + el.id;
    else if (el.name) sel = el.tagName.toLowerCase() + '[name="' + el.name + '"]';
    else if (el.getAttribute('data-testid')) sel = '[data-testid="' + el.getAttribute('data-testid') + '"]';
    else if (el.className && typeof el.className === 'string' && !/css-[a-z0-9]{5,}/i.test(el.className)) {
      const classes = el.className.trim().split(/\\s+/).filter(Boolean).slice(0, 2);
      if (classes.length) sel = el.tagName.toLowerCase() + '.' + classes.join('.');
    }
    if (!sel || seen.has(sel)) return;
    seen.add(sel);
    out.push({ tipo, tag: el.tagName.toLowerCase(), texto: txt, seletor: sel });
  };
  document.querySelectorAll('button, a, input, select, textarea, [role="button"]').forEach(el => {
    if (el.offsetParent !== null) add(el, 'interativo');
  });
  document.querySelectorAll('h1, h2, h3, table, form, [id]').forEach(el => add(el, 'estrutural'));
  return out.slice(0, 30);
})()`

type Candidato = { tipo: string; tag: string; texto: string; seletor: string }

async function extrairCandidatos(): Promise<Candidato[]> {
  const wc = getContentWebContents()
  if (!wc) return []
  try {
    const list = (await wc.executeJavaScript(JS_CANDIDATOS, true)) as Candidato[]
    return Array.isArray(list) ? list.slice(0, 30) : []
  } catch {
    return []
  }
}

function erroElementoNaoEncontrado(
  seletorPedido: string,
  candidatos: Candidato[]
): Json {
  return {
    ok: false,
    motivo: 'elemento nao encontrado',
    seletorPedido,
    candidatos,
    dica: 'reescolha o seletor a partir de candidatos[]'
  }
}

async function handleLer(body: Json): Promise<Json> {
  const wc = getContentWebContents()
  if (!wc) return { erro: 'navegador fechado' }
  const modo = String(body.modo || 'texto')
  const seletor = body.seletor ? String(body.seletor) : null
  const offsetRaw = body.offset != null ? Number(body.offset) : 0
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0
  const limitRaw = body.limit != null ? Number(body.limit) : null
  const frameSpec = body.frame as number | string | undefined
  const esperarSel = body.esperarSeletor ? String(body.esperarSeletor) : ''
  const esperarMs =
    body.esperarTimeoutMs != null && Number.isFinite(Number(body.esperarTimeoutMs))
      ? Math.floor(Number(body.esperarTimeoutMs))
      : 10_000
  const aguardarEstavel =
    body.aguardarEstavel != null && Number.isFinite(Number(body.aguardarEstavel))
      ? Math.max(0, Math.floor(Number(body.aguardarEstavel)))
      : 0
  const forceDebugger =
    process.env.DG_NAV_SMOKE === '1' && body._forceDebugger === true

  if (frameSpec !== undefined && frameSpec !== null && frameSpec !== '') {
    try {
      const frames = wc.mainFrame.framesInSubtree || []
      let hit = false
      if (typeof frameSpec === 'number') hit = !!frames[frameSpec]
      else {
        hit = frames.some(
          (f) =>
            (f.url || '').includes(String(frameSpec)) ||
            (f.name || '').includes(String(frameSpec))
        )
      }
      if (!hit) {
        return {
          ok: false,
          motivo: 'frame nao encontrado',
          frame: frameSpec,
          framesDisponiveis: listarFrames(wc)
        }
      }
    } catch {
      return {
        ok: false,
        motivo: 'frame nao encontrado',
        frame: frameSpec,
        framesDisponiveis: listarFrames(wc)
      }
    }
  }

  if (esperarSel) {
    const okEsp = await esperarSeletorNoAlvo(wc, esperarSel, esperarMs, frameSpec)
    if (!okEsp) {
      return {
        ok: false,
        motivo: 'timeout esperarSeletor',
        esperarSeletor: esperarSel,
        framesDisponiveis: listarFrames(wc)
      }
    }
    if (aguardarEstavel > 0) {
      const rest = Math.max(500, esperarMs - 0)
      const est = await aguardarDomEstavel(wc, esperarSel, aguardarEstavel, rest, frameSpec)
      if (est.aviso === 'dom_ainda_mutando') {
        // segue para extrair o que houver, com aviso
        ;(body as Json)._avisoEstavel = 'dom_ainda_mutando'
      }
    }
  }

  const script = `(() => {
    const modo = ${JSON.stringify(modo)};
    const seletor = ${JSON.stringify(seletor)};
    const CAP = ${CAP};
    const offset = ${offset};
    const limitIn = ${limitRaw === null ? 'null' : limitRaw};
    const root = seletor ? document.querySelector(seletor) : document.body;
    if (!root) return { ok: false, motivo: 'elemento nao encontrado', seletorPedido: seletor };

    if (modo === 'texto') {
      const full = (root.innerText || '').slice(0, CAP);
      const lim = Math.min(limitIn == null ? 50000 : Math.max(0, Math.floor(limitIn)), CAP);
      const slice = full.slice(offset, offset + lim);
      const fim = offset + slice.length;
      const truncado = fim < full.length;
      return {
        ok: true,
        modo,
        texto: slice,
        chars: slice.length,
        totalChars: full.length,
        offset,
        limit: lim,
        truncado,
        proximoOffset: truncado ? fim : null
      };
    }
    if (modo === 'html') {
      const full = (root.outerHTML || '').slice(0, CAP);
      const lim = Math.min(limitIn == null ? 50000 : Math.max(0, Math.floor(limitIn)), CAP);
      const slice = full.slice(offset, offset + lim);
      const fim = offset + slice.length;
      const truncado = fim < full.length;
      return {
        ok: true,
        modo,
        html: slice,
        chars: slice.length,
        totalChars: full.length,
        offset,
        limit: lim,
        truncado,
        proximoOffset: truncado ? fim : null
      };
    }
    if (modo === 'links') {
      const links = [];
      (root.querySelectorAll ? root : document).querySelectorAll('a[href]').forEach(a => {
        const r = a.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        links.push({ texto: (a.innerText || a.textContent || '').trim().slice(0, 200), href: a.href });
      });
      const lim = limitIn == null ? links.length : Math.max(0, Math.floor(limitIn));
      const page = links.slice(offset, offset + lim);
      const fim = offset + page.length;
      const truncado = fim < links.length;
      return {
        ok: true,
        modo,
        links: page,
        total: links.length,
        offset,
        limit: lim,
        truncado,
        proximoOffset: truncado ? fim : null
      };
    }
    if (modo === 'tabela') {
      const lim = Math.min(limitIn == null ? 500 : Math.max(0, Math.floor(limitIn)), 5000);
      const tabelas = [];
      let maiorTotal = 0;
      let algumTruncado = false;
      let proxGlobal = null;
      (root.querySelectorAll ? root : document).querySelectorAll('table').forEach(table => {
        const rows = [];
        table.querySelectorAll('tr').forEach(tr => {
          const cells = [];
          tr.querySelectorAll('th,td').forEach(td => cells.push((td.innerText || '').trim()));
          if (cells.length) rows.push(cells);
        });
        if (!rows.length) return;
        const totalLinhas = rows.length;
        maiorTotal = Math.max(maiorTotal, totalLinhas);
        const linhas = rows.slice(offset, offset + lim);
        const fim = offset + linhas.length;
        const truncado = fim < totalLinhas;
        if (truncado) {
          algumTruncado = true;
          if (proxGlobal == null) proxGlobal = fim;
        }
        tabelas.push({ totalLinhas, offset, limit: lim, linhas });
      });
      return {
        ok: true,
        modo,
        tabelas,
        totalLinhas: maiorTotal,
        offset,
        limit: lim,
        truncado: algumTruncado,
        proximoOffset: algumTruncado ? proxGlobal : null
      };
    }
    return { ok: false, motivo: 'modo invalido: ' + modo, truncado: false, proximoOffset: null };
  })()`

  let r: Json
  let tentouDebugger = false
  try {
    const ex = await execNoAlvo(wc, script, frameSpec, { forceDebugger })
    tentouDebugger = !!ex.tentouDebugger
    r = ex.valor as Json
  } catch (e) {
    const te = e as Error & { tentouDebugger?: boolean }
    const motivo = String(te.message || e)
    if (frameSpec !== undefined && frameSpec !== null && frameSpec !== '') {
      return {
        ok: false,
        motivo: te.tentouDebugger ? 'iframe cross-origin inacessivel' : motivo,
        erroDebugger: te.tentouDebugger ? motivo : undefined,
        framesDisponiveis: listarFrames(wc),
        tentouDebugger: te.tentouDebugger
      }
    }
    return {
      ok: false,
      motivo,
      framesDisponiveis: listarFrames(wc),
      tentouDebugger: te.tentouDebugger
    }
  }
  if (r && r.ok === false && String(r.motivo || '').includes('elemento nao encontrado')) {
    const candidatos = await extrairCandidatos()
    const err = erroElementoNaoEncontrado(seletor || String(r.seletorPedido || ''), candidatos)
    err.framesDisponiveis = listarFrames(wc)
    return err
  }
  // garantir campos de paginação
  if (r && r.ok === true) {
    if (r.truncado === undefined) r.truncado = false
    if (r.proximoOffset === undefined) r.proximoOffset = null
    if (tentouDebugger) r.tentouDebugger = true
    if (body._avisoEstavel) r.aviso = String(body._avisoEstavel)

    // aviso SPA: texto curto mas página tem table/main
    try {
      const metaEx = await execNoAlvo(
        wc,
        `({ len: (document.body && document.body.innerText || '').length, table: !!document.querySelector('table'), main: !!document.querySelector('main') })`,
        frameSpec
      )
      const meta = metaEx.valor as { len: number; table: boolean; main: boolean }
      const textoLen =
        typeof r.texto === 'string'
          ? r.texto.length
          : typeof r.totalLinhas === 'number'
            ? Number(r.totalLinhas)
            : meta.len
      if (
        (modo === 'texto' && textoLen < 50 && (meta.table || meta.main)) ||
        (modo === 'tabela' && Number(r.totalLinhas || 0) === 0 && meta.table)
      ) {
        r.aviso =
          'conteudo possivelmente nao renderizado — tente esperarSeletor'
      }
    } catch {
      /* ignore */
    }

    // se extração vazia e há iframes, listar
    const vazio =
      (modo === 'tabela' && Number(r.totalLinhas || 0) === 0) ||
      (modo === 'texto' && String(r.texto || '').trim().length < 20)
    if (vazio && (frameSpec === undefined || frameSpec === null || frameSpec === '')) {
      const frames = listarFrames(wc)
      if (frames.length) {
        r.aviso = r.aviso || 'conteudo vazio no documento principal — tente frame'
        r.framesDisponiveis = frames
      }
    }
  }
  return r
}

async function handleClicar(body: Json): Promise<Json> {
  const wc = getContentWebContents()
  if (!wc) return { erro: 'navegador fechado' }
  const seletor = body.seletor != null ? String(body.seletor) : ''
  const texto = body.texto != null ? String(body.texto) : ''
  const seletorPedido = seletor || (texto ? 'texto:' + texto : '')
  const frameSpec = body.frame as number | string | undefined
  const esperarSel = body.esperarSeletor ? String(body.esperarSeletor) : ''
  const esperarMs =
    body.esperarTimeoutMs != null && Number.isFinite(Number(body.esperarTimeoutMs))
      ? Math.floor(Number(body.esperarTimeoutMs))
      : 10_000

  if (esperarSel) {
    const okEsp = await esperarSeletorNoAlvo(wc, esperarSel, esperarMs, frameSpec)
    if (!okEsp) {
      return {
        ok: false,
        motivo: 'timeout esperarSeletor',
        framesDisponiveis: listarFrames(wc)
      }
    }
  }

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
      const lista = Array.from(document.querySelectorAll('button,a,input[type=submit],input[type=button],[role=button]'));
      el = lista.find(e => {
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

  let r: Json
  try {
    const ex = await execNoAlvo(wc, script, frameSpec)
    r = ex.valor as Json
    if (ex.tentouDebugger) r.tentouDebugger = true
  } catch (e) {
    const te = e as Error & { tentouDebugger?: boolean }
    if (frameSpec !== undefined && frameSpec !== null && frameSpec !== '') {
      return {
        ok: false,
        motivo: te.tentouDebugger
          ? 'iframe cross-origin inacessivel'
          : String(te.message || e),
        framesDisponiveis: listarFrames(wc),
        tentouDebugger: te.tentouDebugger
      }
    }
    return {
      ok: false,
      motivo: String(te.message || e),
      framesDisponiveis: listarFrames(wc),
      tentouDebugger: te.tentouDebugger
    }
  }
  if (r && r.ok === false) {
    const candidatos = await extrairCandidatos()
    const err = erroElementoNaoEncontrado(seletorPedido, candidatos)
    err.framesDisponiveis = listarFrames(wc)
    return err
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
    const candidatos = await extrairCandidatos()
    return erroElementoNaoEncontrado(seletor, candidatos)
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
  const nomeFallback = `download-${Date.now()}`

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
      const nomeBruto = item.getFilename() || nomeFallback
      const { caminho, nomeOriginal, nomeSalvo, renomeado } = resolverCaminhoDownload(
        dir,
        nomeBruto
      )
      item.setSavePath(caminho)
      item.once('done', (_ev, state) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        sess.removeListener('will-download', onWill)
        if (state === 'completed') {
          resolve({
            ok: true,
            caminho,
            bytes: item.getTotalBytes(),
            nomeOriginal,
            nomeSalvo,
            renomeado,
            filename: nomeSalvo
          })
        } else {
          resolve({
            ok: false,
            motivo: 'download ' + state,
            caminho,
            nomeOriginal,
            nomeSalvo,
            renomeado
          })
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

async function capturePageComTimeout(
  wc: WebContents,
  rect: Rectangle | undefined,
  ms: number
): Promise<NativeImage> {
  const captura = rect ? wc.capturePage(rect) : wc.capturePage()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      captura,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('capturePage timeout ' + ms + 'ms')), ms)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function captureViaCdp(wc: WebContents): Promise<{ ok: true; mime: string; base64: string; bytes: number } | { ok: false; motivo: string }> {
  const dbg = wc.debugger
  let attached = false
  try {
    if (!dbg.isAttached()) {
      dbg.attach('1.3')
      attached = true
    }
    const r = (await dbg.sendCommand('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false
    })) as { data?: string }
    const b64 = typeof r?.data === 'string' ? r.data : ''
    if (!b64 || b64.length < 80) {
      return { ok: false, motivo: 'CDP screenshot vazio' }
    }
    const bytes = Buffer.from(b64, 'base64').length
    return { ok: true, mime: 'image/png', base64: b64, bytes }
  } catch (e) {
    return { ok: false, motivo: 'CDP: ' + String((e as Error)?.message || e) }
  } finally {
    if (attached) {
      try {
        dbg.detach()
      } catch {
        /* */
      }
    }
  }
}

async function handleScreenshot(): Promise<Json> {
  const wc = getContentWebContents()
  if (!wc) return { erro: 'navegador fechado' }
  const bounds = forcarLayoutNavegador()
  // força paint antes do capture (WebContentsView pode devolver 0x0 se ainda não pintou)
  try {
    await wc.executeJavaScript('document.body && document.body.getBoundingClientRect().width', true)
  } catch {
    /* ignore */
  }
  await new Promise((r) => setTimeout(r, 200))
  const timeoutMs = process.env.DG_NAV_SMOKE === '1' ? 8000 : 20000
  let lastMotivo = ''
  try {
    let img = await capturePageComTimeout(wc, undefined, timeoutMs)
    let png = img.toPNG()
    if (png.length < 100 && bounds && bounds.width > 0 && bounds.height > 0) {
      img = await capturePageComTimeout(
        wc,
        { x: 0, y: 0, width: bounds.width, height: bounds.height },
        timeoutMs
      )
      png = img.toPNG()
    }
    if (png.length >= 100) {
      return {
        ok: true,
        mime: 'image/png',
        base64: png.toString('base64'),
        bytes: png.length
      }
    }
    lastMotivo = 'capturePage vazio (view sem paint?)'
  } catch (e) {
    lastMotivo = String((e as Error)?.message || e)
  }
  // Embed/oculto: capturePage falha sem surface — fallback CDP
  const cdp = await captureViaCdp(wc)
  if (cdp.ok) return cdp
  return {
    ok: false,
    motivo: lastMotivo + (cdp.ok === false ? ' | ' + cdp.motivo : ''),
    erro: lastMotivo,
    bounds: bounds || null
  }
}

async function despachar(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const host = req.socket.remoteAddress || ''
  if (host !== '127.0.0.1' && host !== '::1' && host !== '::ffff:127.0.0.1') {
    send(res, 403, { erro: 'apenas loopback' })
    return
  }

  const hdr = String(req.headers['x-dg-token'] || '')
  // 401 antes do rate limit (requests sem token não contam)
  if (!hdr || !validarToken(hdr)) {
    send(res, 401, { erro: 'token invalido ou ausente' })
    return
  }

  const url = new URL(req.url || '/', `http://${NAV_HOST}:${NAV_PORT}`)
  const path = url.pathname

  const rl = checarRateLimit(hdr, path)
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfterSec))
    send(res, 429, {
      ok: false,
      motivo: 'rate limit',
      retryAfterSec: rl.retryAfterSec
    })
    return
  }

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
    if (!aberto) criarJanelaNavegador('about:blank', { mostrar: false })
    const r = await navegarPara(dest, 30_000)
    const esperarSel = body.esperarSeletor ? String(body.esperarSeletor) : ''
    const esperarMs =
      body.esperarTimeoutMs != null && Number.isFinite(Number(body.esperarTimeoutMs))
        ? Math.floor(Number(body.esperarTimeoutMs))
        : 10_000
    if (r.ok && esperarSel) {
      const wc = getContentWebContents()
      if (wc) {
        const okEsp = await esperarSeletorNoAlvo(wc, esperarSel, esperarMs)
        if (!okEsp) {
          send(res, 504, {
            ok: false,
            url: r.url,
            erro: 'timeout esperarSeletor',
            esperarSeletor: esperarSel,
            framesDisponiveis: listarFrames(wc)
          })
          return
        }
      }
    }
    send(res, r.ok ? 200 : 504, { ...r, esperarSeletor: esperarSel || undefined })
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
  const tok = getTokenSessao() || garantirTokenSessao()
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
    dglog(`[navegador] controle http://${host}:${NAV_PORT} token=${tok.slice(0, 8)}…`)
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
  const t = getTokenSessao()
  return t ? t.slice(0, 8) : ''
}

export function gerarNonceTeste(): string {
  return randomBytes(8).toString('hex')
}
