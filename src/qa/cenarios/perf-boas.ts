import { mediana3 } from '../baseline'
import type { ResultadoCenario } from '../tipos'

function agoraMs(): number {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now()
}

export async function medirPerfBootless(): Promise<{
  resultados: ResultadoCenario[]
  medidas: { id: string; valor: number; limitePadrao: number; detalhe: string }[]
}> {
  const resultados: ResultadoCenario[] = []
  const medidas: { id: string; valor: number; limitePadrao: number; detalhe: string }[] = []

  function registrar(
    id: string,
    titulo: string,
    samples: number[],
    limitePadrao: number
  ): void {
    const bruto = mediana3(samples[0], samples[1], samples[2])
    // Inteiro ms; ops sub-ms viram 1 (nunca 0 no baseline)
    const med = bruto > 0 ? Math.max(1, Math.ceil(bruto)) : 0
    if (!(med > 0)) {
      resultados.push({
        id,
        area: 'perf',
        titulo,
        severidade: 'ok',
        duracaoMs: 0,
        detalhe: 'nao medido'
      })
      return
    }
    medidas.push({
      id,
      valor: med,
      limitePadrao,
      detalhe: 'amostras=' + samples.map((s) => Math.max(1, Math.ceil(s))).join(',')
    })
    resultados.push({
      id,
      area: 'perf',
      titulo,
      severidade: med <= limitePadrao * 1.3 ? 'ok' : 'warn',
      duracaoMs: med,
      detalhe: 'amostras=' + samples.map((s) => Math.max(1, Math.ceil(s))).join(',')
    })
  }

  // perf.shell.listar
  {
    const samples: number[] = []
    for (let i = 0; i < 3; i++) {
      const { limparCacheShell, listarShells } = await import('../../main/shell-detect')
      limparCacheShell()
      const t0 = agoraMs()
      listarShells()
      samples.push(agoraMs() - t0)
    }
    registrar('perf.shell.listar', 'listarShells mediana 3x', samples, 5000)
  }

  // perf.brain.provider
  {
    const samples: number[] = []
    for (let i = 0; i < 3; i++) {
      const { getBrain } = await import('../../main/brain/module')
      const t0 = agoraMs()
      getBrain().getActiveProvider()
      samples.push(agoraMs() - t0)
    }
    registrar('perf.brain.provider', 'getActiveProvider mediana 3x', samples, 50)
  }

  // perf.analise
  {
    const samples: number[] = []
    for (let i = 0; i < 3; i++) {
      const { getCachedAnalysis } = await import('../../main/analyzer')
      const t0 = agoraMs()
      getCachedAnalysis('Z:\\qa\\perf\\miss')
      samples.push(agoraMs() - t0)
    }
    registrar('perf.analise', 'analysis:cached miss mediana 3x', samples, 200)
  }

  // Placeholders E2E — nunca entram em medidas/baseline
  resultados.push({
    id: 'perf.boot',
    area: 'perf',
    titulo: 'perf.boot (UI) — medido no suite e2e quando disponivel',
    severidade: 'ok',
    duracaoMs: 0,
    detalhe: 'nao medido'
  })
  resultados.push({
    id: 'perf.terminal.abrir',
    area: 'perf',
    titulo: 'perf.terminal.abrir — medido no suite e2e quando disponivel',
    severidade: 'ok',
    duracaoMs: 0,
    detalhe: 'nao medido'
  })

  return { resultados, medidas }
}
