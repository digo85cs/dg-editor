/**
 * HuggingFace Inference API — free tier (~créditos mensais grátis).
 * Requer HF_TOKEN (huggingface.co/settings/tokens, grátis).
 * Modelo padrão: FLUX.1-schnell (rápido). Outros modelos podem ser
 * passados em opts.modelo (ex.: 'black-forest-labs/FLUX.1-dev').
 */
import { writeFileSync } from 'node:fs'
import {
  caminhoRelativo,
  destinoArquivo,
  mimePorExt,
  nomeArquivo,
  previewDe,
  type RespostaMidia
} from './core'

const MODELO_PADRAO = 'black-forest-labs/FLUX.1-schnell'

function chaveHF(): string | null {
  return (process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || '').trim() || null
}

export function hfConfigurado(): boolean {
  return !!chaveHF()
}

export async function gerarImagemHF(
  raiz: string,
  opts: { prompt: string; modelo?: string; saida?: string }
): Promise<RespostaMidia> {
  const prompt = String(opts.prompt || '').trim()
  if (!prompt) return { ok: false, erro: 'informe o prompt' }
  const chave = chaveHF()
  if (!chave) {
    return {
      ok: false,
      erro: 'HF_TOKEN não configurada. Crie grátis em huggingface.co/settings/tokens e salve em Contas → Provedores.'
    }
  }
  const modelo = (opts.modelo || MODELO_PADRAO).trim()
  const url = 'https://api-inference.huggingface.co/models/' + encodeURIComponent(modelo)
  const corpo = JSON.stringify({ inputs: prompt.slice(0, 1000), parameters: { num_inference_steps: 4 } })

  // O modelo pode estar "loading" (503) na primeira chamada — tenta 3x com espera.
  let ultimoErro = ''
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + chave, 'Content-Type': 'application/json' },
        body: corpo,
        signal: AbortSignal.timeout(180_000)
      })
      const ct = (res.headers.get('content-type') || '').toLowerCase()
      if (res.ok && ct.startsWith('image/')) {
        const buf = Buffer.from(await res.arrayBuffer())
        if (!buf.length) return { ok: false, erro: 'HF retornou imagem vazia' }
        const ext = ct.includes('png') ? '.png' : ct.includes('webp') ? '.webp' : '.jpg'
        const destino = destinoArquivo(raiz, nomeArquivo('hf-imagem', ext), opts.saida)
        writeFileSync(destino, buf)
        return {
          ok: true,
          caminho: destino,
          caminhoRel: caminhoRelativo(raiz, destino),
          bytes: buf.length,
          mime: ct,
          previewBase64: previewDe(destino),
          aviso: 'Imagem via HuggingFace Inference (free tier; requer HF_TOKEN).',
          detalhes: { motor: 'huggingface', modelo }
        }
      }
      const txt = await res.text().catch(() => '')
      ultimoErro = 'HTTP ' + res.status + ': ' + txt.slice(0, 200)
      if (res.status === 503 && /loading|starting/i.test(txt)) {
        await new Promise((r) => setTimeout(r, 10_000))
        continue
      }
      break
    } catch (e) {
      ultimoErro = e instanceof Error ? e.message : String(e)
      break
    }
  }
  return { ok: false, erro: 'HuggingFace falhou: ' + ultimoErro }
}
