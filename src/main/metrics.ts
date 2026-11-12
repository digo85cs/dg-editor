/**
 * Metricas leves em memoria para o orquestrador de agentes.
 * Registra duracao, sucesso/erro e timeouts por agente.
 * Nao depende de dependencias externas; so log via dglog.
 */
import { dglog } from './dglog'

type RegistroAgente = {
  chamadas: number
  sucessos: number
  erros: number
  timeouts: number
  duracaoTotalMs: number
  duracaoMaxMs: number
}

const metricas: Map<string, RegistroAgente> = new Map()

function obter(agente: string): RegistroAgente {
  let r = metricas.get(agente)
  if (!r) {
    r = { chamadas: 0, sucessos: 0, erros: 0, timeouts: 0, duracaoTotalMs: 0, duracaoMaxMs: 0 }
    metricas.set(agente, r)
  }
  return r
}

export function registrarMetricaAgente(
  agente: string,
  opts: { ok: boolean; duracaoMs: number; foiTimeout: boolean }
): void {
  const r = obter(agente)
  r.chamadas++
  r.duracaoTotalMs += opts.duracaoMs
  if (opts.duracaoMs > r.duracaoMaxMs) r.duracaoMaxMs = opts.duracaoMs
  if (opts.foiTimeout) {
    r.timeouts++
    r.erros++
  } else if (opts.ok) {
    r.sucessos++
  } else {
    r.erros++
  }
}

export function obterMetricasAgente(agente: string): RegistroAgente | undefined {
  return metricas.get(agente)
}

export function listarMetricasAgentes(): RegistroAgente[] {
  return Array.from(metricas.entries()).map(([agente, r]) => ({ agente, ...r }))
}

export function logResumoMetricas(): void {
  if (metricas.size === 0) return
  dglog('[metricas] resumo agentes:')
  for (const [agente, r] of metricas) {
    const taxaSucesso = r.chamadas > 0 ? ((r.sucessos / r.chamadas) * 100).toFixed(1) : '0'
    const media = r.chamadas > 0 ? (r.duracaoTotalMs / r.chamadas).toFixed(0) : '0'
    dglog(
      `[metricas] ${agente}: chamadas=${r.chamadas} sucessos=${r.sucessos} erros=${r.erros} ` +
      `timeouts=${r.timeouts} taxaSucesso=${taxaSucesso}% mediaMs=${media} maxMs=${r.duracaoMaxMs}`
    )
  }
}

export function resetarMetricas(): void {
  metricas.clear()
}
