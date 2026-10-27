import { aplicarBaseline } from './baseline'
import { medirPerfBootless } from './cenarios/perf-boas'
import type { MetricaPerf, ResultadoCenario } from './tipos'

export async function executarSuitePerf(
  raiz: string,
  atualizarBaseline: boolean
): Promise<{ resultados: ResultadoCenario[]; metricas: MetricaPerf[]; baselineCriada: boolean }> {
  console.log('[qa:perf] medindo (mediana 3x)...')
  const { resultados, medidas } = await medirPerfBootless()
  const { metricas, baselineCriada } = aplicarBaseline(raiz, medidas, atualizarBaseline)
  for (const m of metricas) {
    console.log(
      `  [PERF] ${m.id}: ${m.valor}ms (limite ${m.limite}ms) ${m.dentroDoLimite ? 'OK' : 'FORA'}`
    )
  }
  if (baselineCriada) console.log('[qa:perf] baseline criada em qa-artifacts/baseline.json')
  for (const m of metricas) {
    if (!m.dentroDoLimite) {
      const hit = resultados.find((r) => r.id === m.id)
      if (hit && hit.severidade === 'ok') hit.severidade = 'warn'
      if (hit) hit.detalhe = (hit.detalhe || '') + ' | fora da baseline'
    }
  }
  return { resultados, metricas, baselineCriada }
}
