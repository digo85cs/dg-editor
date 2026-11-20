/**
 * Visao do chat: interpreta imagens anexadas (base64) conforme o pedido do usuario.
 * Ordem: Ollama local VL (qwen2.5vl — gratis, privado) → Gemini vision (se houver chave).
 */
import { dglog } from '../dglog'
import { OLLAMA_URL, ollamaHttpJson } from './ollama'

export interface AnexoImagem {
  nome: string
  tipo: string
  data: string
}

const MODELOS_VL = ['qwen2.5vl:3b', 'qwen2.5vl:7b', 'moondream', 'llava']
const TIMEOUT_VL_MS = 120_000

function promptVisao(pedido: string): string {
  return (
    'Voce esta analisando imagens anexadas pelo usuario no DG Editor. ' +
    'Pedido do usuario: "' +
    String(pedido || '').slice(0, 800) +
    '".\n' +
    'Descreva as imagens em detalhe suficiente para atender ao pedido: ' +
    'texto legivel (transcreva), elementos de UI, erros, codigo, dados, contexto. ' +
    'Se o pedido for uma pergunta sobre a imagem, responda diretamente a pergunta. ' +
    'Responda SEMPRE em portugues do Brasil — mesmo que o pedido ou o texto da imagem ' +
    'estejam em outro idioma. Transcreva textos estrangeiros como estao, mas comente em pt-BR. ' +
    'Objetivo, sem enrolacao.'
  )
}

async function tentarOllamaVl(
  imagens: AnexoImagem[],
  pedido: string
): Promise<{ texto: string; modelo: string } | null> {
  // Ollama aceita múltiplas imagens numa unica mensagem user.
  const corpo = {
    model: '',
    messages: [
      {
        role: 'user',
        content: promptVisao(pedido),
        images: imagens.slice(0, 4).map((i) => i.data)
      }
    ],
    stream: false,
    options: { temperature: 0.2, num_ctx: 8192, num_predict: 1200 }
  }
  for (const modelo of MODELOS_VL) {
    try {
      dglog('[visao] ollama tentando ' + modelo)
      const r = (await ollamaHttpJson(
        OLLAMA_URL + '/api/chat',
        { ...corpo, model: modelo },
        'POST',
        TIMEOUT_VL_MS
      )) as { message?: { content?: string } }
      const texto = String(r?.message?.content || '').trim()
      if (texto) {
        dglog('[visao] ollama ok com ' + modelo + ' (' + texto.length + ' chars)')
        return { texto, modelo }
      }
    } catch (e) {
      dglog('[visao] ollama ' + modelo + ' falhou: ' + String(e instanceof Error ? e.message : e).slice(0, 120))
    }
  }
  return null
}

/**
 * Interpreta imagens conforme o pedido. Lanca erro se nenhum provedor de visao responder.
 */
export async function interpretarImagens(
  imagens: AnexoImagem[],
  pedido: string
): Promise<{ texto: string; fonte: string }> {
  if (!imagens.length) throw new Error('sem imagens')
  const normalizadas = imagens
    .filter((i) => typeof i?.data === 'string' && i.data.length > 20)
    .map((i) => ({
      nome: String(i.nome || 'imagem'),
      tipo: String(i.tipo || 'image/png'),
      data: String(i.data).replace(/^data:[^,]+,/, '')
    }))
  if (!normalizadas.length) throw new Error('imagens sem dados')

  const vl = await tentarOllamaVl(normalizadas, pedido)
  if (vl) return { texto: vl.texto, fonte: 'ollama:' + vl.modelo }

  try {
    const { analisarImagensGemini } = await import('./visao-gemini')
    const g = await analisarImagensGemini(normalizadas, promptVisao(pedido))
    return { texto: g.texto, fonte: 'gemini:' + g.modelo }
  } catch (e) {
    dglog('[visao] gemini fallback falhou: ' + String(e))
  }

  throw new Error(
    'Nenhum modelo de visao disponivel. Instale um VL no Ollama (ex.: ollama pull qwen2.5vl:3b) ' +
      'ou configure a chave Gemini.'
  )
}
