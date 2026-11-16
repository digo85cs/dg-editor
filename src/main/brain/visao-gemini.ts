/**
 * Visão Gemini — analisa imagens base64 via Gemini API (generateContent REST).
 *
 * Usa apenas módulos Node built-in (https) — zero dependências externas.
 * Requer GEMINI_API_KEY ou chave no cofre (ref: 'gemini').
 *
 * Modelos tentados em ordem (free tier):
 *   gemini-3.5-flash-lite → gemini-3.1-flash-lite → gemini-3.8-flash
 */

import { request as httpsRequest } from 'https'
import { dglog } from '../dglog'
import { lerChave } from './segredos-providers'

const MODELOS_VISAO = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
]
const BASE = 'generativelanguage.googleapis.com'
const TIMEOUT_MS = 25_000

function geminiKey(): string {
  const cofre = lerChave('gemini')
  if (cofre) return String(cofre).trim()
  return String(process.env.GEMINI_API_KEY || '').trim()
}

/** Faz POST REST para Gemini generateContent. Retorna body string ou lança erro. */
function postGemini(modelo: string, corpo: unknown, apiKey: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const path = `/v1beta/models/${modelo}:generateContent?key=${apiKey}`
    const dados = Buffer.from(JSON.stringify(corpo), 'utf8')
    let settled = false
    const req = httpsRequest(
      {
        hostname: BASE,
        port: 443,
        path,
        method: 'POST',
        timeout: TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': dados.length,
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          if (settled) return
          settled = true
          const body = Buffer.concat(chunks).toString('utf8')
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body)
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`))
          }
        })
        res.on('error', (e: Error) => {
          if (!settled) { settled = true; reject(e) }
        })
      }
    )
    req.on('timeout', () => {
      if (!settled) { settled = true; req.destroy(); reject(new Error('timeout visao-gemini')) }
    })
    req.on('error', (e: Error) => {
      if (!settled) { settled = true; reject(e) }
    })
    req.write(dados)
    req.end()
  })
}

export interface AnexoImagem {
  nome: string
  /** mimeType ex: 'image/png', 'image/jpeg' */
  tipo: string
  /** base64 puro (sem prefixo data:...) */
  data: string
}

/**
 * Analisa uma lista de imagens com o texto do usuário.
 * Retorna texto de resposta do Gemini ou lança erro.
 */
export async function analisarImagensGemini(
  imagens: AnexoImagem[],
  textoPedido: string,
  contextoSistema?: string
): Promise<{ texto: string; modelo: string }> {
  const apiKey = geminiKey()
  if (!apiKey) throw new Error('GEMINI_API_KEY nao configurada — configure em Configuracoes > Chaves API')

  // Monta parts: cada imagem inline + texto
  const parts: unknown[] = imagens.map((img) => ({
    inlineData: {
      mimeType: img.tipo || 'image/png',
      data: img.data,
    },
  }))
  parts.push({ text: textoPedido })

  const contents = [{ role: 'user', parts }]

  // System instruction opcional
  const corpo: Record<string, unknown> = { contents }
  if (contextoSistema) {
    corpo.systemInstruction = { parts: [{ text: contextoSistema }] }
  }
  corpo.generationConfig = { maxOutputTokens: 2048 }

  let ultimoErro: Error = new Error('nenhum modelo disponivel')
  for (const modelo of MODELOS_VISAO) {
    try {
      dglog(`[visao-gemini] tentando modelo ${modelo}`)
      const body = await postGemini(modelo, corpo, apiKey)
      const json = JSON.parse(body) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> }
          finishReason?: string
        }>
        error?: { message?: string; code?: number }
      }
      if (json.error) throw new Error(json.error.message || 'erro gemini')
      const texto = json.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (!texto) throw new Error('resposta vazia do modelo')
      dglog(`[visao-gemini] ok com ${modelo} (${texto.length} chars)`)
      return { texto, modelo }
    } catch (e) {
      ultimoErro = e instanceof Error ? e : new Error(String(e))
      dglog(`[visao-gemini] falha ${modelo}: ${ultimoErro.message}`)
    }
  }
  throw ultimoErro
}
