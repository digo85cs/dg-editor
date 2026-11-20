/**
 * Resumo de custo/tokens do dia corrente a partir do chat persistido.
 * Escopo: .dg-editor/chat.json do projeto ativo (teto de 200 mensagens).
 * Estimativa (~4 chars/token), mesma heuristica de custo-sessao.
 */
import { loadChat } from '../chatstore'

export type ResumoCustoDiario = {
  ok: boolean
  erro?: string
  data: string
  turnos: number
  tokensEntrada: number
  tokensSaida: number
  custoUSD: number | null
  estimado: true
}

export function resumoCustoDiario(raiz: string): ResumoCustoDiario {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const inicio = hoje.getTime()
  const iso = hoje.toISOString().slice(0, 10)
  const base = { data: iso, estimado: true as const }
  try {
    const msgs = loadChat(raiz)
    let turnos = 0
    let tokensEntrada = 0
    let tokensSaida = 0
    let custo: number | null = null
    for (const m of msgs) {
      const at = Number((m as { at?: unknown }).at)
      if (!Number.isFinite(at) || at < inicio) continue
      const u = (m as { usage?: { entrada?: unknown; saida?: unknown; custoUSD?: unknown } }).usage
      if (!u) continue
      turnos++
      tokensEntrada += Number(u.entrada) || 0
      tokensSaida += Number(u.saida) || 0
      if (typeof u.custoUSD === 'number' && Number.isFinite(u.custoUSD)) {
        custo = (custo || 0) + u.custoUSD
      }
    }
    return { ok: true, ...base, turnos, tokensEntrada, tokensSaida, custoUSD: custo }
  } catch (e) {
    return { ok: false, erro: String(e), ...base, turnos: 0, tokensEntrada: 0, tokensSaida: 0, custoUSD: null }
  }
}
