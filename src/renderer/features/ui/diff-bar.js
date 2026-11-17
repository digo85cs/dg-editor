// diff-bar.js — barra "Aplicar/Rejeitar" sobre o editor para propostas do agente.
// Extraído de app.js. DOM puro.

const $ = (id) => document.getElementById(id)

export function mostrarEditorDiffBar(pendente, meta) {
  const bar = $('editor-diff-bar')
  if (!bar || !pendente?.id) return
  const pathEl = $('editor-diff-bar-path')
  const metaEl = $('editor-diff-bar-meta')
  if (pathEl) pathEl.textContent = pendente.path || pendente.absPath || 'proposta'
  if (metaEl) {
    const del = Array.isArray(meta?.linhasDel) ? meta.linhasDel.length : 0
    const add = Array.isArray(meta?.linhasAdd) ? meta.linhasAdd.length : 0
    metaEl.textContent = (del || add) ? ('−' + del + ' / +' + add) : ''
  }
  bar.dataset.propostaId = pendente.id
  bar.hidden = false
  window.__dgApplyViaAgente = true
}

export function ocultarEditorDiffBar() {
  const bar = $('editor-diff-bar')
  if (!bar) return
  bar.hidden = true
  delete bar.dataset.propostaId
}
