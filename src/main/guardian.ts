import { freemem, totalmem, cpus } from 'os'
import { dglog } from './dglog'
import type { GuardianSnapshot } from '@shared/types'

// Guardiao de recursos (regra 9 do dono): o app se auto-regula.
// RAM livre minima pra operacoes pesadas (analise IA): 800 MB
const RAM_MINIMA_BYTES = 800 * 1024 * 1024

let prevTimes = cpus().map((c) => c.times)
let prevAt = Date.now()

export function guardianSnapshot(): GuardianSnapshot {
  const free = freemem()
  const total = totalmem()
  const freePct = total > 0 ? Math.round((free / total) * 100) : 0

  // CPU: delta dos times entre chamadas (Windows nao tem loadavg confiavel)
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

  const ramOk = free >= RAM_MINIMA_BYTES
  return { freeMemory: free, totalMemory: total, freePct, cpuPercent, ramOk, at: now }
}

export function guardianPodeOperar(): boolean {
  const s = guardianSnapshot()
  if (!s.ramOk) {
    dglog('[guardian] RAM livre baixa (' + Math.round(s.freeMemory / 1048576) + ' MB) - operacao pesada recusada')
  }
  return s.ramOk
}

export function guardianResumo(): string {
  const s = guardianSnapshot()
  return 'RAM livre ' + Math.round(s.freeMemory / 1048576) + ' MB (' + s.freePct + '%) - CPU ' + s.cpuPercent + '%'
}
