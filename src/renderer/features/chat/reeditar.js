/**
 * Copiar prompt / reeditar mensagem do usuário (estilo Cursor).
 */

/**
 * @typedef {object} ReeditarCtx
 * @property {() => HTMLElement | null} [getArea]
 * @property {() => HTMLInputElement | HTMLTextAreaElement | null} [getInput]
 * @property {() => boolean} [emAndamento]
 * @property {() => Promise<void>} [parar]
 * @property {{ truncarAte?: (idx: number) => void } | null} [hist]
 * @property {(opts?: object) => void} [limparUi]
 * @property {() => void} [ativarChat]
 * @property {() => void} [marcarMsgs]
 * @property {(msg: string, tipo?: string) => void} [toast]
 */

/**
 * @param {HTMLElement} div
 * @param {string} role
 * @param {unknown} content
 * @param {ReeditarCtx} ctx
 */
export function ligarAcoesBolha(div, role, content, ctx) {
  const bruto = String(content ?? '')
  if (role === 'user') div.dataset.raw = bruto
  const toast = ctx.toast || (() => {})
  div.querySelectorAll('.msg-copy').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault()
      e.stopPropagation()
      const txt =
        role === 'user'
          ? String(div.dataset.raw || bruto || '').trim()
          : (() => {
              const body = btn.closest('.msg-body') || div
              const clone = body.cloneNode(true)
              clone.querySelectorAll('.msg-actions, .msg-copy, .msg-reedit').forEach((n) => n.remove())
              return String(clone.innerText || bruto || '').trim()
            })()
      try {
        await navigator.clipboard.writeText(txt)
        toast('Copiado', 'ok')
      } catch {
        toast('Não foi possível copiar', 'erro')
      }
    })
  })
  div.querySelectorAll('.msg-reedit').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      void reeditarMensagemUsuario(div, ctx)
    })
  })
}

/**
 * @param {HTMLElement} div
 * @param {ReeditarCtx} ctx
 */
export async function reeditarMensagemUsuario(div, ctx) {
  if (!(div instanceof HTMLElement) || !div.classList.contains('user')) return
  if (ctx.emAndamento?.()) {
    try {
      await ctx.parar?.()
    } catch {
      /* */
    }
  }
  const area = ctx.getArea?.() || document.getElementById('chat-messages')
  if (!area) return
  const msgs = [...area.querySelectorAll('.msg')]
  const idx = msgs.indexOf(div)
  if (idx < 0) return
  const raw = String(div.dataset.raw || div.querySelector('.msg-text')?.textContent || '').trim()
  for (let i = msgs.length - 1; i >= idx; i--) msgs[i].remove()
  ;[...area.children].forEach((n) => {
    if (
      n.classList?.contains('chat-tool-trace') ||
      n.classList?.contains('chat-work-card') ||
      n.classList?.contains('chat-parity-card') ||
      n.classList?.contains('dg-loading-bubble') ||
      n.classList?.contains('chat-work-stats')
    ) {
      n.remove()
    }
  })
  ctx.hist?.truncarAte?.(idx)
  ctx.limparUi?.({ limparCards: true, tituloFinal: '' })
  const input = ctx.getInput?.() || document.getElementById('chat-input')
  if (input) {
    input.value = raw
    input.focus()
    try {
      input.setSelectionRange(raw.length, raw.length)
    } catch {
      /* */
    }
  }
  ctx.ativarChat?.()
  ctx.marcarMsgs?.()
  ctx.toast?.('Edite o prompt e envie para continuar daqui', 'ok')
}
