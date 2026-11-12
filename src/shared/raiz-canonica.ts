/**
 * Preferencias de raiz no Windows.
 * Fonte da verdade em desenvolvimento neste PC: C:\\dev\\DGEditor
 * Legado D:\\CURSOR\\DG Editor ainda e reconhecido se existir.
 */
export const RAIZ_WINDOWS_DEV = 'C:\\dev\\DGEditor'
export const RAIZ_WINDOWS_LEGADO = 'D:\\CURSOR\\DG Editor'
/** Alias historico — preferir resolverRaizProjeto() em runtime. */
export const RAIZ_WINDOWS_CANONICA = RAIZ_WINDOWS_DEV

export function ehRaizWindowsCanonica(caminho: string): boolean {
  const n = (caminho || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  return (
    n === RAIZ_WINDOWS_DEV.toLowerCase() ||
    n === RAIZ_WINDOWS_LEGADO.toLowerCase()
  )
}
