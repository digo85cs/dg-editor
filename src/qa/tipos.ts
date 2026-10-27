/** Contrato do agente de QA / relatório de estabilidade. */

export type Severidade = 'ok' | 'warn' | 'erro'
export type StatusCorrecao = 'nao_aplicavel' | 'corrigido' | 'pendente_manual'

export interface ResultadoCenario {
  id: string
  area: 'ui' | 'ipc' | 'perf' | 'qualidade'
  titulo: string
  severidade: Severidade
  duracaoMs: number
  detalhe?: string
  erro?: string
  screenshot?: string
  corrigivel?: boolean
}

export interface MetricaPerf {
  id: string
  valor: number
  unidade: 'ms'
  limite: number
  dentroDoLimite: boolean
}

export interface CorrecaoAplicada {
  cenarioId: string
  descricao: string
  commit: string
  testeRegressao: string
  revertida?: boolean
  motivoReversao?: string
}

export interface RelatorioQA {
  geradoEm: string
  commit: string
  branch: string
  treeSujo: boolean
  totalCenarios: number
  porSeveridade: { ok: number; warn: number; erro: number }
  metricas: MetricaPerf[]
  resultados: ResultadoCenario[]
  correcoesAplicadas: CorrecaoAplicada[]
  pendentesManuais: ResultadoCenario[]
  avaliacaoGeral: 'estavel' | 'atencao' | 'instavel'
  avaliacaoDetalhe: string
}

export type SuiteNome = 'ipc' | 'e2e' | 'perf' | 'all'

export interface OpcoesQA {
  suite: SuiteNome
  atualizarBaseline?: boolean
  reportOnly?: boolean
  noE2e?: boolean
  outDir?: string
}
