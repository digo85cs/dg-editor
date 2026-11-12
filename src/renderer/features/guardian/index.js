import { renderGuardianText } from './render.js'

const $ = (id) => document.getElementById(id)

export async function atualizarGuardiao() {
  const el = $('guardian-text')
  try {
    const s = await window.api.invoke('guardian:snapshot')
    if (typeof window.__dgAtualizarAba === 'function') window.__dgAtualizarAba('saude')
    let st = null
    try {
      st = await window.api.invoke('dg:status')
    } catch {
      st = null
    }
    const alertEl = $('guardian-alert')
    if (alertEl) {
      if (st?.paused) {
        alertEl.classList.remove('hidden')
        alertEl.textContent = 'Pausado: ' + (st.pausedReason || '')
      } else {
        alertEl.classList.add('hidden')
        alertEl.textContent = ''
      }
    }
    if (el) el.textContent = renderGuardianText(s)
  } catch (e) {
    if (el) {
      const msg = e && e.message ? String(e.message) : ''
      el.textContent = msg.includes('No handler')
        ? 'Guardião: reinicie o app'
        : 'Guardião: medindo…'
    }
    // Retenta uma vez após breve atraso (boot IPC)
    setTimeout(() => {
      void window.api
        .invoke('guardian:snapshot')
        .then((s) => {
          if (el) el.textContent = renderGuardianText(s)
        })
        .catch(() => {
          if (el && el.textContent.indexOf('medindo') >= 0) {
            el.textContent = 'Guardião: offline'
          }
        })
    }, 1200)
  }
}

export function iniciarGuardian() {
  void atualizarGuardiao()
  setInterval(atualizarGuardiao, 5000)
}
