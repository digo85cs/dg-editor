/**
 * Roteador de cota em cascata (FASE 2).
 * Estado persistido em <userData>/cota-modelos.json.
 * Nunca lança exceções em proximoDisponivel; arquivo corrompido é regenerado vazio.
 * Comentários/logs em pt-BR; identificadores técnicos em inglês.
 */
import { BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { dglog } from '../dglog'
import {
  appendFailoverLog,
  normalizarTarefa,
} from './registry'
import type { ProviderConfig } from './providers'
import { filaGlobal, configParaProvider, type ProviderDescriptor, obterProvider } from './providers-registry'
import { chaveConfigurada } from './segredos-providers'
import { userDataDir } from '../paths'

const VERSAO = 2
function arquivoCota(): string {
  return join(userDataDir(), 'cota-modelos.json')
}
const DIA_MS = 24 * 60 * 60 * 1000
const RAIZ = process.env.DG_ROOT || process.cwd()

export type MotivoCota = 'rate_limit' | 'quota' | 'auth' | 'erro'

export interface EntradaCota {
  providerId: string
  modelo: string
  esgotadoAte: string
  motivo: MotivoCota
  ocorrencias: number
}

export interface GastoPorProvider {
  providerId: string
  usd: number
}

export interface EstadoCota {
  versao: number
  permitirPago: boolean
  tetoDiarioUSD?: number
  gastoHojeUSD: number
  gastoPorProvider: Record<string, number>
  entradas: EntradaCota[]
}

let estadoCache: EstadoCota | null = null

/** Providers que consumiram tokens mas nao tem preco conhecido (rastreado apenas em memoria, nao persistido). */
const naoRastreadosSet = new Set<string>()

/** Providers ja logados como "nao rastreado" nesta sessao (para nao poluir logs). */
const naoRastreadosLogadoSet = new Set<string>()

function lerEstado(): EstadoCota {
  if (estadoCache) return estadoCache
  if (!existsSync(arquivoCota())) {
    estadoCache = { versao: VERSAO, permitirPago: false, tetoDiarioUSD: undefined, gastoHojeUSD: 0, gastoPorProvider: {}, entradas: [] }
    return estadoCache
  }
  try {
    const j = JSON.parse(readFileSync(arquivoCota(), 'utf-8')) as EstadoCota
    if (!j || typeof j !== 'object' || !Array.isArray(j.entradas)) throw new Error('estado invalido')
    // Migracao v1 -> v2
    if (j.versao === 1) {
      estadoCache = {
        versao: VERSAO,
        permitirPago: false,
        tetoDiarioUSD: undefined,
        gastoHojeUSD: 0,
        gastoPorProvider: {},
        entradas: j.entradas,
      }
      salvarEstado(estadoCache)
      return estadoCache
    }
    estadoCache = {
      versao: j.versao ?? VERSAO,
      permitirPago: j.permitirPago ?? false,
      tetoDiarioUSD: j.tetoDiarioUSD,
      gastoHojeUSD: j.gastoHojeUSD ?? 0,
      gastoPorProvider: j.gastoPorProvider || {},
      entradas: j.entradas,
    }
    return estadoCache
  } catch (e) {
    dglog('[roteador-cota] arquivo corrompido, regenerando vazio: ' + String((e as Error)?.message || e))
    estadoCache = { versao: VERSAO, permitirPago: false, tetoDiarioUSD: undefined, gastoHojeUSD: 0, gastoPorProvider: {}, entradas: [] }
    return estadoCache
  }
}

function salvarEstado(estado: EstadoCota): void {
  try {
    const dir = userDataDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(arquivoCota(), JSON.stringify(estado, null, 2), 'utf-8')
  } catch (e) {
    dglog('[roteador-cota] falha ao salvar estado de cota: ' + String((e as Error)?.message || e))
  }
}

function invalidaCache(): void {
  estadoCache = null
}

/** Próxima meia-noite no fuso IANA informado (usa Intl.DateTimeFormat, sem libs externas). */
function proximaMeiaNoiteFuso(fuso: string, agora: Date): Date {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(agora)
  const comp: Record<string, number> = {}
  for (const p of partes) if (p.type !== 'literal') comp[p.type] = Number(p.value)
  // offset do fuso em relacao ao UTC, no instante de agora (local = utc + offset)
  const naiveLocalComoUtc = Date.UTC(comp.year, comp.month - 1, comp.day, comp.hour, comp.minute, comp.second)
  const offset = naiveLocalComoUtc - agora.getTime()
  // meia-noite do dia seguinte no relogio local do fuso, expressa como instante
  const alvoLocal = Date.UTC(comp.year, comp.month - 1, comp.day + 1, 0, 0, 0, 0)
  return new Date(alvoLocal - offset)
}

function proximaMeiaNoiteUTC(agora: Date): Date {
  const d = new Date(agora.getTime())
  d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function calcularReset(fusoReset: string | undefined, retryAfterSegundos: number | undefined, agora: Date): Date {
  if (typeof retryAfterSegundos === 'number' && Number.isFinite(retryAfterSegundos)) {
    return new Date(agora.getTime() + Math.min(retryAfterSegundos * 1000, DIA_MS))
  }
  if (fusoReset && fusoReset.toLowerCase() !== 'utc') {
    try { return proximaMeiaNoiteFuso(fusoReset, agora) } catch { /* fallback UTC */ }
  }
  return proximaMeiaNoiteUTC(agora)
}

function entradaIndex(estado: EstadoCota, providerId: string, modelo: string): number {
  return estado.entradas.findIndex((e) => e.providerId === providerId && e.modelo === modelo)
}

export function estaEsgotado(providerId: string, modelo: string, agora: Date = new Date()): boolean {
  const estado = lerEstado()
  const i = entradaIndex(estado, providerId, modelo)
  if (i < 0) return false
  return new Date(estado.entradas[i].esgotadoAte).getTime() > agora.getTime()
}

export function marcarEsgotado(
  providerId: string,
  modelo: string,
  motivo: MotivoCota,
  retryAfterSegundos?: number,
  agora: Date = new Date()
): void {
  const p = obterProvider(providerId)
  const fusoReset = p?.fusoReset
  const estado = lerEstado()
  const i = entradaIndex(estado, providerId, modelo)
  const esgotadoAte = calcularReset(fusoReset, retryAfterSegundos, agora).toISOString()
  const entrada: EntradaCota = { providerId, modelo, esgotadoAte, motivo, ocorrencias: 1 }
  if (i >= 0) {
    const anterior = estado.entradas[i]
    entrada.ocorrencias = anterior.ocorrencias + 1
    estado.entradas[i] = entrada
  } else {
    estado.entradas.push(entrada)
  }
  invalidaCache()
  salvarEstado(estado)
  emitirEventoCota()
  dglog('[roteador-cota] esgotado provider=' + providerId + ' modelo=' + modelo + ' motivo=' + motivo + ' ate=' + esgotadoAte)
}

export function limparExpirados(agora: Date = new Date()): number {
  const estado = lerEstado()
  const antes = estado.entradas.length
  estado.entradas = estado.entradas.filter((e) => new Date(e.esgotadoAte).getTime() > agora.getTime())
  const removidos = antes - estado.entradas.length
  if (removidos > 0) {
    invalidaCache()
    salvarEstado(estado)
    emitirEventoCota()
    dglog('[roteador-cota] cotas expiradas removidas: ' + removidos)
  }
  return removidos
}

export function statusCotas(): EntradaCota[] {
  return [...lerEstado().entradas]
}

export function resetarProvider(providerId: string): void {
  const estado = lerEstado()
  estado.entradas = estado.entradas.filter((e) => e.providerId !== providerId)
  invalidaCache()
  salvarEstado(estado)
  emitirEventoCota()
}

export function permitirPagoAtivo(): boolean {
  return lerEstado().permitirPago === true
}

export function definirPermitirPago(v: boolean): void {
  const estado = lerEstado()
  estado.permitirPago = v === true
  invalidaCache()
  salvarEstado(estado)
  emitirEventoCota()
  dglog('[roteador-cota] permitirPago=' + estado.permitirPago)
}

export function definirTetoDiarioUSD(teto: number | undefined): void {
  const estado = lerEstado()
  estado.tetoDiarioUSD = teto
  invalidaCache()
  salvarEstado(estado)
  emitirEventoCota()
  dglog('[roteador-cota] tetoDiarioUSD=' + String(teto))
}

export function registrarCusto(
  providerId: string,
  tokensEntrada: number,
  tokensSaida: number,
  agora: Date = new Date()
): void {
  const p = obterProvider(providerId)
  if (!p?.preco) {
    if (!naoRastreadosLogadoSet.has(providerId)) {
      naoRastreadosLogadoSet.add(providerId)
      dglog('[roteador-cota] custo nao rastreado: ' + providerId)
    }
    naoRastreadosSet.add(providerId)
    return
  }
  const preco = p.preco
  const custo = (tokensEntrada / 1_000_000) * preco.entradaPor1M + (tokensSaida / 1_000_000) * preco.saidaPor1M
  if (!Number.isFinite(custo) || custo < 0) return

  const estado = lerEstado()
  estado.gastoHojeUSD += custo
  const jaTinha = estado.gastoPorProvider ? estado.gastoPorProvider[providerId] : undefined
  if (!estado.gastoPorProvider) estado.gastoPorProvider = {}
  estado.gastoPorProvider[providerId] = (jaTinha || 0) + custo

  // Se bateu o teto, marca esgotado ate o reset com motivo quota
  const teto = estado.tetoDiarioUSD
  if (typeof teto === 'number' && estado.gastoHojeUSD >= teto) {
    const modelo = p.modelos[0]?.id || ''
    marcarEsgotado(providerId, modelo, 'quota', undefined, agora)
  }

  invalidaCache()
  salvarEstado(estado)
  emitirEventoCota()
  dglog('[roteador-cota] custo provider=' + providerId + ' usd=' + custo.toFixed(6) + ' hoje=' + estado.gastoHojeUSD.toFixed(6))
}

export function gastoHoje(): { usd: number; teto?: number; porProvider: Record<string, number>; naoRastreados: string[] } {
  const estado = lerEstado()
  return {
    usd: estado.gastoHojeUSD,
    teto: estado.tetoDiarioUSD,
    porProvider: estado.gastoPorProvider || {},
    naoRastreados: [...naoRastreadosSet],
  }
}

/** Retorna true se o provider tem preco definido (custo sera rastreado). */
export function precoConhecido(providerId: string): boolean {
  const p = obterProvider(providerId)
  return !!p?.preco
}

export function proximoDisponivel(
  tarefa: string,
  opts: { ignorarIds?: string[] } = {}
): ProviderConfig | null {
  let agora: Date
  try { limparExpirados() } catch { /* nao bloqueia */ }
  agora = new Date()
  const ignorar = new Set(opts.ignorarIds || [])

  for (const p of filaGlobal()) {
    if (ignorar.has(p.id)) continue
    const modelo = p.modelos[0]?.id || ''
    if (!modelo) continue
    // Guardrail de custo: tier 2 (pago) so e usado se permitirPago estiver ligado
    if (p.tier === 2 && !permitirPagoAtivo()) continue
    // compatibilidade de tarefa por capacidades
    const caps = new Set<string>()
    for (const m of p.modelos) for (const c of m.capacidades) caps.add(c)
    if (!compatComTarefa(tarefa, [...caps])) continue
    // ollama-local e' o piso: nao exige chave
    if (p.id !== 'ollama-local' && !chaveConfigurada(p.id)) continue
    if (estaEsgotado(p.id, modelo, agora)) continue
    return configParaProvider(p, modelo)
  }

  // Piso garantido: ollama-local.
  const ollama = obterProvider('ollama-local')
  if (ollama) {
    try {
      const semPago = !permitirPagoAtivo()
      appendFailoverLog(RAIZ, {
        tarefa,
        tentou: semPago ? 'todos-tier-1-esgotados-guardrail' : 'todos-providers-esgotados',
        motivo: semPago ? 'tier-2-bloqueado-por-guardrail' : 'piso-ollama-local',
        resultado: 'pulado',
      })
      if (semPago) {
        dglog('[roteador-cota] tier 2 bloqueado por guardrail; usando piso ollama-local')
      }
    } catch { /* */ }
    return configParaProvider(ollama, ollama.modelos[0]?.id || 'qwen2.5-coder:7b')
  }
  return null
}

function compatComTarefa(tarefa: string, caps: string[]): boolean {
  const t = normalizarTarefa(tarefa)
  const tem = (c: string) => caps.includes(c)
  switch (t) {
    case 'codigo': return tem('codigo') || tem('chat')
    case 'analise':
    case 'analisar': return tem('analise') || tem('completo')
    case 'chat':
    case 'chat-rapido': return tem('chat')
    case 'raciocinio': return tem('raciocinio') || tem('analise')
    case 'revisao': return tem('analise') || tem('chat')
    default: return true
  }
}

/** Emite observabilidade de cotas para janelas renderer (canal brain:cota). */
export function emitirEventoCota(): void {
  try {
    const payload = { status: statusCotas(), gasto: gastoHoje() }
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        w.webContents.send('brain:cota', payload)
      }
    }
  } catch { /* renderer indisponível ou sem janelas */ }
}

/** Apenas testes: limpa cache, arquivo de estado e sets de naoRastreados. */
export function __resetarEstadoParaTestes(): void {
  estadoCache = null
  naoRastreadosSet.clear()
  naoRastreadosLogadoSet.clear()
  try {
    if (existsSync(arquivoCota())) unlinkSync(arquivoCota())
  } catch { /* */ }
}
