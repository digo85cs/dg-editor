/**
 * Diálogos no tema DG Editor (substitui alert/confirm nativos).
 */
import { criarFocusTrap } from '../../utils/focus-trap.js'

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * @param {{ title?: string, message: string, detail?: string, type?: 'info'|'warning'|'question'|'error', buttons?: string[], defaultId?: number, cancelId?: number }} opts
 * @returns {Promise<number>} índice do botão
 */
export function dgDialog(opts) {
  return new Promise((resolve) => {
    const buttons = Array.isArray(opts.buttons) && opts.buttons.length ? opts.buttons : ['OK']
    const defaultId = Number.isFinite(opts.defaultId) ? opts.defaultId : 0
    const cancelId = Number.isFinite(opts.cancelId) ? opts.cancelId : buttons.length - 1
    const tipo = opts.type || 'question'
    const focoAnterior = document.activeElement

    const overlay = document.createElement('div')
    overlay.className = 'dg-dialog-overlay'
    overlay.setAttribute('role', 'presentation')

    const box = document.createElement('div')
    box.className = 'dg-dialog-box dg-dialog--' + tipo
    box.setAttribute('role', 'alertdialog')
    box.setAttribute('aria-modal', 'true')
    box.setAttribute('aria-labelledby', 'dg-dialog-title')
    box.setAttribute('aria-describedby', 'dg-dialog-msg')

    const head = document.createElement('div')
    head.className = 'dg-dialog-head'
    const title = document.createElement('h3')
    title.id = 'dg-dialog-title'
    title.textContent = opts.title || 'DG Editor'
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'btn-icon dg-dialog-close'
    close.setAttribute('aria-label', 'Fechar')
    close.innerHTML = '<svg viewBox="0 0 10 10" width="10" height="10"><path d="M2 2l6 6M8 2l-6 6" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>'
    head.appendChild(title)
    head.appendChild(close)

    const body = document.createElement('div')
    body.className = 'dg-dialog-body'
    const icon = document.createElement('div')
    icon.className = 'dg-dialog-icon'
    icon.setAttribute('aria-hidden', 'true')
    icon.textContent = tipo === 'warning' || tipo === 'error' ? '!' : '?'
    const texts = document.createElement('div')
    texts.className = 'dg-dialog-texts'
    const msg = document.createElement('p')
    msg.id = 'dg-dialog-msg'
    msg.className = 'dg-dialog-message'
    msg.textContent = opts.message || ''
    texts.appendChild(msg)
    if (opts.detail) {
      const det = document.createElement('p')
      det.className = 'dg-dialog-detail muted'
      det.textContent = opts.detail
      texts.appendChild(det)
    }
    body.appendChild(icon)
    body.appendChild(texts)

    const foot = document.createElement('div')
    foot.className = 'dg-dialog-foot'
    let trap = null
    const finish = (idx) => {
      document.removeEventListener('keydown', onKey, true)
      trap?.destroy()
      overlay.remove()
      resolve(idx)
    }
    buttons.forEach((label, i) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = i === defaultId ? 'btn-small chat-parity-primary' : 'btn-small'
      btn.textContent = label
      btn.addEventListener('click', () => finish(i))
      foot.appendChild(btn)
    })

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        finish(cancelId)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        finish(defaultId)
      }
    }
    close.addEventListener('click', () => finish(cancelId))
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(cancelId)
    })
    document.addEventListener('keydown', onKey, true)

    box.appendChild(head)
    box.appendChild(body)
    box.appendChild(foot)
    overlay.appendChild(box)
    document.body.appendChild(overlay)
    const focusBtn = foot.querySelectorAll('button')[defaultId] || foot.querySelector('button')
    focusBtn?.focus()
    trap = criarFocusTrap(overlay, { anterior: focoAnterior })
  })
}

export function dgAlert(message, title) {
  return dgDialog({
    title: title || 'DG Editor',
    message: String(message || ''),
    type: 'info',
    buttons: ['OK'],
    defaultId: 0,
    cancelId: 0
  })
}

export function dgConfirm(message, title) {
  return dgDialog({
    title: title || 'Confirmar',
    message: String(message || ''),
    type: 'question',
    buttons: ['Continuar', 'Cancelar'],
    defaultId: 0,
    cancelId: 1
  }).then((i) => i === 0)
}

export function ligarDialogosDoMain() {
  if (!window.api?.on) return
  window.api.on('ui:dialog-pedir', async (_e, payload) => {
    const p = payload || {}
    const response = await dgDialog({
      title: p.title,
      message: p.message,
      detail: p.detail,
      type: p.type || 'question',
      buttons: p.buttons,
      defaultId: p.defaultId,
      cancelId: p.cancelId
    })
    try {
      await window.api.invoke('ui:dialog-responder', { id: p.id, response })
    } catch {
      /* */
    }
  })
}
