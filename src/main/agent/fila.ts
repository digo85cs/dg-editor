/**
 * Fila serial de pedidos ao agente — evita duas execuções concorrentes.
 */
type Job = {
  id: string
  run: () => Promise<unknown>
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
}

const fila: Job[] = []
let rodando = false

export function statusFilaAgente(): { tamanho: number; ocupado: boolean } {
  return { tamanho: fila.length, ocupado: rodando }
}

export function enfileirarAgente<T>(run: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    fila.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      run: run as () => Promise<unknown>,
      resolve: resolve as (v: unknown) => void,
      reject
    })
    void drenar()
  })
}

async function drenar(): Promise<void> {
  if (rodando) return
  rodando = true
  while (fila.length) {
    const job = fila.shift()!
    try {
      const r = await job.run()
      job.resolve(r)
    } catch (e) {
      job.reject(e)
    }
  }
  rodando = false
}
