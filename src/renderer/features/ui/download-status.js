// download-status.js — UI de progresso/cancelamento de downloads do navegador.
// Extraído de app.js. Chamar ligarDownloadUi() uma vez no boot.
import { mostrarToast } from './toast.js'

const $ = (id) => document.getElementById(id)

const dlBox = $('browser-download')
const dlNome = $('browser-download-nome')
const dlPct = $('browser-download-pct')
let downloadAtivoId = ''
let timerDownloadFinal = null

function rotuloFinalDownload(estado) {
  if (estado === 'cancelado') return 'cancelado'
  if (estado === 'interrompido') return 'falhou'
  return 'ok'
}

export function atualizarDownloadUi(p) {
  if (!dlBox || !p || typeof p !== 'object' || !p.id) return
  const ativo = p.estado === 'iniciado' || p.estado === 'andamento'
  if (ativo) {
    if (timerDownloadFinal) {
      clearTimeout(timerDownloadFinal)
      timerDownloadFinal = null
    }
    downloadAtivoId = p.id
    dlBox.hidden = false
    if (dlNome) dlNome.textContent = p.nomeOriginal || 'download'
    if (dlPct) {
      dlPct.textContent =
        p.total > 0 ? p.percentual + '%' : Math.max(0, Math.round(p.recebido / 1024)) + ' KB'
    }
    return
  }
  if (p.id !== downloadAtivoId) return
  downloadAtivoId = ''
  if (dlPct) dlPct.textContent = rotuloFinalDownload(p.estado)
  timerDownloadFinal = setTimeout(() => {
    timerDownloadFinal = null
    if (!downloadAtivoId && dlBox) dlBox.hidden = true
  }, 2500)
}

export function ligarDownloadUi() {
  $('browser-download-cancelar')?.addEventListener('click', async () => {
    if (!downloadAtivoId) return
    try {
      const r = await window.api.invoke('navegador:download-cancelar', downloadAtivoId)
      if (r?.ok) mostrarToast('Download cancelado', 'ok')
      else mostrarToast('Não foi possível cancelar: ' + (r?.erro || 'desconhecido'), 'erro')
    } catch (e) {
      console.warn('[navegador] cancelar download', e)
      mostrarToast('Falha ao cancelar download', 'erro')
    }
  })
}
