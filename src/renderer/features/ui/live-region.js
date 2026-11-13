/**
 * Regiões aria-live persistentes no body. Anúncios passam por aqui para
 * funcionar mesmo quando o painel de chat está oculto.
 */

let timer = null
let ultimo = ''
let ultimoEm = 0
/** @type {{ msg: string, urgencia: 'educado' | 'assertivo' }[]} */
const fila = []

// Repetições seguidas (streaming) ficam silenciosas, mas a mesma etapa num
// novo turno volta a ser anunciada.
const JANELA_DEDUPE_MS = 4000
const ATRASO_MS = 120
// Cada mensagem fica visível por ao menos uma janela inteira antes da próxima:
// sem isso, com a fila cheia o texto seguinte era escrito no mesmo tick e o
// leitor de tela (ou o polling do QA) nunca via a etapa intermediária.
const PERMANENCIA_MS = 120
// Streaming pode enfileirar mais rápido que a fala do leitor: mantém só as
// mensagens mais recentes em vez de perder todas.
const MAX_FILA = 2

function alvoDe(urgencia) {
  const id = urgencia === 'assertivo' ? 'dg-live-alert' : 'dg-live-region'
  return document.getElementById(id)
}

function proximo() {
  if (timer || !fila.length) return
  const { msg, urgencia } = fila.shift()
  const el = alvoDe(urgencia)
  if (!el) {
    fila.length = 0
    return
  }
  el.textContent = ''
  timer = setTimeout(() => {
    el.textContent = msg
    ultimo = msg
    ultimoEm = Date.now()
    timer = setTimeout(() => {
      timer = null
      proximo()
    }, PERMANENCIA_MS)
  }, ATRASO_MS)
}

/**
 * @param {string} texto
 * @param {{ urgencia?: 'educado' | 'assertivo' }} [opcoes]
 */
export function anunciar(texto, opcoes = {}) {
  const msg = String(texto || '').replace(/\s+/g, ' ').trim()
  if (!msg) return
  if (msg === ultimo && Date.now() - ultimoEm < JANELA_DEDUPE_MS) return
  if (fila.some((f) => f.msg === msg)) return
  fila.push({ msg, urgencia: opcoes.urgencia === 'assertivo' ? 'assertivo' : 'educado' })
  while (fila.length > MAX_FILA) fila.shift()
  proximo()
}
