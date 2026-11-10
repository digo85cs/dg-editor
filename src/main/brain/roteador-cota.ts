/**
 * Roteador de cota em cascata (FASE 2).
 * Estado persistido em <userData>/cota-modelos.json.
 * Nunca lança exceções em proximoDisponivel; arquivo corrompido é regenerado vazio.
 * Comentários/logs em pt-BR; identificadores técnicos em inglês.
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { dglog } from '../dglog'
import { BrowserWindow } from 'electron'
import {
  appendFailoverLog,
  normalizarTarefa,
} from './registry'
import type { ProviderConfig } from './providers'
import { filaGlobal, configParaProvider, type ProviderDescriptor, obterProvider } from './providers-registry'
import { chaveConfigurada } from './segredos-providers'

const ARQUIVO = join(app.getPath('userData'), 'cota-modelos.json')
const VERSAO = 1
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

interface EstadoCota {
  versao: number
  entradas: EntradaCota[]
}

let estadoCache: EstadoCota | null = null

function lerEstado(): EstadoCota {
  if (estadoCache) return estadoCache
  if (!existsSync(ARQUIVO)) {
    estadoCache = { versao: VERSAO, entradas: [] }
    return estadoCache
  }
  try {
    const j = JSON.parse(readFileSync(ARQUIVO, 'utf-8')) as EstadoCota
    if (!j || typeof j !== 'object' || !Array.isArray(j.entradas)) throw new Error('estado invalido')
    estadoCache = { versao: j.versao ?? VERSAO, entradas: j.entradas }
    return estadoCache
  } catch (e) {
    dglog('[roteador-cota] arquivo corrompido, regenerando vazio: ' + String((e as Error)?.message || e))
    estadoCache = { versao: VERSAO, entradas: [] }
    return estadoCache
  }
}

function salvarEstado(estado: EstadoCota): void {
  try {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(ARQUIVO, JSON.stringify(estado, null, 2), 'utf-8')
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
      appendFailoverLog(RAIZ, {
        tarefa,
        tentou: 'todos-providers-esgotados',
        motivo: 'piso-ollama-local',
        resultado: 'pulado',
      })
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
    const status = statusCotas()
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        w.webContents.send('brain:cota', { status })
      }
    }
  } catch { /* renderer indisponível ou sem janelas */ }
}

/** Apenas testes: limpa cache e arquivo de estado. */
export function __resetarEstadoParaTestes(): void {
  estadoCache = null
  try {
    if (existsSync(ARQUIVO)) unlinkSync(ARQUIVO)
  } catch { /* */ }
}
