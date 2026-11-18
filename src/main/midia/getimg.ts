/**
 * getimg.ai API v2 — imagem e vídeo por modelo (pré-pago em USD).
 * Requer GETIMG_API_KEY (getimg.ai/app/developer/api-keys).
 * ATENÇÃO: consome saldo da conta — NÃO entra na cascata grátis.
 * Saldo consultável em GET /v2/billing/balance.
 */
import { writeFileSync } from 'node:fs'
import {
  caminhoRelativo,
  destinoArquivo,
  nomeArquivo,
  previewDe,
  type RespostaMidia
} from './core'
import { registrarUso } from './guarda-custo'

const MODELO_PADRAO = 'seedream-5-lite'

function chaveGetimg(): string | null {
  const v = process.env.GETIMG_API_KEY || ''
  return v.trim() || null
}

export function getimgConfigurado(): boolean {
  return !!chaveGetimg()
}

export async function gerarImagemGetimg(
  raiz: string,
  opts: { prompt: string; modelo?: string; saida?: string }
): Promise<RespostaMidia> {
  const prompt = String(opts.prompt || '').trim()
  if (!prompt) return { ok: false, erro: 'informe o prompt' }
  const chave = chaveGetimg()
  if (!chave) {
    return {
      ok: false,
      erro: 'GETIMG_API_KEY não configurada. Crie em getimg.ai/app/developer/api-keys.'
    }
  }
  const modelo = (opts.modelo || MODELO_PADRAO).trim()
  try {
    const res = await fetch('https://api.getimg.ai/v2/images/generations', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + chave, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelo, prompt: prompt.slice(0, 2000) }),
      signal: AbortSignal.timeout(180_000)
    })
    const txt = await res.text().catch(() => '')
    if (!res.ok) {
      const erro = 'getimg HTTP ' + res.status + ': ' + txt.slice(0, 300)
      registrarUso(raiz, 'getimg', false, { detalhe: erro })
      return { ok: false, erro }
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    if (ct.startsWith('image/')) {
      const buf = Buffer.from(txt, 'binary')
      const destino = destinoArquivo(raiz, nomeArquivo('getimg-imagem', '.png'), opts.saida)
      writeFileSync(destino, buf)
      registrarUso(raiz, 'getimg', true, { detalhe: modelo })
      return {
        ok: true,
        caminho: destino,
        caminhoRel: caminhoRelativo(raiz, destino),
        bytes: buf.length,
        mime: ct,
        previewBase64: previewDe(destino),
        aviso: 'Imagem via getimg.ai — consumiu saldo pré-pago da conta. Custo registrado em .dg-editor/uso-custo.json.',
        detalhes: { motor: 'getimg', modelo }
      }
    }
    let dados: unknown = null
    try { dados = JSON.parse(txt) } catch { /* não-JSON */ }
    const imgUrl = extrairUrl(dados)
    if (imgUrl) {
      const img = await fetch(imgUrl, { signal: AbortSignal.timeout(60_000) })
      if (img.ok) {
        const buf = Buffer.from(await img.arrayBuffer())
        const destino = destinoArquivo(raiz, nomeArquivo('getimg-imagem', '.png'), opts.saida)
        writeFileSync(destino, buf)
        registrarUso(raiz, 'getimg', true, { detalhe: modelo })
        return {
          ok: true,
          caminho: destino,
          caminhoRel: caminhoRelativo(raiz, destino),
          bytes: buf.length,
          mime: 'image/png',
          previewBase64: previewDe(destino),
          aviso: 'Imagem via getimg.ai — consumiu saldo pré-pago da conta. Custo registrado em .dg-editor/uso-custo.json.',
          detalhes: { motor: 'getimg', modelo }
        }
      }
    }
    return { ok: false, erro: 'getimg respondeu sem imagem: ' + txt.slice(0, 300) }
  } catch (e) {
    registrarUso(raiz, 'getimg', false, { detalhe: 'rede' })
    return { ok: false, erro: 'getimg falhou: ' + (e instanceof Error ? e.message : String(e)) }
  }
}

export async function saldoGetimg(): Promise<{ ok: boolean; saldo?: string; moeda?: string; erro?: string }> {
  const chave = chaveGetimg()
  if (!chave) return { ok: false, erro: 'GETIMG_API_KEY não configurada' }
  try {
    const res = await fetch('https://api.getimg.ai/v2/billing/balance', {
      headers: { Authorization: 'Bearer ' + chave },
      signal: AbortSignal.timeout(30_000)
    })
    const txt = await res.text().catch(() => '')
    if (!res.ok) return { ok: false, erro: 'HTTP ' + res.status + ': ' + txt.slice(0, 200) }
    const d = JSON.parse(txt) as { balance?: string; currency?: string }
    return { ok: true, saldo: d.balance, moeda: d.currency }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

function extrairUrl(dados: unknown): string | null {
  if (!dados || typeof dados !== 'object') return null
  const d = dados as Record<string, unknown>
  const candidatos: unknown[] = [d.url, d.image, d.image_url, d.output]
  if (Array.isArray(d.images)) candidatos.push(...d.images)
  for (const c of candidatos) {
    if (typeof c === 'string' && /^https?:\/\//.test(c)) return c
    if (c && typeof c === 'object') {
      const o = c as Record<string, unknown>
      for (const k of ['url', 'image_url', 'src']) {
        if (typeof o[k] === 'string' && /^https?:\/\//.test(o[k] as string)) return o[k] as string
      }
    }
  }
  return null
}
