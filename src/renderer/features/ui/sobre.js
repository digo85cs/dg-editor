/**
 * Modal Sobre do DG Editor — versão, Update e links de status.
 */

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function logoSrc() {
  const existing = document.querySelector('#titlebar img.tb-logo, #titlebar img.tb-logo--wide, img.tb-logo')
  if (existing && existing.getAttribute('src')) return existing.getAttribute('src')
  return '../../resources/logo-wide-tb.png'
}

/**
 * @param {{ onUpdate?: () => Promise<void>|void }} [opts]
 */
export async function abrirSobreDgEditor(opts = {}) {
  let ver = ''
  let st = null
  try {
    ver =
      (await window.api.getVersion?.()) ||
      (await window.api.invoke('app:get-version')) ||
      ''
  } catch {
    ver = ''
  }
  try {
    st = await window.api.invoke('update:status')
  } catch {
    st = null
  }

  const existente = document.getElementById('dg-sobre-overlay')
  if (existente) existente.remove()

  const overlay = document.createElement('div')
  overlay.id = 'dg-sobre-overlay'
  overlay.className = 'dg-dialog-overlay'
  overlay.setAttribute('role', 'presentation')

  const box = document.createElement('div')
  box.className = 'dg-dialog-box dg-sobre-box'
  box.setAttribute('role', 'dialog')
  box.setAttribute('aria-modal', 'true')
  box.setAttribute('aria-labelledby', 'dg-sobre-title')

  const head = document.createElement('div')
  head.className = 'dg-dialog-head'
  const title = document.createElement('h3')
  title.id = 'dg-sobre-title'
  title.textContent = 'Sobre o DG Editor'
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'btn-icon dg-dialog-close'
  close.setAttribute('aria-label', 'Fechar')
  close.innerHTML =
    '<svg viewBox="0 0 10 10" width="10" height="10"><path d="M2 2l6 6M8 2l-6 6" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>'
  head.appendChild(title)
  head.appendChild(close)

  const body = document.createElement('div')
  body.className = 'dg-sobre-body'
  body.innerHTML =
    '<div class="dg-sobre-brand">' +
    '<span class="dg-sobre-logo-wrap"><img src="' +
    esc(logoSrc()) +
    '" alt="DG Editor" class="dg-sobre-logo" /></span>' +
    '<div class="dg-sobre-meta">' +
    '<strong>DG Editor</strong>' +
    '<span class="muted">Editor de sistemas com IA local</span>' +
    '<span class="dg-sobre-ver" id="dg-sobre-ver">v' +
    esc(ver || '—') +
    '</span>' +
    '</div></div>' +
    '<p class="dg-sobre-status muted" id="dg-sobre-status"></p>'

  const foot = document.createElement('div')
  foot.className = 'dg-dialog-foot dg-sobre-foot'
  const btnUpdate = document.createElement('button')
  btnUpdate.type = 'button'
  btnUpdate.className = 'btn-small chat-parity-primary'
  btnUpdate.id = 'dg-sobre-update'
  btnUpdate.textContent = st?.estado === 'pronta' ? 'Reiniciar e atualizar' : 'Update'
  const btnOk = document.createElement('button')
  btnOk.type = 'button'
  btnOk.className = 'btn-small'
  btnOk.textContent = 'Fechar'

  foot.appendChild(btnUpdate)
  foot.appendChild(btnOk)

  const finish = () => {
    overlay.remove()
    document.removeEventListener('keydown', onKey, true)
  }
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      finish()
    }
  }
  close.addEventListener('click', finish)
  btnOk.addEventListener('click', finish)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) finish()
  })
  document.addEventListener('keydown', onKey, true)

  const statusEl = () => body.querySelector('#dg-sobre-status')
  const pintar = (s) => {
    st = s || st
    const el = statusEl()
    if (!el) return
    const msg = st?.mensagem || '—'
    el.textContent = msg + (st?.versaoRemota ? ' (remota ' + st.versaoRemota + ')' : '')
    if (btnUpdate) {
      btnUpdate.disabled = st?.estado === 'checando' || st?.estado === 'baixando'
      btnUpdate.textContent =
        st?.estado === 'pronta'
          ? 'Reiniciar e atualizar'
          : st?.estado === 'baixando'
            ? 'Baixando ' + (st.progresso || 0) + '%'
            : st?.estado === 'checando'
              ? 'Verificando…'
              : 'Update'
    }
  }
  pintar(st)

  btnUpdate.addEventListener('click', async () => {
    try {
      if (typeof opts.onUpdate === 'function') {
        await opts.onUpdate()
        return
      }
      if (st?.estado === 'pronta') {
        pintar({ ...st, mensagem: 'Reiniciando para aplicar…' })
        await window.api.invoke('update:instalar')
        return
      }
      pintar({ ...(st || {}), estado: 'checando', mensagem: 'Verificando atualizações…' })
      const r = await window.api.invoke('update:verificar')
      pintar(r)
      if (r?.estado === 'pronta') {
        const ok = window.dgConfirm
          ? await window.dgConfirm(
              'Atualização ' + (r.versaoRemota || '') + ' pronta. Reiniciar agora?',
              'Atualizar DG Editor'
            )
          : true
        if (ok) await window.api.invoke('update:instalar')
      } else if (r?.estado === 'disponivel' || r?.estado === 'baixando') {
        /* autoDownload cuida do resto */
      } else if (!r?.empacotado) {
        pintar({
          ...r,
          mensagem:
            'Update completo só no app instalado (outro PC / Program Files). Em dev: publique a release e teste no instalador.'
        })
      }
    } catch (e) {
      pintar({ estado: 'erro', mensagem: String(e), empacotado: st?.empacotado })
    }
  })

  try {
    window.api.on?.('update:status', (_e, s) => {
      if (document.body.contains(overlay)) pintar(s)
    })
  } catch {
    /* */
  }

  box.appendChild(head)
  box.appendChild(body)
  box.appendChild(foot)
  overlay.appendChild(box)
  document.body.appendChild(overlay)
  btnOk.focus()
}
