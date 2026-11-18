/**
 * JSON2Video — montagem programática de vídeos via API (600s grátis/mês).
 * Requer JSON2VIDEO_API_KEY (cadastro grátis em json2video.com).
 *
 * O usuário descreve cenas com imagem (URL pública), texto e/ou narração TTS;
 * o serviço renderiza e devolve um MP4 na CDN (válido por 7 dias — baixamos já).
 */
import { writeFileSync } from 'node:fs'
import {
  caminhoRelativo,
  destinoArquivo,
  mimePorExt,
  nomeArquivo,
  type RespostaMidia
} from './core'
import { registrarUso } from './guarda-custo'

const BASE = 'https://api.json2video.com/v2'
const TIMEOUT_RENDER_MS = 10 * 60_000

function chaveJson2Video(): string | null {
  return (process.env.JSON2VIDEO_API_KEY || '').trim() || null
}

export function json2videoConfigurado(): boolean {
  return !!chaveJson2Video()
}

function erroChave(): RespostaMidia {
  return {
    ok: false,
    erro: 'JSON2VIDEO_API_KEY não configurada. Cadastre grátis em json2video.com/dashboard/apikeys (600s de vídeo/mês grátis).'
  }
}

export type CenaJson2Video = {
  imagemUrl?: string
  texto?: string
  narracao?: string
  voz?: string
  duracaoSeg?: number
}

async function api(path: string, opcoes: { method?: string; body?: unknown; timeoutMs?: number } = {}) {
  const res = await fetch(BASE + path, {
    method: opcoes.method || 'GET',
    headers: {
      'x-api-key': chaveJson2Video() || '',
      'Content-Type': 'application/json'
    },
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
    signal: AbortSignal.timeout(opcoes.timeoutMs || 30_000)
  })
  const texto = await res.text()
  let dados: unknown = null
  try {
    dados = texto ? JSON.parse(texto) : null
  } catch {
    dados = texto
  }
  return { ok: res.ok, status: res.status, dados }
}

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Monta o Movie JSON a partir de cenas simplificadas. */
export function montarMovieJson(cenas: CenaJson2Video[], resolucao: string): Record<string, unknown> {
  const scenes = cenas.map((c) => {
    const dur = Math.min(60, Math.max(1, Math.round(c.duracaoSeg || 5)))
    const elements: Record<string, unknown>[] = []
    if (c.imagemUrl && /^https?:\/\//.test(c.imagemUrl)) {
      elements.push({ type: 'image', src: c.imagemUrl, duration: dur })
    }
    if (c.texto && c.texto.trim()) {
      elements.push({ type: 'text', text: c.texto.trim().slice(0, 500), duration: dur })
    }
    if (c.narracao && c.narracao.trim()) {
      elements.push({
        type: 'voice',
        text: c.narracao.trim().slice(0, 2000),
        ...(c.voz ? { voice: c.voz } : {})
      })
    }
    return { duration: dur, elements }
  })
  return { resolution: resolucao, scenes }
}

/**
 * Cria um vídeo JSON2Video a partir de cenas e baixa o MP4 pronto.
 * `cenas`: cada uma pode ter imagemUrl (pública), texto na tela e/ou narracao (TTS).
 */
export async function gerarVideoJson2Video(
  raiz: string,
  opts: {
    cenas: CenaJson2Video[]
    resolucao?: 'small' | 'medium' | 'hd' | 'full-hd'
    titulo?: string
    saida?: string
  }
): Promise<RespostaMidia> {
  const chave = chaveJson2Video()
  if (!chave) return erroChave()
  if (!Array.isArray(opts.cenas) || !opts.cenas.length) {
    return { ok: false, erro: 'informe ao menos uma cena' }
  }
  if (opts.cenas.length > 20) return { ok: false, erro: 'máximo de 20 cenas por vídeo' }
  const resolucao = ['small', 'medium', 'hd', 'full-hd'].includes(String(opts.resolucao))
    ? String(opts.resolucao)
    : 'hd'
  const movie = montarMovieJson(opts.cenas, resolucao)
  if ((movie.scenes as { elements: unknown[] }[]).some((s) => !s.elements.length)) {
    return { ok: false, erro: 'toda cena precisa de imagemUrl, texto ou narracao' }
  }

  const t0 = Date.now()
  const sub = await api('/movies', { method: 'POST', timeoutMs: 60_000, body: movie })
  const projeto = (sub.dados as { project?: string; movie?: { project?: string } })?.project
    || (sub.dados as { movie?: { project?: string } })?.movie?.project
  if (!sub.ok || !projeto) {
    return { ok: false, erro: 'JSON2Video recusou: HTTP ' + sub.status + ' ' + JSON.stringify(sub.dados).slice(0, 250) }
  }

  const limite = Date.now() + TIMEOUT_RENDER_MS
  let urlFinal = ''
  while (Date.now() < limite) {
    await dormir(5000)
    const st = await api('/movies?project=' + encodeURIComponent(projeto), { timeoutMs: 30_000 })
    const m = (st.dados as { movie?: { status?: string; url?: string | null; message?: string } })?.movie
    if (m?.status === 'done' && m.url) {
      urlFinal = m.url
      break
    }
    if (m?.status === 'error' || m?.status === 'timeout') {
      return { ok: false, erro: 'JSON2Video falhou: ' + (m.message || m.status) }
    }
  }
  if (!urlFinal) return { ok: false, erro: 'tempo esgotado aguardando o render do JSON2Video (>10min)', codigo: 'J2V_TIMEOUT' }

  const res = await fetch(urlFinal, { signal: AbortSignal.timeout(180_000) })
  if (!res.ok) return { ok: false, erro: 'download do vídeo HTTP ' + res.status }
  const buf = Buffer.from(await res.arrayBuffer())
  if (!buf.length) return { ok: false, erro: 'vídeo vazio' }
  const destino = destinoArquivo(raiz, nomeArquivo(opts.titulo || 'video-json2video', '.mp4'), opts.saida)
  writeFileSync(destino, buf)
  registrarUso(raiz, 'json2video', true, { detalhe: projeto })
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: buf.length,
    mime: mimePorExt('.mp4'),
    aviso: 'Vídeo montado via JSON2Video (600s grátis/mês). Baixado — a URL da CDN expira em 7 dias.',
    detalhes: { motor: 'json2video', projeto, segundosProcessando: +((Date.now() - t0) / 1000).toFixed(1) }
  }
}
