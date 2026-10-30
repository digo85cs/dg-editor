/**
 * Pasta de trabalho OBRIGATÓRIA e permanente do DG Editor no Windows.
 * Cloud Agent (/workspace) espelha o git; no PC a raiz é sempre esta.
 */
export const RAIZ_WINDOWS_CANONICA = 'D:\\CURSOR\\DG Editor'

/** Branch que o PC sincroniza a partir do remoto (espelho do /workspace). */
export const BRANCH_TRABALHO = 'feat/vault-markdown'

export function ehRaizWindowsCanonica(caminho: string): boolean {
  const n = (caminho || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  return n === RAIZ_WINDOWS_CANONICA.toLowerCase()
}
