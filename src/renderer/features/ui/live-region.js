/**
 * Regiões aria-live persistentes no body. Anúncios passam por aqui para
 * funcionar mesmo quando o painel de chat está oculto.
 */

let timer = null
let ultimo = ''
let pendente = null

function alvoDe(urgencia) {
  const id = urgencia === 'assertivo' ? 'dg-live-alert' : 'dg-live-region'
  return document.getElementById(id)
}

/**
 * @param {string} texto
 * @param {{ urgencia?: 'educado' | 'assertivo' }} [opcoes]
 */
export function anunciar(texto, opcoes = {}) {
  const msg = String(texto || '').replace(/\s+/g, ' ').trim()
  if (!msg || msg === ultimo) return
  const el = alvoDe(opcoes.urgencia === 'assertivo' ? 'assertivo' : 'educado')
  if (!el) return
  // prioridade: escrita imediata para não ser engolida pelo debounce de stream.
  if (opcoes.prioridade) {
    clearTimeout(timer)
    pendente = null
    el.textContent = msg
    ultimo = msg
    return
  }
  clearTimeout(timer)
  pendente = { el, msg }
  el.textContent = ''
  timer = setTimeout(() => {
    if (!pendente) return
    pendente.el.textContent = pendente.msg
    ultimo = pendente.msg
    pendente = null
  }, 120)
}
