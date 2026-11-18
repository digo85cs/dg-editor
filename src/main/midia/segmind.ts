/**
 * Segmind AI Gateway — créditos grátis no cadastro (~100 img/dia promocional).
 * Requer SEGMIND_API_KEY (segmind.com → platform.segmind.com/api-keys, grátis).
 * API: POST https://api.segmind.com/v1/{modelo} com header x-api-key e JSON.
 */
import { writeFileSync } from 'node:fs'
import {
  caminhoRelativo,
  destinoArquivo,
  nomeArquivo,
  previewDe,
  type RespostaMidia
} from './core'
import { bloqueioCusto, registrarUso } from './guarda-custo'

const MODELO_PADRAO = 'sdxl1.0-newreality-lightning'

function chaveSegmind(): string | null {
  // Windows env é case-insensitive — SEGMIND_API_KEY cobre variações.
  const v = process.env.SEGMiND_API_KEY || ''
  return v.trim() || null
}

export function segmindConfigurado(): boolean {
  return !!chaveSegmind()
}

export async function gerarImagemSegmind(
  raiz: string,
  opts: { prompt: string; modelo?: string; largura?: number; altura?: number; saida?: string }
): Promise<RespostaMidia> {
  const prompt = String(opts.prompt || '').trim()
  if (!prompt) return { ok: false, erro: 'informe o prompt' }
  const chave = chaveSegmind()
  if (!chave) {
    return {
      ok: false,
      erro: 'SEGMIND_API_KEY não configurada. Crie grátis em platform.segmind.com/api-keys e salve em Contas → Provedores.'
    }
  }
  const bloqueio = bloqueioCusto(raiz, 'segmind')
  if (bloqueio) return { ok: false, erro: bloqueio }
  const modelo = (opts.modelo || MODELO_PADRAO).trim().replace(/^\/+|\/+$/g, '')
  const corpo = JSON.stringify({
    prompt: prompt.slice(0, 2000),
    width: opts.largura || 1024,
    height: opts.altura || 1024,
    samples: 1,
    seed: -1
  })
  const url = 'https://api.segmind.com/v1/' + encodeURIComponent(modelo)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'x-api-key': chave, 'Content-Type': 'application/json' },
      body: corpo,
      signal: AbortSignal.timeout(180_000)
    })
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    if (res.ok && ct.startsWith('image/')) {
      const buf = Buffer.from(await res.arrayBuffer())
      if (!buf.length) return { ok: false, erro: 'Segmind retornou imagem vazia' }
      const destino = destinoArquivo(raiz, nomeArquivo('segmind-imagem', ct.includes('png') ? '.png' : '.jpg'), opts.saida)
      writeFileSync(destino, buf)
      registrarUso(raiz, 'segmind', true, { detalhe: modelo })
      return {
        ok: true,
        caminho: destino,
        caminhoRel: caminhoRelativo(raiz, destino),
        bytes: buf.length,
        mime: ct,
        previewBase64: previewDe(destino),
        aviso: 'Imagem via Segmind (saldo pré-pago da conta). Custo registrado em .dg-editor/uso-custo.json.',
        detalhes: { motor: 'segmind', modelo }
      }
    }
    const txt = await res.text().catch(() => '')
    if (!res.ok) {
      const erro = 'Segmind HTTP ' + res.status + ': ' + txt.slice(0, 300)
      registrarUso(raiz, 'segmind', false, { detalhe: erro })
      return { ok: false, erro }
    }
    // Resposta JSON pode trazer URL(s) da imagem gerada.
    let dados: unknown = null
    try { dados = JSON.parse(txt) } catch { /* imagem em outro formato */ }
    const imgUrl = extrairUrlImagem(dados)
    if (imgUrl) {
      const img = await fetch(imgUrl, { signal: AbortSignal.timeout(60_000) })
      if (img.ok) {
        const buf = Buffer.from(await img.arrayBuffer())
        const destino = destinoArquivo(raiz, nomeArquivo('segmind-imagem', '.png'), opts.saida)
        writeFileSync(destino, buf)
        registrarUso(raiz, 'segmind', true, { detalhe: modelo })
        return {
          ok: true,
          caminho: destino,
          caminhoRel: caminhoRelativo(raiz, destino),
          bytes: buf.length,
          mime: 'image/png',
          previewBase64: previewDe(destino),
          aviso: 'Imagem via Segmind (saldo pré-pago da conta). Custo registrado em .dg-editor/uso-custo.json.',
          detalhes: { motor: 'segmind', modelo }
        }
      }
    }
    return { ok: false, erro: 'Segmind respondeu sem imagem: ' + txt.slice(0, 300) }
  } catch (e) {
    return { ok: false, erro: 'Segmind falhou: ' + (e instanceof Error ? e.message : String(e)) }
  }
}

function extrairUrlImagem(dados: unknown): string | null {
  if (!dados || typeof dados !== 'object') return null
  const d = dados as Record<string, unknown>
  for (const k of ['images', 'image', 'output', 'url', 'image_url']) {
    const v = d[k]
    if (typeof v === 'string' && /^https?:\/\//.test(v)) return v
    if (Array.isArray(v)) {
      const primeiro = v.find((x) => typeof x === 'string' && /^https?:\/\//.test(x))
      if (primeiro) return primeiro as string
      const obj = v.find((x) => x && typeof x === 'object') as Record<string, unknown> | undefined
      if (obj) {
        for (const kk of ['url', 'image', 'image_url']) {
          const vv = obj[kk]
          if (typeof vv === 'string' && /^https?:\/\//.test(vv)) return vv
        }
      }
    }
  }
  return null
}
