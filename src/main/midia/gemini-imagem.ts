/**
 * Gemini image (nano banana) — geração de imagem via API Google.
 * Rápida (segundos) e de alta qualidade; requer GEMINI_API_KEY no cofre/env.
 */
import { statSync, writeFileSync } from 'node:fs'
import {
  caminhoRelativo,
  destinoArquivo,
  nomeArquivo,
  pastaMidia,
  previewDe,
  type RespostaMidia
} from './core'

const MODELO_IMAGEM = 'gemini-2.5-flash-image'
const URL_GERAR =
  'https://generativelanguage.googleapis.com/v1beta/models/' + MODELO_IMAGEM + ':generateContent'

function chaveGemini(): string | null {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  try {
    // vault safeStorage — lazy p/ não quebrar o servidor MCP (electron run-as-node)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { lerChave } = require('../brain/segredos-providers') as typeof import('../brain/segredos-providers')
    return lerChave('gemini')
  } catch {
    return null
  }
}

export function geminiImagemConfigurado(): boolean {
  return !!chaveGemini()
}

export async function gerarImagemGemini(
  raiz: string,
  opts: { prompt: string; saida?: string }
): Promise<RespostaMidia> {
  const prompt = String(opts.prompt || '').trim()
  if (!prompt) return { ok: false, erro: 'informe o prompt da imagem' }
  const chave = chaveGemini()
  if (!chave) {
    return {
      ok: false,
      erro: 'GEMINI_API_KEY não configurada. Cadastre em Contas → Provedores (gemini) ou use midia_imagem_gerar.'
    }
  }
  const t0 = Date.now()
  let res: Response
  try {
    res = await fetch(URL_GERAR + '?key=' + encodeURIComponent(chave), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'] }
      }),
      signal: AbortSignal.timeout(180_000)
    })
  } catch (e) {
    return { ok: false, erro: 'falha de rede ao chamar o Gemini: ' + (e instanceof Error ? e.message : String(e)) }
  }
  if (!res.ok) {
    const corpo = await res.text().catch(() => '')
    return {
      ok: false,
      erro: 'Gemini image HTTP ' + res.status + ': ' + corpo.slice(0, 300)
    }
  }
  const j = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[]
  } | null
  const partes = j?.candidates?.[0]?.content?.parts || []
  const img = partes.find((p) => p.inlineData?.data)
  if (!img?.inlineData?.data) {
    return { ok: false, erro: 'Gemini não retornou imagem (verifique o prompt ou a cota da chave).' }
  }
  const mime = img.inlineData.mimeType || 'image/png'
  const ext = mime.includes('jpeg') || mime.includes('jpg') ? '.jpg' : mime.includes('webp') ? '.webp' : '.png'
  const destino = destinoArquivo(raiz, nomeArquivo(prompt, ext), opts.saida)
  writeFileSync(destino, Buffer.from(img.inlineData.data, 'base64'))
  const bytes = statSync(destino).size
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes,
    mime,
    previewBase64: previewDe(destino),
    detalhes: {
      motor: 'gemini-image',
      modelo: MODELO_IMAGEM,
      segundosProcessando: +((Date.now() - t0) / 1000).toFixed(1)
    },
    aviso: 'Imagem gerada pelo Gemini (nano banana) — rápida e gratuita dentro da cota da chave.'
  }
}

