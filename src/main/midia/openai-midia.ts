/**
 * OpenAI mídia — imagem (gpt-image-1) e TTS (gpt-4o-mini-tts / tts-1).
 * Requer OPENAI_API_KEY no cofre/env.
 */
import { writeFileSync } from 'node:fs'
import {
  caminhoRelativo,
  destinoArquivo,
  nomeArquivo,
  pastaMidia,
  previewDe,
  type RespostaMidia
} from './core'

function chaveOpenAI(): string | null {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { lerChave } = require('../brain/segredos-providers') as typeof import('../brain/segredos-providers')
    return lerChave('openai')
  } catch {
    return null
  }
}

const ERRO_SEM_CHAVE =
  'OPENAI_API_KEY não configurada. Cadastre em Contas → Provedores (openai).'

export async function gerarImagemOpenAI(
  raiz: string,
  opts: { prompt: string; tamanho?: string; saida?: string }
): Promise<RespostaMidia> {
  const prompt = String(opts.prompt || '').trim()
  if (!prompt) return { ok: false, erro: 'informe o prompt da imagem' }
  const chave = chaveOpenAI()
  if (!chave) return { ok: false, erro: ERRO_SEM_CHAVE }
  const t0 = Date.now()
  const tamanho = ['1024x1024', '1536x1024', '1024x1536'].includes(String(opts.tamanho))
    ? String(opts.tamanho)
    : '1024x1024'
  try {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + chave },
      body: JSON.stringify({ model: 'gpt-image-1', prompt, size: tamanho, n: 1 }),
      signal: AbortSignal.timeout(300_000)
    })
    if (!r.ok) {
      const corpo = await r.text().catch(() => '')
      return { ok: false, erro: 'OpenAI image HTTP ' + r.status + ': ' + corpo.slice(0, 300) }
    }
    const j = (await r.json()) as { data?: { b64_json?: string; url?: string }[] }
    const item = j.data?.[0]
    let dados: Buffer
    if (item?.b64_json) dados = Buffer.from(item.b64_json, 'base64')
    else if (item?.url) {
      const dl = await fetch(item.url, { signal: AbortSignal.timeout(120_000) })
      if (!dl.ok) return { ok: false, erro: 'falha ao baixar a imagem (HTTP ' + dl.status + ')' }
      dados = Buffer.from(await dl.arrayBuffer())
    } else {
      return { ok: false, erro: 'OpenAI não retornou imagem.' }
    }
    const destino = destinoArquivo(raiz, nomeArquivo(prompt, '.png'), opts.saida)
    writeFileSync(destino, dados)
    return {
      ok: true,
      caminho: destino,
      caminhoRel: caminhoRelativo(raiz, destino),
      bytes: dados.length,
      mime: 'image/png',
      previewBase64: previewDe(destino),
      detalhes: { motor: 'openai-image', modelo: 'gpt-image-1', tamanho, segundosProcessando: +((Date.now() - t0) / 1000).toFixed(1) },
      aviso: 'Imagem gerada via OpenAI gpt-image-1 (pago, alta qualidade).'
    }
  } catch (e) {
    return { ok: false, erro: 'falha ao chamar a OpenAI: ' + (e instanceof Error ? e.message : String(e)) }
  }
}

const VOZES_OPENAI = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']

export async function sintetizarVozOpenAI(
  raiz: string,
  opts: { texto: string; voz?: string; formato?: string; saida?: string }
): Promise<RespostaMidia> {
  const texto = String(opts.texto || '').trim()
  if (!texto) return { ok: false, erro: 'informe o texto a narrar' }
  if (texto.length > 4096) return { ok: false, erro: 'texto muito longo (máx. 4096 caracteres)' }
  const chave = chaveOpenAI()
  if (!chave) return { ok: false, erro: ERRO_SEM_CHAVE }
  const voz = VOZES_OPENAI.includes(String(opts.voz)) ? String(opts.voz) : 'nova'
  const formato = String(opts.formato || 'mp3') === 'wav' ? 'wav' : 'mp3'
  const t0 = Date.now()
  try {
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + chave },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: voz, input: texto, response_format: formato }),
      signal: AbortSignal.timeout(120_000)
    })
    if (!r.ok) {
      const corpo = await r.text().catch(() => '')
      return { ok: false, erro: 'OpenAI TTS HTTP ' + r.status + ': ' + corpo.slice(0, 300) }
    }
    const buf = Buffer.from(await r.arrayBuffer())
    const destino = destinoArquivo(raiz, nomeArquivo('tts-' + voz, '.' + formato), opts.saida)
    writeFileSync(destino, buf)
    return {
      ok: true,
      caminho: destino,
      caminhoRel: caminhoRelativo(raiz, destino),
      bytes: buf.length,
      mime: formato === 'wav' ? 'audio/wav' : 'audio/mpeg',
      detalhes: { motor: 'openai-tts', modelo: 'gpt-4o-mini-tts', voz, formato, segundosProcessando: +((Date.now() - t0) / 1000).toFixed(1) },
      aviso: 'Narração gerada via OpenAI TTS (voz ' + voz + ').'
    }
  } catch (e) {
    return { ok: false, erro: 'falha ao chamar a OpenAI TTS: ' + (e instanceof Error ? e.message : String(e)) }
  }
}

export function vozesOpenAI(): string[] {
  return [...VOZES_OPENAI]
}
