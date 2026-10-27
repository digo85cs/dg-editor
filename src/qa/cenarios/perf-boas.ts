import { mediana3 } from '../baseline'
import type { ResultadoCenario } from '../tipos'

export async function medirPerfBootless(): Promise<{
  resultados: ResultadoCenario[]
  medidas: { id: string; valor: number; limitePadrao: number; detalhe: string }[]
}> {
  const resultados: ResultadoCenario[] = []
  const medidas: { id: string; valor: number; limitePadrao: number; detalhe: string }[] = []

  // perf.shell.listar — proxy de "boot leve" sem Electron UI
  {
    const samples: number[] = []
    for (let i = 0; i < 3; i++) {
      const { limparCacheShell, listarShells } = await import('../../main/shell-detect')
      limparCacheShell()
      const t0 = Date.now()
      listarShells()
      samples.push(Date.now() - t0)
    }
    const med = mediana3(samples[0], samples[1], samples[2])
    medidas.push({
      id: 'perf.shell.listar',
      valor: med,
      limitePadrao: 5000,
      detalhe: 'amostras=' + samples.join(',')
    })
    resultados.push({
      id: 'perf.shell.listar',
      area: 'perf',
      titulo: 'listarShells mediana 3x',
      severidade: med <= 5000 * 1.3 ? 'ok' : 'warn',
      duracaoMs: med,
      detalhe: 'amostras=' + samples.join(',')
    })
  }

  // perf.brain.provider
  {
    const samples: number[] = []
    for (let i = 0; i < 3; i++) {
      const { getBrain } = await import('../../main/brain/module')
      const t0 = Date.now()
      getBrain().getActiveProvider()
      samples.push(Date.now() - t0)
    }
    const med = mediana3(samples[0], samples[1], samples[2])
    medidas.push({
      id: 'perf.brain.provider',
      valor: med,
      limitePadrao: 50,
      detalhe: 'amostras=' + samples.join(',')
    })
    resultados.push({
      id: 'perf.brain.provider',
      area: 'perf',
      titulo: 'getActiveProvider mediana 3x',
      severidade: 'ok',
      duracaoMs: med,
      detalhe: 'amostras=' + samples.join(',')
    })
  }

  // perf.analysis.cached miss
  {
    const samples: number[] = []
    for (let i = 0; i < 3; i++) {
      const { getCachedAnalysis } = await import('../../main/analyzer')
      const t0 = Date.now()
      getCachedAnalysis('Z:\\qa\\perf\\miss')
      samples.push(Date.now() - t0)
    }
    const med = mediana3(samples[0], samples[1], samples[2])
    medidas.push({
      id: 'perf.analise',
      valor: med,
      limitePadrao: 200,
      detalhe: 'amostras=' + samples.join(',')
    })
    resultados.push({
      id: 'perf.analise',
      area: 'perf',
      titulo: 'analysis:cached miss mediana 3x',
      severidade: med <= 200 * 1.3 ? 'ok' : 'warn',
      duracaoMs: med,
      detalhe: 'amostras=' + samples.join(',')
    })
  }

  // Placeholders documentados para métricas que exigem E2E (boot UI, terminal)
  resultados.push({
    id: 'perf.boot',
    area: 'perf',
    titulo: 'perf.boot (UI) — medido no suite e2e quando disponivel',
    severidade: 'ok',
    duracaoMs: 0,
    detalhe: 'placeholder; ver runner-e2e'
  })
  resultados.push({
    id: 'perf.terminal.abrir',
    area: 'perf',
    titulo: 'perf.terminal.abrir — medido no suite e2e quando disponivel',
    severidade: 'ok',
    duracaoMs: 0,
    detalhe: 'placeholder; ver runner-e2e'
  })

  return { resultados, medidas }
}
