/**
 * Estimativa de tokens e custo por turno/sessao de chat.
 * Nao substitui usage real dos provedores: streams OpenAI/Ollama deste app
 * nao devolvem usage, entao usamos ~4 caracteres por token (heuristica padrao).
 * O custo usa a tabela de precos do registry quando o provider a declara.
 */
import { obterProvider } from './providers-registry'

export type UsoTokens = {
  entrada: number
  saida: number
  total: number
  custoUSD: number | null
  estimado: true
}

export function estimarTokens(texto: string | null | undefined): number {
  if (!texto) return 0
  return Math.max(1, Math.ceil(String(texto).length / 4))
}

/** Preco do provider pelo id do registry (aceita "id:modelo" e ignora o sufixo). */
export function custoEstimadoUSD(
  providerId: string,
  tokensEntrada: number,
  tokensSaida: number
): number | null {
  const id = String(providerId || '').split(':')[0].trim()
  if (!id) return null
  if (id === 'ollama' || id === 'ollama-local' || id.startsWith('local')) return 0
  try {
    const p = obterProvider(id)
    if (!p?.preco) return null
    return (
      (tokensEntrada / 1_000_000) * p.preco.entradaPor1M +
      (tokensSaida / 1_000_000) * p.preco.saidaPor1M
    )
  } catch {
    return null
  }
}

export function calcularUso(providerId: string, prompt: string, resposta: string): UsoTokens {
  const entrada = estimarTokens(prompt)
  const saida = estimarTokens(resposta)
  return {
    entrada,
    saida,
    total: entrada + saida,
    custoUSD: custoEstimadoUSD(providerId, entrada, saida),
    estimado: true
  }
}

export type ResumoUso = {
  tokensEntrada: number
  tokensSaida: number
  tokensTotal: number
  custoUSD: number | null
  turnos: number
}

/** Resume o usage persistido nas mensagens do chat para exibir na sessao. */
export function resumirUso(mensagens: Array<{ usage?: Partial<UsoTokens> | null }>): ResumoUso {
  let tokensEntrada = 0
  let tokensSaida = 0
  let custo: number | null = null
  let turnos = 0
  for (const m of Array.isArray(mensagens) ? mensagens : []) {
    const u = m?.usage
    if (!u) continue
    turnos++
    tokensEntrada += Number(u.entrada) || 0
    tokensSaida += Number(u.saida) || 0
    if (typeof u.custoUSD === 'number' && Number.isFinite(u.custoUSD)) {
      custo = (custo || 0) + u.custoUSD
    }
  }
  return {
    tokensEntrada,
    tokensSaida,
    tokensTotal: tokensEntrada + tokensSaida,
    custoUSD: custo,
    turnos
  }
}
