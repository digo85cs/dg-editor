/**
 * Fila serial de pedidos ao agente — evita duas execucoes concorrentes.
 * Suporta cancelamento do job atual + limpeza da fila.
 * Cada job tem timeout proprio: se travar, e rejeitado e a fila segue.
 * Fila eh por workspace (raiz) para nao serializar projetos distintos.
 */
import { aguardarRecursos } from '../guardian'

type Job = {
  id: string
  raiz: string
  run: (signal: AbortSignal) => Promise<unknown>
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
  controller: AbortController
}

// Fila separada por workspace (raiz).
const filasPorRaiz = new Map<string, { fila: Job[]; rodando: boolean; atual: Job | null }>()

const JOB_TIMEOUT_MS = 120_000 // 2 min: protege contra job que nunca resolve

function filaPara(raiz: string): { fila: Job[]; rodando: boolean; atual: Job | null } {
  let f = filasPorRaiz.get(raiz)
  if (!f) {
    f = { fila: [], rodando: false, atual: null }
    filasPorRaiz.set(raiz, f)
  }
  return f
}

export function statusFilaAgente(raiz?: string): {
  tamanho: number
  ocupado: boolean
  atualId: string | null
} {
  const f = raiz ? filaPara(raiz) : { fila: [], rodando: false, atual: null }
  if (!raiz) {
    // Quando nao informado, agrega todas as filas
    let tamanho = 0
    let ocupado = false
    let atualId: string | null = null
    for (const f2 of filasPorRaiz.values()) {
      tamanho += f2.fila.length
      if (f2.rodando) { ocupado = true; atualId = f2.atual?.id || null }
    }
    return { tamanho, ocupado, atualId }
  }
  return {
    tamanho: f.fila.length,
    ocupado: f.rodando,
    atualId: f.atual?.id || null
  }
}

export function enfileirarAgente<T>(
  raiz: string,
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const f = filaPara(raiz)
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController()
    const job: Job = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      raiz,
      run: run as (signal: AbortSignal) => Promise<unknown>,
      resolve: resolve as (v: unknown) => void,
      reject,
      controller
    }
    f.fila.push(job)
    void drenar(f)
  })
}

/** Cancela o job em execucao e rejeita todos os pendentes de uma raiz (ou de todas, se nao informado). */
export function cancelarFilaAgente(raiz?: string, motivo = 'cancelado pelo usuario'): {
  ok: boolean
  cancelados: number
} {
  let n = 0
  if (raiz) {
    const f = filaPara(raiz)
    if (f.atual) {
      f.atual.controller.abort()
      n++
    }
    while (f.fila.length) {
      const j = f.fila.shift()!
      j.controller.abort()
      j.reject(new Error(motivo))
      n++
    }
  } else {
    for (const f of filasPorRaiz.values()) {
      if (f.atual) {
        f.atual.controller.abort()
        n++
      }
      while (f.fila.length) {
        const j = f.fila.shift()!
        j.controller.abort()
        j.reject(new Error(motivo))
        n++
      }
    }
  }
  return { ok: true, cancelados: n }
}

async function drenar(f: { fila: Job[]; rodando: boolean; atual: Job | null }): Promise<void> {
  if (f.rodando) return
  f.rodando = true
  while (f.fila.length) {
    const job = f.fila.shift()!
    f.atual = job
    try {
      if (job.controller.signal.aborted) {
        job.reject(new Error('cancelado'))
      } else {
        try { await aguardarRecursos(2000) } catch { /* segue mesmo apertado */ }
        // Timeout proprio: se o job nunca resolve, rejeita e segue para o proximo.
        const promise = job.run(job.controller.signal)
        const timeout = new Promise<never>((_, reject) => {
          setTimeout(() => {
            job.controller.abort()
            reject(new Error('timeout: job nao respondeu em ' + Math.round(JOB_TIMEOUT_MS / 1000) + 's'))
          }, JOB_TIMEOUT_MS)
        })
        const r = await Promise.race([promise, timeout])
        job.resolve(r)
      }
    } catch (e) {
      job.reject(e)
    } finally {
      f.atual = null
    }
  }
  f.rodando = false
}
