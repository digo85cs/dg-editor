/**
 * AI Horde — geração de imagem 100% gratuita via comunidade de GPUs.
 * Sem chave obrigatória: usa a chave anônima "0000000000" quando
 * AI_HORDE_API_KEY/HORDE_API_KEY não existe. Fila pode levar ~1 min;
 * resolução prática até ~560px (workers recusam acima disso).
 */
import { writeFileSync } from 'node:fs'
import {
  caminhoRelativo,
  destinoArquivo,
  nomeArquivo,
  previewDe,
  type RespostaMidia
} from './core'

const BASE = 'https://aihorde.net/api'
const CHAVE_ANONIMA = '0000000000'
const TIMEOUT_MS = 8 * 60_000

function chaveHorde(): string {
  return (process.env.AI_HORDE_API_KEY || process.env.HORDE_API_KEY || CHAVE_ANONIMA).trim()
}

function headers(): Record<string, string> {
  return {
    apikey: chaveHorde(),
    'Client-Agent': 'dg-editor:0.6.5:contato@localhost',
    'Content-Type': 'application/json'
  }
}

async function api(path: string, opcoes: { method?: string; body?: unknown; timeoutMs?: number } = {}) {
  const res = await fetch(BASE + path, {
    method: opcoes.method || 'GET',
    headers: headers(),
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

/**
 * Gera imagem via AI Horde (submit async → poll check/status → download base64).
 * Retorna erro honesto se a fila estourar o tempo ou o worker falhar.
 */
export async function gerarImagemHorde(
  raiz: string,
  opts: { prompt: string; largura?: number; altura?: number; seed?: number; saida?: string }
): Promise<RespostaMidia> {
  const prompt = String(opts.prompt || '').trim()
  if (!prompt) return { ok: false, erro: 'informe o prompt' }
  const largura = Math.min(640, Math.max(64, Math.round(opts.largura || 512)))
  const altura = Math.min(640, Math.max(64, Math.round(opts.altura || 512)))

  const sub = await api('/v2/generate/async', {
    method: 'POST',
    timeoutMs: 30_000,
    body: {
      prompt: prompt.slice(0, 1000),
      params: {
        width: largura,
        height: altura,
        steps: 25,
        cfg_scale: 7,
        sampler_name: 'k_euler',
        n: 1,
        ...(typeof opts.seed === 'number' && Number.isFinite(opts.seed) ? { seed: String(Math.floor(opts.seed)) } : {})
      },
      nsfw: false,
      censor_nsfw: true,
      models: []
    }
  })
  if (!sub.ok) {
    const msg = (sub.dados as { message?: string })?.message
    return { ok: false, erro: 'AI Horde recusou o pedido (HTTP ' + sub.status + '): ' + (msg || 'sem detalhe') }
  }
  const id = (sub.dados as { id?: string })?.id
  if (!id) return { ok: false, erro: 'AI Horde não retornou id do job' }

  const limite = Date.now() + TIMEOUT_MS
  while (Date.now() < limite) {
    await dormir(5000)
    const chk = await api('/v2/generate/check/' + encodeURIComponent(id), { timeoutMs: 20_000 })
    const c = chk.dados as { done?: boolean; faulted?: boolean; wait_time?: number; queue_position?: number } | null
    if (c?.faulted) return { ok: false, erro: 'job do AI Horde falhou no worker', codigo: 'HORDE_FAULT' }
    if (!c?.done) continue
    const st = await api('/v2/generate/status/' + encodeURIComponent(id), { timeoutMs: 60_000 })
    const gen = (st.dados as { generations?: { img?: string; seed?: string }[] })?.generations?.[0]
    const img = gen?.img
    if (!img) return { ok: false, erro: 'AI Horde concluiu sem imagem', codigo: 'HORDE_VAZIO' }
    // O campo img pode vir como URL (CDN) ou base64, conforme o worker.
    let buf: Buffer
    if (/^https?:\/\//.test(img)) {
      const dl = await fetch(img, { signal: AbortSignal.timeout(120_000) })
      if (!dl.ok) return { ok: false, erro: 'falha ao baixar imagem do Horde: HTTP ' + dl.status }
      buf = Buffer.from(await dl.arrayBuffer())
    } else {
      buf = Buffer.from(img, 'base64')
    }
    if (!buf.length) return { ok: false, erro: 'imagem do AI Horde veio vazia' }
    const ehWebp = /\.webp(\?|$)/i.test(img) || (!/^https?:/.test(img) && false)
    const ext = ehWebp ? '.webp' : '.png'
    const mime = ehWebp ? 'image/webp' : 'image/png'
    const destino = destinoArquivo(raiz, nomeArquivo('horde-imagem', ext), opts.saida)
    writeFileSync(destino, buf)
    return {
      ok: true,
      caminho: destino,
      caminhoRel: caminhoRelativo(raiz, destino),
      bytes: buf.length,
      mime,
      previewBase64: previewDe(destino),
      aviso: 'Grátis via AI Horde (fila comunitária; ~1min, até ~640px).',
      detalhes: { motor: 'ai-horde', modelo: 'stable-diffusion', seed: gen?.seed }
    }
  }
  return { ok: false, erro: 'tempo esgotado aguardando a fila do AI Horde (>8min)', codigo: 'HORDE_TIMEOUT' }
}
