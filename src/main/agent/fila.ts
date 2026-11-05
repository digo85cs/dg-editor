/**
 * Fila serial de pedidos ao agente — evita duas execuções concorrentes.
 * Suporta cancelamento do job atual + limpeza da fila.
 */
import { aguardarRecursos } from '../guardian'

type Job = {
  id: string
  run: (signal: AbortSignal) => Promise<unknown>
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
  controller: AbortController
}

const fila: Job[] = []
let rodando = false
let atual: Job | null = null

export function statusFilaAgente(): {
  tamanho: number
  ocupado: boolean
  atualId: string | null
} {
  return {
    tamanho: fila.length,
    ocupado: rodando,
    atualId: atual?.id || null
  }
}

export function enfileirarAgente<T>(
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController()
    fila.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      run: run as (signal: AbortSignal) => Promise<unknown>,
      resolve: resolve as (v: unknown) => void,
      reject,
      controller
    })
    void drenar()
  })
}

/** Cancela o job em execução e rejeita todos os pendentes. */
export function cancelarFilaAgente(motivo = 'cancelado pelo usuario'): {
  ok: boolean
  cancelados: number
} {
  let n = 0
  if (atual) {
    atual.controller.abort()
    n++
  }
  while (fila.length) {
    const j = fila.shift()!
    j.controller.abort()
    j.reject(new Error(motivo))
    n++
  }
  return { ok: true, cancelados: n }
}

async function drenar(): Promise<void> {
  if (rodando) return
  rodando = true
  while (fila.length) {
    const job = fila.shift()!
    atual = job
    try {
      if (job.controller.signal.aborted) {
        job.reject(new Error('cancelado'))
      } else {
        try { await aguardarRecursos(2000) } catch { /* segue mesmo apertado */ }
        const r = await job.run(job.controller.signal)
        job.resolve(r)
      }
    } catch (e) {
      job.reject(e)
    } finally {
      atual = null
    }
  }
  rodando = false
}
