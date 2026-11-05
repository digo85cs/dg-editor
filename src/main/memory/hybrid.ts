import { loadChat } from '../chatstore'
import { buscarSemelhantes } from './embeddings'
import { dglog } from '../dglog'

/**
 * Recuperacao hibrida de memoria:
 *  1. janela recente (ultimos N turnos do chatstore) - contexto imediato
 *  2. busca semantica no historico antigo (embeddings) - contexto profundo
 * Deduplica por proximidade de texto para nao repetir o mesmo turno.
 */

export interface ContextoMemoria {
  janela: string
  profundas: string
  total: number
}

const JANELA_PADRAO = 8

export async function montarContexto(
  raiz: string,
  pergunta: string,
  janela = JANELA_PADRAO
): Promise<ContextoMemoria> {
  const historico = loadChat(raiz)
  const recentes = historico.slice(-janela)

  const linhasJanela = recentes.map((m) => {
    const quem = m.role === 'user' ? 'DONO' : 'DG'
    return quem + ': ' + m.content.slice(0, 600)
  })

  let profundas: string[] = []
  try {
    const antigas = await buscarSemelhantes(raiz, pergunta, 4, 0.45)
    const textosJanela = recentes.map((m) => m.content.slice(0, 120))
    profundas = antigas
      .filter((e) => {
        const inicio = e.texto.slice(0, 120)
        return !textosJanela.some((t) => t === inicio)
      })
      .map((e) => {
        const quem = e.role === 'user' ? 'DONO' : 'DG'
        const quando = new Date(e.at).toLocaleDateString('pt-BR')
        return '[' + quando + '] ' + quem + ': ' + e.texto.slice(0, 600)
      })
  } catch (e) {
    dglog('[memoria] busca semantica falhou: ' + String(e))
  }

  return {
    janela: linhasJanela.join('\n'),
    profundas: profundas.join('\n'),
    total: recentes.length + profundas.length
  }
}

export function blocoMemoria(ctx: ContextoMemoria): string {
  const partes: string[] = []
  if (ctx.profundas) {
    partes.push('### MEMORIA PROFUNDA (turnos antigos relevantes)')
    partes.push(ctx.profundas)
  }
  if (ctx.janela) {
    partes.push('### CONVERSA RECENTE')
    partes.push(ctx.janela)
  }
  return partes.join('\n\n')
}