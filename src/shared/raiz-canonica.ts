/**
 * Pasta de trabalho OBRIGATÓRIA e permanente do DG Editor.
 * O app roda SOMENTE local no Windows — sem depender de nuvem/espelho.
 */
export const RAIZ_WINDOWS_CANONICA = 'D:\\CURSOR\\DG Editor'

export function ehRaizWindowsCanonica(caminho: string): boolean {
  const n = (caminho || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  return n === RAIZ_WINDOWS_CANONICA.toLowerCase()
}
