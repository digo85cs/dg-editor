/**
 * Cascata grátis-primeiro para vídeo.
 *
 * Ordem:
 * 1. JSON2Video — 600s grátis/mês, cenas (imagem+texto+narração); requer cenas.
 * 2. ComfyUI local — ilimitado (AnimateDiff), lento em CPU; requer prompt.
 * 3. Veo (Gemini) — PAGO por segundo, só com incluirPago=true.
 *
 * `cenas` e `prompt` são alternativos: cenas → JSON2Video; prompt → ComfyUI/Veo.
 */
import type { RespostaMidia } from './core'
import type { CenaJson2Video } from './json2video'

type Tentativa = { motor: string; ok: boolean; erro?: string; segundos?: number }

export type OpcoesVideoAuto = {
  prompt?: string
  cenas?: CenaJson2Video[]
  largura?: number
  altura?: number
  saida?: string
  incluirPago?: boolean
}

export async function gerarVideoAuto(
  raiz: string,
  opts: OpcoesVideoAuto
): Promise<RespostaMidia> {
  const tentativas: Tentativa[] = []
  const registrar = (motor: string, r: RespostaMidia, t0: number): Tentativa => {
    const t: Tentativa = { motor, ok: r.ok, segundos: +((Date.now() - t0) / 1000).toFixed(1) }
    if (!r.ok && r.erro) t.erro = r.erro.slice(0, 160)
    tentativas.push(t)
    return t
  }
  const comCascata = (r: RespostaMidia): RespostaMidia => ({
    ...r,
    detalhes: { ...(r.detalhes || {}), cascata: tentativas }
  })

  if (!String(opts.prompt || '').trim() && !opts.cenas?.length) {
    return { ok: false, erro: 'informe prompt (texto-para-vídeo) ou cenas (imagem/texto/narração)' }
  }

  // 1. JSON2Video — só quando há cenas (free quota da conta)
  if (opts.cenas?.length) {
    try {
      const { gerarVideoJson2Video, json2videoConfigurado } = await import('./json2video')
      if (json2videoConfigurado()) {
        const t0 = Date.now()
        const r = await gerarVideoJson2Video(raiz, {
          cenas: opts.cenas,
          saida: opts.saida
        })
        if (registrar('json2video', r, t0).ok) {
          r.aviso = (r.aviso ? r.aviso + ' ' : '') + 'Cascata vídeo grátis-primeiro: JSON2Video (cota mensal).'
          return comCascata(r)
        }
      } else {
        tentativas.push({ motor: 'json2video', ok: false, erro: 'sem JSON2VIDEO_API_KEY' })
      }
    } catch (e) {
      tentativas.push({ motor: 'json2video', ok: false, erro: String(e).slice(0, 160) })
    }
  }

  const prompt = String(opts.prompt || '').trim()

  // 2. ComfyUI local (ilimitado; AnimateDiff)
  if (prompt) {
    try {
      const { gerarVideoComfy, comfyInstalado } = await import('./comfyui')
      if (comfyInstalado()) {
        const t0 = Date.now()
        const r = await gerarVideoComfy(raiz, {
          prompt,
          largura: opts.largura,
          altura: opts.altura,
          saida: opts.saida
        })
        if (registrar('comfyui-video', r, t0).ok) {
          r.aviso = (r.aviso ? r.aviso + ' ' : '') + 'Cascata vídeo grátis-primeiro: ComfyUI local.'
          return comCascata(r)
        }
      } else {
        tentativas.push({ motor: 'comfyui-video', ok: false, erro: 'ComfyUI não instalado' })
      }
    } catch (e) {
      tentativas.push({ motor: 'comfyui-video', ok: false, erro: String(e).slice(0, 160) })
    }
  }

  // 3. Veo — pago, só com opt-in explícito
  if (opts.incluirPago && prompt) {
    try {
      const { gerarVideoGemini } = await import('./gemini-video')
      const t0 = Date.now()
      const r = await gerarVideoGemini(raiz, { prompt, saida: opts.saida })
      registrar('veo', r, t0)
      if (r.ok) {
        r.aviso = (r.aviso ? r.aviso + ' ' : '') + 'Motores grátis falharam → Veo pago usado (custo aplicado).'
        return comCascata(r)
      }
    } catch {
      /* segue */
    }
  }

  const ultimo = [...tentativas].reverse().find((t) => t.erro)?.erro
  return {
    ok: false,
    erro: 'Nenhum motor de vídeo conseguiu gerar. Último erro: ' + (ultimo || 'desconhecido'),
    codigo: 'SEM_MOTOR_VIDEO',
    detalhes: { cascata: tentativas },
    aviso: opts.incluirPago
      ? 'Todos os motores falharam, incluindo Veo.'
      : 'Motores grátis falharam. Para vídeo IA realista pago, chame midia_video_gemini ou passe incluir_pago=true.'
  }
}
