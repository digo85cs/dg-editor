/** Texto do editor: quebra interna em \\n e gravação no fim de linha original. */

export function detectarFimDeLinha(texto) {
  return String(texto || '').includes('\r\n') ? '\r\n' : '\n'
}

export function paraDocumento(texto) {
  return String(texto || '').replace(/\r\n/g, '\n')
}

export function paraDisco(textoDoc, fim) {
  const t = String(textoDoc || '')
  return fim === '\r\n' ? t.replace(/\n/g, '\r\n') : t
}
