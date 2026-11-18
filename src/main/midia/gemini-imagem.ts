/**
 * Gemini image (nano banana) — geração de imagem via API Google.
 * Rápida (segundos) e de alta qualidade; requer GEMINI_API_KEY no cofre/env.
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import {
  caminhoRelativo,
  destinoArquivo,
  nomeArquivo,
  pastaMidia,
  previewDe,
  validarEntrada,
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

// Cota free de imagem esgotada (HTTP 429 quota=0) — pula a tentativa por 1h
// para não gastar uma chamada inútil a cada pedido na cascata.
let cotaImagemBloqueadaAte = 0

export function geminiImagemCotaEsgotada(): boolean {
  return Date.now() < cotaImagemBloqueadaAte
}

function registrarErroCota(status: number, corpo: string): void {
  const t = corpo.toLowerCase()
  if (status === 429 || /quota|free tier|rate limit|exceeded/i.test(t)) {
    cotaImagemBloqueadaAte = Date.now() + 60 * 60_000
  }
}

type ParteGemini = { text: string } | { inlineData: { mimeType: string; data: string } }

async function chamarGeminiImagem(
  chave: string,
  parts: ParteGemini[]
): Promise<{ ok: true; mime: string; dados: Buffer } | { ok: false; erro: string }> {
  const res = await fetch(URL_GERAR + '?key=' + encodeURIComponent(chave), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['IMAGE'] }
    }),
    signal: AbortSignal.timeout(180_000)
  })
  if (!res.ok) {
    const corpo = await res.text().catch(() => '')
    registrarErroCota(res.status, corpo)
    return { ok: false, erro: 'Gemini image HTTP ' + res.status + ': ' + corpo.slice(0, 300) }
  }
  const j = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[]
  } | null
  const img = (j?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data)
  if (!img?.inlineData?.data) {
    return { ok: false, erro: 'Gemini não retornou imagem (verifique o prompt ou a cota da chave).' }
  }
  return {
    ok: true,
    mime: img.inlineData.mimeType || 'image/png',
    dados: Buffer.from(img.inlineData.data, 'base64')
  }
}

function salvarRespostaImagem(
  raiz: string,
  prompt: string,
  r: { mime: string; dados: Buffer },
  opts: { saida?: string },
  t0: number,
  motor: string
): RespostaMidia {
  const ext = r.mime.includes('jpeg') || r.mime.includes('jpg') ? '.jpg' : r.mime.includes('webp') ? '.webp' : '.png'
  const destino = destinoArquivo(raiz, nomeArquivo(prompt, ext), opts.saida)
  writeFileSync(destino, r.dados)
  const bytes = statSync(destino).size
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes,
    mime: r.mime,
    previewBase64: previewDe(destino),
    detalhes: {
      motor,
      modelo: MODELO_IMAGEM,
      segundosProcessando: +((Date.now() - t0) / 1000).toFixed(1)
    },
    aviso: 'Imagem gerada pelo Gemini (nano banana) — rápida e gratuita dentro da cota da chave.'
  }
}

function chaveOuErro(): { chave: string } | { erro: RespostaMidia } {
  const chave = chaveGemini()
  if (!chave) {
    return {
      erro: {
        ok: false,
        erro: 'GEMINI_API_KEY não configurada. Cadastre em Contas → Provedores (gemini) ou use midia_imagem_gerar.'
      }
    }
  }
  return { chave }
}

export async function gerarImagemGemini(
  raiz: string,
  opts: { prompt: string; saida?: string }
): Promise<RespostaMidia> {
  const prompt = String(opts.prompt || '').trim()
  if (!prompt) return { ok: false, erro: 'informe o prompt da imagem' }
  const c = chaveOuErro()
  if ('erro' in c) return c.erro
  const t0 = Date.now()
  let r: Awaited<ReturnType<typeof chamarGeminiImagem>>
  try {
    r = await chamarGeminiImagem(c.chave, [{ text: prompt }])
  } catch (e) {
    return { ok: false, erro: 'falha de rede ao chamar o Gemini: ' + (e instanceof Error ? e.message : String(e)) }
  }
  if (!r.ok) return { ok: false, erro: r.erro }
  return salvarRespostaImagem(raiz, prompt, r, opts, t0, 'gemini-image')
}

/** Edição img2img: envia imagem local + instrução ("troca o fundo", "põe chapéu"). */
export async function editarImagemGemini(
  raiz: string,
  opts: { imagem: string; prompt: string; saida?: string }
): Promise<RespostaMidia> {
  const prompt = String(opts.prompt || '').trim()
  if (!prompt) return { ok: false, erro: 'informe a instrução de edição' }
  const entrada = typeof opts.imagem === 'string' ? opts.imagem.trim() : ''
  if (!entrada) return { ok: false, erro: 'informe o caminho da imagem a editar' }
  const erroEntrada = validarEntrada(entrada, 'imagem')
  if (erroEntrada) return { ok: false, erro: erroEntrada }
  const abs = resolve(raiz, entrada)
  const ext = extname(abs).toLowerCase()
  const mimeEntrada =
    ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg'
  const c = chaveOuErro()
  if ('erro' in c) return c.erro
  const t0 = Date.now()
  let r: Awaited<ReturnType<typeof chamarGeminiImagem>>
  try {
    r = await chamarGeminiImagem(c.chave, [
      { inlineData: { mimeType: mimeEntrada, data: readFileSync(abs).toString('base64') } },
      { text: prompt }
    ])
  } catch (e) {
    return { ok: false, erro: 'falha de rede ao chamar o Gemini: ' + (e instanceof Error ? e.message : String(e)) }
  }
  if (!r.ok) return { ok: false, erro: r.erro }
  return salvarRespostaImagem(raiz, prompt, r, opts, t0, 'gemini-image-edit')
}

