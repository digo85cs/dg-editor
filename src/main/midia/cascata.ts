/**
 * Cascata grátis-primeiro para geração de imagem.
 *
 * Ordem (sempre grátis antes de pago):
 * 1. Gemini image — cota gratuita do AI Studio quando há chave;
 * 2. Pollinations — 100% grátis, sem chave (rate limit ~1/45s);
 * 3. ComfyUI local — ilimitado, mas lento em CPU;
 * 4. OpenAI gpt-image — PAGO, só como último recurso quando o usuário
 *    tem OPENAI_API_KEY (a tool específica continua existindo para
 *    quando o pedido for explicitamente "melhor qualidade paga").
 *
 * Cada tentativa fica registrada em detalhes.cascata para transparência.
 */
import type { RespostaMidia } from './core'
import { gerarImagem as gerarImagemPollinations } from './core'
import { gerarImagemGemini, geminiImagemConfigurado } from './gemini-imagem'
import { gerarImagemComfy, comfyInstalado } from './comfyui'

export type OpcoesImagemAuto = {
  prompt: string
  largura?: number
  altura?: number
  seed?: number
  passos?: number
  saida?: string
  incluirPago?: boolean
}

type Tentativa = { motor: string; ok: boolean; erro?: string; segundos?: number }

export async function gerarImagemAuto(
  raiz: string,
  opts: OpcoesImagemAuto
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

  // 1. Gemini (cota free do AI Studio)
  if (geminiImagemConfigurado()) {
    const t0 = Date.now()
    try {
      const r = await gerarImagemGemini(raiz, { prompt: opts.prompt, saida: opts.saida })
      if (registrar('gemini-image', r, t0).ok) return comCascata(r)
    } catch (e) {
      tentativas.push({ motor: 'gemini-image', ok: false, erro: String(e).slice(0, 160), segundos: +((Date.now() - t0) / 1000).toFixed(1) })
    }
  } else {
    tentativas.push({ motor: 'gemini-image', ok: false, erro: 'sem GEMINI_API_KEY' })
  }

  // 2. Pollinations (grátis, sem chave)
  {
    const t0 = Date.now()
    const r = await gerarImagemPollinations(raiz, {
      prompt: opts.prompt,
      largura: opts.largura,
      altura: opts.altura,
      seed: opts.seed,
      saida: opts.saida,
      esperarLimite: false
    })
    if (registrar('pollinations', r, t0).ok) {
      r.aviso = (r.aviso ? r.aviso + ' ' : '') + 'Cascata grátis-primeiro: Gemini indisponível → Pollinations.'
      return comCascata(r)
    }
  }

  // 3. ComfyUI local (ilimitado; geraImagemComfy já cai no Pollinations se não instalado — pulamos nesse caso)
  if (comfyInstalado()) {
    const t0 = Date.now()
    try {
      const r = await gerarImagemComfy(raiz, {
        prompt: opts.prompt,
        largura: opts.largura,
        altura: opts.altura,
        passos: opts.passos,
        seed: opts.seed,
        saida: opts.saida
      })
      if (registrar('comfyui-local', r, t0).ok) {
        r.aviso = (r.aviso ? r.aviso + ' ' : '') + 'Cascata grátis-primeiro: engines cloud indisponíveis → ComfyUI local.'
        return comCascata(r)
      }
    } catch (e) {
      tentativas.push({ motor: 'comfyui-local', ok: false, erro: String(e).slice(0, 160), segundos: +((Date.now() - t0) / 1000).toFixed(1) })
    }
  } else {
    tentativas.push({ motor: 'comfyui-local', ok: false, erro: 'ComfyUI não instalado' })
  }

  // 4. OpenAI pago — só se o usuário pedir explicitamente (incluirPago)
  if (opts.incluirPago) {
    try {
      const { gerarImagemOpenAI } = await import('./openai-midia')
      const t0 = Date.now()
      const r = await gerarImagemOpenAI(raiz, { prompt: opts.prompt, saida: opts.saida })
      registrar('openai-gpt-image', r, t0)
      if (r.ok) {
        r.aviso = (r.aviso ? r.aviso + ' ' : '') + 'Todos os motores grátis falharam → OpenAI pago usado (custo aplicado).'
        return comCascata(r)
      }
    } catch {
      /* openai-midia indisponível */
    }
  }

  const ultimo = [...tentativas].reverse().find((t) => t.erro)?.erro
  return {
    ok: false,
    erro: 'Nenhum motor de imagem conseguiu gerar. Último erro: ' + (ultimo || 'desconhecido'),
    codigo: 'SEM_MOTOR',
    detalhes: { cascata: tentativas },
    aviso: opts.incluirPago
      ? 'Todos os motores falharam, incluindo OpenAI.'
      : 'Motores grátis falharam. Para usar o pago (gpt-image), chame midia_imagem_openai ou passe incluir_pago=true.'
  }
}
