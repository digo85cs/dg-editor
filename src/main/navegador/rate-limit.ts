/**
 * Rate limit em memória — janela deslizante 60s.
 * Geral: 120/min · /status: 600/min
 */
const WINDOW_MS = 60_000
const LIMITE_GERAL = 120
const LIMITE_STATUS = 600

/** key → timestamps de hits */
const hits = new Map<string, number[]>()

export function resetarRateLimit(): void {
  hits.clear()
}

function limparAntigos(arr: number[], agora: number): number[] {
  return arr.filter((t) => agora - t < WINDOW_MS)
}

/**
 * @returns null se OK; caso contrário retryAfterSec
 */
export function checarRateLimit(
  tokenKey: string,
  pathname: string
): { ok: true } | { ok: false; retryAfterSec: number } {
  const isStatus = pathname === '/status'
  const lim = isStatus ? LIMITE_STATUS : LIMITE_GERAL
  const key = tokenKey + (isStatus ? ':status' : ':geral')
  const agora = Date.now()
  let arr = limparAntigos(hits.get(key) || [], agora)
  if (arr.length >= lim) {
    const maisAntigo = arr[0] || agora
    const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - (agora - maisAntigo)) / 1000))
    hits.set(key, arr)
    return { ok: false, retryAfterSec }
  }
  arr.push(agora)
  hits.set(key, arr)
  // limpeza ocasional de keys ociosas
  if (hits.size > 64) {
    for (const [k, v] of hits) {
      const limpo = limparAntigos(v, agora)
      if (!limpo.length) hits.delete(k)
      else hits.set(k, limpo)
    }
  }
  return { ok: true }
}
