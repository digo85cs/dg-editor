/**
 * Perfil de hardware do PC: ajusta modelos Ollama locais e limites
 * automaticamente (online continua com prioridade na fila).
 */
import { cpus, freemem, totalmem } from 'os'
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { dglog } from './dglog'

export type HardwareTier = 'leve' | 'medio' | 'forte'

export type HardwareProfile = {
  totalRamGb: number
  freeRamGb: number
  cpuCores: number
  /** VRAM total da GPU dedicada em MB (0 = sem GPU dedicada ou nao medida) */
  vramMb: number
  /** true se a VRAM veio de medicao real (nvidia-smi/wmic); false = fallback */
  vramMedida: boolean
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

function executar(cmd: string, args: string[], timeoutMs: number): string | null {
  try {
    return execFileSync(cmd, args, { timeout: timeoutMs, windowsHide: true, encoding: 'utf8' })
  } catch {
    return null
  }
}

let vramCache: { vramMb: number; medido: boolean; fonte: string } | null = null

export function medirVramMb(): { vramMb: number; medido: boolean; fonte: string } {
  if (vramCache) return vramCache
  vramCache = medirVramMbReal()
  return vramCache
}

/** Teto de tamanho de modelo (em "b") pela VRAM e familia da tarefa.
 *  codigo: <4GB->3b | 4-7GB->7b | >=8GB->sem teto
 *  chat:   <8GB->3b  | >=8GB->sem teto (regra do dono: chat nunca passa de 3b em VRAM curta)
 */
export function tetoBPorVram(vramMb: number, familia: 'chat' | 'codigo' = 'codigo'): number {
  if (familia === 'chat') return vramMb >= 8192 ? 99 : 3
  if (vramMb >= 8192) return 99
  if (vramMb >= 4096) return 7
  return 3
}

/** Tamanho "b" do modelo pelo nome (qwen2.5-coder:7b, llama-3.3-70b). 0 = desconhecido. */
export function tamanhoModeloB(modelo: string): number {
  const m = String(modelo || '').match(/(\d+(?:\.\d+)?)b\b/i)
  return m ? parseFloat(m[1]) : 0
}

/** true se o modelo local excede o teto de VRAM para a familia da tarefa. */
export function modeloExcedeTetoVram(modelo: string, tarefa: string, vramMb?: number): boolean {
  const t = (tarefa || '').toLowerCase()
  const familia: 'chat' | 'codigo' =
    t === 'codigo' || t === 'revisao' || t === 'raciocinio' ? 'codigo' : 'chat'
  const vram = vramMb ?? lerHardwareProfile()?.vramMb ?? 0
  const cap = tetoBPorVram(vram, familia)
  const tam = tamanhoModeloB(modelo)
  return tam > 0 && tam > cap
}

function medirVramMbReal(): { vramMb: number; medido: boolean; fonte: string } {
  const smi = executar(
    'nvidia-smi',
    ['--query-gpu=memory.total', '--format=csv,noheader,nounits'],
    5000
  )
  if (smi) {
    const total = smi
      .split(/\r?\n/)
      .map((l) => parseInt(l.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0)
      .reduce((a, b) => a + b, 0)
    if (total > 0) return { vramMb: total, medido: true, fonte: 'nvidia-smi' }
  }
  const wmic = executar('wmic', ['path', 'win32_VideoController', 'get', 'AdapterRAM'], 8000)
  if (wmic) {
    const maior = wmic
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^\d+$/.test(l))
      .map((l) => Math.floor(parseInt(l, 10) / 1048576))
      .reduce((a, b) => Math.max(a, b), 0)
    if (maior > 0) return { vramMb: maior, medido: true, fonte: 'wmic AdapterRAM' }
  }
  return { vramMb: 0, medido: false, fonte: 'nenhuma' }
}

/** Modelo do teto para a familia — usado quando o escolhido excede a VRAM. */
export function modeloDoTeto(familia: 'chat' | 'codigo', vramMb: number): string {
  const cap = tetoBPorVram(vramMb, familia)
  if (familia === 'chat') return 'qwen2.5-coder:3b'
  if (cap >= 7) return 'qwen2.5-coder:7b'
  return 'qwen2.5-coder:3b'
}

export function calcularHardwareProfile(): HardwareProfile {
  const total = totalmem()
  const free = freemem()
  const cpuCores = Math.max(1, cpus().length)
  const totalRamGb = Math.round((total / (1024 ** 3)) * 10) / 10
  const freeRamGb = Math.round((free / (1024 ** 3)) * 10) / 10
  const vram = medirVramMb()
  if (!vram.medido) {
    dglog('[hardware] VRAM nao medida (nvidia-smi/wmic falharam) — assumindo teto <4GB')
  }

  let tier: HardwareTier = 'medio'
  if (totalRamGb < 8 || free < 2.5 * 1024 ** 3 || cpuCores <= 2) tier = 'leve'
  else if (totalRamGb >= 16 && free >= 4 * 1024 ** 3 && cpuCores >= 6) tier = 'forte'

  let base: Omit<HardwareProfile, 'vramMb' | 'vramMedida' | 'modeloChatLocal' | 'modeloCodigoLocal' | 'atualizadoEm'> & {
    modeloChatLocal: string
    modeloCodigoLocal: string
  }
  if (tier === 'leve') {
    base = {
      totalRamGb,
      freeRamGb,
      cpuCores,
      tier,
      modeloChatLocal: 'qwen2.5-coder:1.5b',
      modeloCodigoLocal: 'qwen2.5-coder:3b',
      numPredictChat: 700,
      numPredictCodigo: 700,
      timeoutChatMs: 120_000,
      timeoutCodigoMs: 180_000
    }
  } else if (tier === 'forte') {
    base = {
      totalRamGb,
      freeRamGb,
      cpuCores,
      tier,
      modeloChatLocal: 'qwen2.5-coder:3b',
      modeloCodigoLocal: 'qwen2.5-coder:7b',
      numPredictChat: 2048,
      numPredictCodigo: 2048,
      timeoutChatMs: 240_000,
      timeoutCodigoMs: 300_000
    }
  } else {
    base = {
      totalRamGb,
      freeRamGb,
      cpuCores,
      tier: 'medio',
      modeloChatLocal: 'qwen2.5-coder:3b',
      modeloCodigoLocal: 'qwen2.5-coder:7b',
      numPredictChat: 1600,
      numPredictCodigo: 1024,
      timeoutChatMs: 180_000,
      timeoutCodigoMs: 240_000
    }
  }

  // Teto por VRAM medida: modelo que nao cabe na GPU e rebaixado para o
  // maior que cabe (nunca por nome/marca — so o numero medido).
  const vramMb = vram.vramMb
  const modeloChat = tamanhoModeloB(base.modeloChatLocal) > tetoBPorVram(vramMb, 'chat')
    ? modeloDoTeto('chat', vramMb)
    : base.modeloChatLocal
  const modeloCodigo = tamanhoModeloB(base.modeloCodigoLocal) > tetoBPorVram(vramMb, 'codigo')
    ? modeloDoTeto('codigo', vramMb)
    : base.modeloCodigoLocal
  if (modeloChat !== base.modeloChatLocal || modeloCodigo !== base.modeloCodigoLocal) {
    dglog(
      '[hardware] teto VRAM=' + vramMb + 'MB (' + vram.fonte + '): chat ' +
      base.modeloChatLocal + '->' + modeloChat + ', codigo ' +
      base.modeloCodigoLocal + '->' + modeloCodigo
    )
  }

  return {
    ...base,
    vramMb,
    vramMedida: vram.medido,
    modeloChatLocal: modeloChat,
    modeloCodigoLocal: modeloCodigo,
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

/** Recalcula se ausente, sem vramMb (schema antigo) ou com mais de 12h. */
export function garantirHardwareProfile(forcar = false): HardwareProfile {
  const atual = lerHardwareProfile()
  const schemaAntigo = !atual || typeof atual.vramMb !== 'number'
  if (!forcar && atual?.atualizadoEm && !schemaAntigo) {
    const idade = Date.now() - Date.parse(atual.atualizadoEm)
    if (Number.isFinite(idade) && idade < 12 * 3600_000) return atual
  }
  if (schemaAntigo && atual) {
    dglog('[hardware] perfil antigo sem vramMb — recalculando com VRAM')
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
      novo.cpuCores +
      ' vram=' +
      novo.vramMb +
      'MB' +
      (novo.vramMedida ? '' : '(nao-medida)') +
      ' chat=' +
      novo.modeloChatLocal +
      ' codigo=' +
      novo.modeloCodigoLocal
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
