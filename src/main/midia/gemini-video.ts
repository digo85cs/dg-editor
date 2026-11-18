/**
 * Veo (Google) — geração de vídeo por texto via Gemini API.
 * Long-running: submete operação e faz polling até concluir (pode levar minutos).
 * Requer GEMINI_API_KEY no cofre/env. Cobra por segundo de vídeo.
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
import { registrarUso } from './guarda-custo'

const MODELO_VEO = 'veo-3.1-generate-preview'
const BASE = 'https://generativelanguage.googleapis.com/v1beta'

function chaveGemini(): string | null {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { lerChave } = require('../brain/segredos-providers') as typeof import('../brain/segredos-providers')
    return lerChave('gemini')
  } catch {
    return null
  }
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function gerarVideoGemini(
  raiz: string,
  opts: {
    prompt: string
    imagem?: string
    aspectRatio?: '16:9' | '9:16'
    duracaoSeg?: number
    saida?: string
  }
): Promise<RespostaMidia> {
  const prompt = String(opts.prompt || '').trim()
  if (!prompt) return { ok: false, erro: 'informe o prompt do vídeo' }
  const chave = chaveGemini()
  if (!chave) {
    return { ok: false, erro: 'GEMINI_API_KEY não configurada. Cadastre em Contas → Provedores (gemini).' }
  }
  const t0 = Date.now()
  const aspecto = opts.aspectRatio === '9:16' ? '9:16' : '16:9'
  const duracao = Math.min(8, Math.max(4, Math.floor(opts.duracaoSeg || 8)))

  // 1. submete operação long-running
  let opNome = ''
  try {
    const r = await fetch(
      BASE + '/models/' + MODELO_VEO + ':predictLongRunning?key=' + encodeURIComponent(chave),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { aspectRatio: aspecto, durationSeconds: duracao }
        }),
        signal: AbortSignal.timeout(60_000)
      }
    )
    if (!r.ok) {
      const corpo = await r.text().catch(() => '')
      const erro = 'Veo HTTP ' + r.status + ': ' + corpo.slice(0, 300)
      registrarUso(raiz, 'veo', false, { detalhe: erro })
      return { ok: false, erro }
    }
    const j = (await r.json()) as { name?: string }
    opNome = j.name || ''
    if (!opNome) return { ok: false, erro: 'Veo não retornou operação.' }
  } catch (e) {
    return { ok: false, erro: 'falha ao submeter vídeo ao Veo: ' + (e instanceof Error ? e.message : String(e)) }
  }

  // 2. polling da operação (até ~8 min)
  const limite = Date.now() + 8 * 60_000
  let videoUri = ''
  let mimeVideo = 'video/mp4'
  while (Date.now() < limite) {
    await dormir(10_000)
    try {
      const r = await fetch(BASE + '/' + opNome + '?key=' + encodeURIComponent(chave), {
        signal: AbortSignal.timeout(30_000)
      })
      if (!r.ok) continue
      const j = (await r.json()) as {
        done?: boolean
        error?: { message?: string }
        response?: {
          generateVideoResponse?: {
            generatedSamples?: { video?: { uri?: string; mimeType?: string } }[]
          }
        }
      }
      if (j.error?.message) return { ok: false, erro: 'Veo falhou: ' + j.error.message.slice(0, 300) }
      if (!j.done) continue
      const samples = j.response?.generateVideoResponse?.generatedSamples || []
      const v = samples.find((s) => s.video?.uri)
      if (!v?.video?.uri) return { ok: false, erro: 'Veo concluiu sem vídeo na resposta.' }
      videoUri = v.video.uri
      mimeVideo = v.video.mimeType || 'video/mp4'
      break
    } catch {
      /* tenta de novo no próximo ciclo */
    }
  }
  if (!videoUri) return { ok: false, erro: 'Veo excedeu 8 min gerando o vídeo. Tente um prompt mais simples.' }

  // 3. baixa o vídeo
  try {
    const dl = await fetch(videoUri + (videoUri.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(chave), {
      signal: AbortSignal.timeout(300_000)
    })
    if (!dl.ok) return { ok: false, erro: 'falha ao baixar o vídeo gerado (HTTP ' + dl.status + ')' }
    const buf = Buffer.from(await dl.arrayBuffer())
    const destino = destinoArquivo(raiz, nomeArquivo(prompt, '.mp4'), opts.saida)
    writeFileSync(destino, buf)
    registrarUso(raiz, 'veo', true, { detalhe: aspecto + '/' + duracao + 's' })
    return {
      ok: true,
      caminho: destino,
      caminhoRel: caminhoRelativo(raiz, destino),
      bytes: buf.length,
      mime: mimeVideo,
      detalhes: {
        motor: 'veo',
        modelo: MODELO_VEO,
        aspecto,
        duracaoSeg: duracao,
        segundosProcessando: +((Date.now() - t0) / 1000).toFixed(1)
      },
      aviso: 'Vídeo gerado pelo Veo (Google) — leva alguns minutos e consome cota paga da chave Gemini. Custo registrado em .dg-editor/uso-custo.json.'
    }
  } catch (e) {
    return { ok: false, erro: 'falha ao salvar o vídeo: ' + (e instanceof Error ? e.message : String(e)) }
  }
}
