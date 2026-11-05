import { freemem, totalmem, cpus } from 'os'
import { dglog } from './dglog'
import type { GuardianSnapshot } from '@shared/types'

const RAM_MINIMA_BYTES = 256 * 1024 * 1024
const CPU_MAX_LIMITE = 75

let prevTimes = cpus().map((c) => c.times)
let prevAt = Date.now()
let bloqueado = false

export function guardianSnapshot(): GuardianSnapshot {
  const free = freemem()
  const total = totalmem()
  const freePct = total > 0 ? Math.round((free / total) * 100) : 0

  const now = Date.now()
  const times = cpus().map((c) => c.times)
  let cpuPercent = 0
  const dt = now - prevAt
  if (dt > 0) {
    let idle = 0
    let totalT = 0
    for (let i = 0; i < times.length; i++) {
      const p = prevTimes[i] ?? times[i]
      idle += times[i].idle - p.idle
      totalT += (times[i].user - p.user) + (times[i].nice - p.nice) + (times[i].sys - p.sys) + (times[i].idle - p.idle) + (times[i].irq - p.irq)
    }
    cpuPercent = totalT > 0 ? Math.max(0, Math.min(100, Math.round(100 - (idle / totalT) * 100))) : 0
  }
  prevTimes = times
  prevAt = now

  const ramOk = free >= RAM_MINIMA_BYTES && cpuPercent < CPU_MAX_LIMITE
  if (!ramOk && !bloqueado) {
    bloqueado = true
    dglog('[guardian] recursos limitados - modo econômico')
  } else if (ramOk && bloqueado) {
    bloqueado = false
    dglog('[guardian] recursos liberados')
  }
  return { freeMemory: free, totalMemory: total, freePct, cpuPercent, ramOk, at: now }
}

export function guardianPodeOperar(): boolean {
  const s = guardianSnapshot()
  return s.ramOk
}

export function guardianResumo(): string {
  const s = guardianSnapshot()
  return 'RAM livre ' + Math.round(s.freeMemory / 1048576) + ' MB (' + s.freePct + '%) - CPU ' + s.cpuPercent + '%'
}

export function estaBloqueado() { return bloqueado }

/** Espera a RAM e a CPU voltarem ao limite. Se continuar apertado, a tarefa segue no modelo leve. */
export async function aguardarRecursos(maxMs = 8000): Promise<{ ok: boolean; motivo: string }> {
  const t0 = Date.now()
  let s = guardianSnapshot()
  if (s.ramOk) return { ok: true, motivo: '' }
  while (Date.now() - t0 < maxMs) {
    await new Promise((r) => setTimeout(r, 1000))
    s = guardianSnapshot()
    if (s.ramOk) return { ok: true, motivo: '' }
  }
  return {
    ok: false,
    motivo: 'RAM livre ' + Math.round(s.freeMemory / 1048576) + ' MB, CPU ' + s.cpuPercent + '%'
  }
}
