/**
 * Sanitizacao de argumentos IPC no preload.
 *
 * O preload NAO conhece as raizes autorizadas do workspace, entao nao pode
 * decidir se um caminho e legitimo. A barreira de seguranca fica no main
 * (`caminhoSeguro`, que valida contencao pelas pastas abertas). Aqui ficam
 * apenas checagens que nao dependem de contexto: tipo, tamanho e NUL.
 */

export const MAX_ARGS = 8
export const MAX_ARG_LEN = 200000
const MAX_CAMINHO_LEN = 1000

/** Argumento de canal de caminho: apenas sanidade estrutural. */
export function caminhoArgumentoValido(v: unknown): boolean {
  if (typeof v !== 'string') return false
  if (!v || v.length > MAX_CAMINHO_LEN) return false
  if (v.includes('\0')) return false
  return true
}

/** Limita quantidade e tamanho dos argumentos de um invoke. */
export function sanitizarArgs(args: unknown[]): unknown[] {
  if (args.length > MAX_ARGS) throw new Error('Demais argumentos para o canal')
  return args.map((a) => {
    if (typeof a === 'string' && a.length > MAX_ARG_LEN) {
      throw new Error('Argumento excede tamanho maximo permitido')
    }
    return a
  })
}
