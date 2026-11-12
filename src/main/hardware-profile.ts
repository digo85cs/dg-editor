/**
 * Perfil de hardware do PC: ajusta modelos Ollama locais e limites
 * automaticamente (online continua com prioridade na fila).
 */
import { cpus, freemem, totalmem } from 'os'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { dglog } from './dglog'

export type HardwareTier = 'leve' | 'medio' | 'forte'

export type HardwareProfile = {
  totalRamGb: number
  freeRamGb: number
  cpuCores: number
  tier: HardwareTier
  modeloChatLocal: string
  modeloCodigoLocal: string
  numPredictChat: number
  numPredictCodigo: number
  timeoutChatMs: number
  timeoutCodigoMs: number
  atualizadoEm: string
}

function arquivoPerfil(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'hardware-profile.json')
}

export function calcularHardwareProfile(): HardwareProfile {
  const total = totalmem()
  const free = freemem()
  const cpuCores = Math.max(1, cpus().length)
  const totalRamGb = Math.round((total / (1024 ** 3)) * 10) / 10
  const freeRamGb = Math.round((free / (1024 ** 3)) * 10) / 10

  let tier: HardwareTier = 'medio'
  if (totalRamGb < 8 || free < 2.5 * 1024 ** 3 || cpuCores <= 2) tier = 'leve'
  else if (totalRamGb >= 16 && free >= 4 * 1024 ** 3 && cpuCores >= 6) tier = 'forte'

  if (tier === 'leve') {
    return {
      totalRamGb,
      freeRamGb,
      cpuCores,
      tier,
      modeloChatLocal: 'qwen2.5-coder:1.5b',
      modeloCodigoLocal: 'qwen2.5-coder:3b',
      numPredictChat: 700,
      numPredictCodigo: 700,
      timeoutChatMs: 120_000,
      timeoutCodigoMs: 180_000,
      atualizadoEm: new Date().toISOString()
    }
  }
  if (tier === 'forte') {
    return {
      totalRamGb,
      freeRamGb,
      cpuCores,
      tier,
      modeloChatLocal: 'qwen2.5-coder:3b',
      modeloCodigoLocal: 'qwen2.5-coder:7b',
      numPredictChat: 2048,
      numPredictCodigo: 2048,
      timeoutChatMs: 240_000,
      timeoutCodigoMs: 300_000,
      atualizadoEm: new Date().toISOString()
    }
  }
  return {
    totalRamGb,
    freeRamGb,
    cpuCores,
    tier: 'medio',
    modeloChatLocal: 'qwen2.5-coder:3b',
    modeloCodigoLocal: 'qwen2.5-coder:7b',
    numPredictChat: 1600,
    numPredictCodigo: 1024,
    timeoutChatMs: 180_000,
    timeoutCodigoMs: 240_000,
    atualizadoEm: new Date().toISOString()
  }
}

export function salvarHardwareProfile(perfil?: HardwareProfile): HardwareProfile {
  const p = perfil || calcularHardwareProfile()
  try {
    writeFileSync(arquivoPerfil(), JSON.stringify(p, null, 2), 'utf8')
  } catch (e) {
    dglog('[hardware] falha ao gravar perfil: ' + String(e))
  }
  return p
}

export function lerHardwareProfile(): HardwareProfile | null {
  try {
    const p = arquivoPerfil()
    if (!existsSync(p)) return null
    return JSON.parse(readFileSync(p, 'utf8')) as HardwareProfile
  } catch {
    return null
  }
}

/** Recalcula se ausente ou com mais de 12h. */
export function garantirHardwareProfile(forcar = false): HardwareProfile {
  const atual = lerHardwareProfile()
  if (!forcar && atual?.atualizadoEm) {
    const idade = Date.now() - Date.parse(atual.atualizadoEm)
    if (Number.isFinite(idade) && idade < 12 * 3600_000) return atual
  }
  const novo = salvarHardwareProfile()
  dglog(
    '[hardware] tier=' +
      novo.tier +
      ' ram=' +
      novo.totalRamGb +
      'G livre=' +
      novo.freeRamGb +
      'G cores=' +
      novo.cpuCores
  )
  return novo
}

export function limitesPorHardware(tarefa: string): { num_predict: number; timeoutMs: number } | null {
  const p = lerHardwareProfile() || calcularHardwareProfile()
  const t = (tarefa || '').toLowerCase()
  if (t === 'chat-rapido') {
    return {
      num_predict: Math.min(700, p.numPredictChat),
      timeoutMs: Math.min(120_000, p.timeoutChatMs)
    }
  }
  if (t === 'chat' || t === 'analise' || t === 'analisar') {
    return { num_predict: p.numPredictChat, timeoutMs: p.timeoutChatMs }
  }
  if (t === 'codigo' || t === 'revisao' || t === 'raciocinio') {
    return { num_predict: p.numPredictCodigo, timeoutMs: p.timeoutCodigoMs }
  }
  return null
}

export function modeloLocalSugerido(tarefa: string): string {
  const p = lerHardwareProfile() || calcularHardwareProfile()
  const t = (tarefa || '').toLowerCase()
  if (t === 'codigo' || t === 'revisao' || t === 'raciocinio') return p.modeloCodigoLocal
  return p.modeloChatLocal
}
