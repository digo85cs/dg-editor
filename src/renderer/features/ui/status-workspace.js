// Status "WS:" da barra de status + indicador Safe Mode.
import { agendarSalvarWorkspace, flushWorkspace } from '../../workspace-ui.js'

const $ = (id) => document.getElementById(id)

export function ligarStatusWorkspace() {
  window.addEventListener('dg:workspace-sujo', () => agendarSalvarWorkspace())
  const el = $('sb-workspace')
  const mark = (t) => {
    if (el) el.textContent = 'WS: ' + t
  }
  window.__dgFlushWorkspace = async () => {
    mark('salvando…')
    const r = await flushWorkspace()
    mark(r?.ok ? 'salvo' : 'local')
    setTimeout(() => mark('auto'), 2500)
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) mark('salvo')
  })
  mark('auto')
  void window.api.invoke('app:is-safe-mode').then((r) => {
    const s = $('sb-safe')
    if (s && (r === true || r?.safeMode || r?.ok && r.safeMode)) {
      s.classList.remove('hidden')
      s.textContent = 'Safe'
    }
  }).catch(() => {})
}
