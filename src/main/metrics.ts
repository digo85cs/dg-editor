/**
 * Metricas leves para o orquestrador de agentes.
 * Registra duracao, sucesso/erro e timeouts por agente.
 * Persiste em .dg-editor/metrics.json para sobreviver a reinicializacoes.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { dglog } from './dglog'
import { resolverRaizProjeto } from './paths'

type RegistroAgente = {
  chamadas: number
  sucessos: number
  erros: number
  timeouts: number
  duracaoTotalMs: number
  duracaoMaxMs: number
}

const metricas: Map<string, RegistroAgente> = new Map()
let caminhoMetricas: string | null = null

function caminhoArquivo(raiz: string): string {
  return join(raiz, '.dg-editor', 'metrics.json')
}

function carregar(raiz: string): void {
  const arquivo = caminhoArquivo(raiz)
  if (!existsSync(arquivo)) return
  try {
    const dados = JSON.parse(readFileSync(arquivo, 'utf8')) as Record<string, RegistroAgente>
    for (const [agente, r] of Object.entries(dados)) {
      metricas.set(agente, r)
    }
  } catch { /* ignora, comeca do zero */ }
}

function salvar(raiz: string): void {
  const arquivo = caminhoArquivo(raiz)
  try {
    mkdirSync(join(raiz, '.dg-editor'), { recursive: true })
    const dados: Record<string, RegistroAgente> = {}
    for (const [agente, r] of metricas) {
      dados[agente] = r
    }
    writeFileSync(arquivo, JSON.stringify(dados, null, 2), 'utf8')
  } catch { /* ignora */ }
}

function obter(agente: string): RegistroAgente {
  let r = metricas.get(agente)
  if (!r) {
    r = { chamadas: 0, sucessos: 0, erros: 0, timeouts: 0, duracaoTotalMs: 0, duracaoMaxMs: 0 }
    metricas.set(agente, r)
  }
  return r
}

export function registrarMetricaAgente(
  raiz: string,
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
  salvar(raiz)
}

export function obterMetricasAgente(agente: string): RegistroAgente | undefined {
  return metricas.get(agente)
}

export function listarMetricasAgentes(): RegistroAgente[] {
  return Array.from(metricas.entries()).map(([agente, r]) => ({ agente, ...r }))
}

export function logResumoMetricas(raiz?: string): void {
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
  if (raiz) salvar(raiz)
}

export function resetarMetricas(): void {
  metricas.clear()
}

export function inicializarMetricas(raiz: string): void {
  caminhoMetricas = raiz
  carregar(raiz)
}
