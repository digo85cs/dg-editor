import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { MetricaPerf } from './tipos'

export interface BaselineArquivo {
  atualizadoEm: string
  metricas: Record<string, { limite: number; ultimoValor: number }>
}

export function caminhoBaseline(raiz: string): string {
  return join(raiz, 'qa-artifacts', 'baseline.json')
}

export function lerBaseline(raiz: string): BaselineArquivo | null {
  const p = caminhoBaseline(raiz)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as BaselineArquivo
  } catch {
    return null
  }
}

export function salvarBaseline(raiz: string, metricas: MetricaPerf[]): void {
  const dir = join(raiz, 'qa-artifacts')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const atual: BaselineArquivo = {
    atualizadoEm: new Date().toISOString(),
    metricas: {}
  }
  for (const m of metricas) {
    atual.metricas[m.id] = { limite: m.limite, ultimoValor: m.valor }
  }
  writeFileSync(caminhoBaseline(raiz), JSON.stringify(atual, null, 2), 'utf-8')
}

/** Compara com baseline; regressão se valor > limite * 1.3. */
export function aplicarBaseline(
  raiz: string,
  medidas: { id: string; valor: number; limitePadrao: number }[],
  atualizar: boolean
): { metricas: MetricaPerf[]; baselineCriada: boolean } {
  let base = lerBaseline(raiz)
  let baselineCriada = false
  if (!base || atualizar) {
    const metricas: MetricaPerf[] = medidas.map((m) => ({
      id: m.id,
      valor: m.valor,
      unidade: 'ms' as const,
      limite: m.limitePadrao,
      dentroDoLimite: m.valor <= m.limitePadrao
    }))
    salvarBaseline(raiz, metricas)
    baselineCriada = !base
    base = lerBaseline(raiz)
  }
  const metricas: MetricaPerf[] = medidas.map((m) => {
    const b = base?.metricas[m.id]
    const limite = b?.limite ?? m.limitePadrao
    const teto = limite * 1.3
    return {
      id: m.id,
      valor: m.valor,
      unidade: 'ms' as const,
      limite,
      dentroDoLimite: m.valor <= teto
    }
  })
  return { metricas, baselineCriada }
}

/** Mediana de 3 medições. */
export function mediana3(a: number, b: number, c: number): number {
  const s = [a, b, c].sort((x, y) => x - y)
  return s[1]
}
