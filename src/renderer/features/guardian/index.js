import { renderGuardianText } from './render.js'

const $ = (id) => document.getElementById(id)

export async function atualizarGuardiao() {
  try {
    const s = await window.api.invoke('guardian:snapshot')
    if (typeof window.__dgAtualizarAba === 'function') window.__dgAtualizarAba('saude')
    const st = await window.api.invoke('dg:status')
    if (st?.paused) {
      $('guardian-alert').classList.remove('hidden')
      $('guardian-alert').textContent = 'Pausado: ' + (st.pausedReason || '')
    } else {
      $('guardian-alert').classList.add('hidden')
    }
    const el = $('guardian-text')
    if (el) el.textContent = renderGuardianText(s)
  } catch {
    const el = $('guardian-text')
    if (el) el.textContent = 'Guardião indisponível'
  }
}

export function iniciarGuardian() {
  void atualizarGuardiao()
  setInterval(atualizarGuardiao, 5000)
}
