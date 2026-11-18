/**
 * Cloudflare Workers AI — free tier (~10k neurônios/dia).
 * Requer CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
 * (dash.cloudflare.com → API Tokens com permissão Workers AI → Edit).
 */
import { writeFileSync } from 'node:fs'
import {
  caminhoRelativo,
  destinoArquivo,
  nomeArquivo,
  previewDe,
  type RespostaMidia
} from './core'

const MODELO_PADRAO = '@cf/black-forest-labs/flux-1-schnell'

function credenciais(): { token: string; conta: string } | null {
  const token = (process.env.CLOUDFLARE_API_TOKEN || '').trim()
  const conta = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim()
  return token && conta ? { token, conta } : null
}

export function cfConfigurado(): boolean {
  return !!credenciais()
}

export async function gerarImagemCF(
  raiz: string,
  opts: { prompt: string; modelo?: string; passos?: number; saida?: string }
): Promise<RespostaMidia> {
  const prompt = String(opts.prompt || '').trim()
  if (!prompt) return { ok: false, erro: 'informe o prompt' }
  const cred = credenciais()
  if (!cred) {
    return {
      ok: false,
      erro: 'CLOUDFLARE_API_TOKEN/ACCOUNT_ID não configurados. Crie grátis no dash.cloudflare.com (Workers AI → Edit).'
    }
  }
  const modelo = (opts.modelo || MODELO_PADRAO).trim()
  const url =
    'https://api.cloudflare.com/client/v4/accounts/' +
    encodeURIComponent(cred.conta) +
    '/ai/run/' +
    modelo.split('/').map(encodeURIComponent).join('/')
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cred.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.slice(0, 2000), steps: opts.passos || 4 }),
      signal: AbortSignal.timeout(180_000)
    })
    const txt = await res.text().catch(() => '')
    if (!res.ok) return { ok: false, erro: 'Cloudflare HTTP ' + res.status + ': ' + txt.slice(0, 300) }
    let dados: { result?: { image?: string }; success?: boolean; errors?: unknown[] } | null = null
    try { dados = JSON.parse(txt) } catch { /* resposta binária direta */ }
    const b64 = dados?.result?.image
    if (!b64) {
      // Alguns modelos devolvem imagem binária direta.
      if (txt.length > 1000 && !txt.trimStart().startsWith('{')) {
        const buf = Buffer.from(txt, 'binary')
        const destino = destinoArquivo(raiz, nomeArquivo('cf-imagem', '.jpg'), opts.saida)
        writeFileSync(destino, buf)
        return {
          ok: true,
          caminho: destino,
          caminhoRel: caminhoRelativo(raiz, destino),
          bytes: buf.length,
          mime: 'image/jpeg',
          previewBase64: previewDe(destino),
          aviso: 'Imagem via Cloudflare Workers AI (free tier).',
          detalhes: { motor: 'cloudflare-workers-ai', modelo }
        }
      }
      return { ok: false, erro: 'Cloudflare respondeu sem imagem: ' + txt.slice(0, 300) }
    }
    const buf = Buffer.from(b64, 'base64')
    if (!buf.length) return { ok: false, erro: 'Cloudflare retornou imagem vazia' }
    const destino = destinoArquivo(raiz, nomeArquivo('cf-imagem', '.jpg'), opts.saida)
    writeFileSync(destino, buf)
    return {
      ok: true,
      caminho: destino,
      caminhoRel: caminhoRelativo(raiz, destino),
      bytes: buf.length,
      mime: 'image/jpeg',
      previewBase64: previewDe(destino),
      aviso: 'Imagem via Cloudflare Workers AI (free tier ~10k neurônios/dia).',
      detalhes: { motor: 'cloudflare-workers-ai', modelo }
    }
  } catch (e) {
    return { ok: false, erro: 'Cloudflare falhou: ' + (e instanceof Error ? e.message : String(e)) }
  }
}
