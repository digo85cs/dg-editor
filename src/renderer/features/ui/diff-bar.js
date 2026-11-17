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

let depsBar = { getEditor: () => null }

export function configurarDiffBar(d) {
  depsBar = { ...depsBar, ...d }
}

export function ligarDiffBar() {
  const $id = (id) => document.getElementById(id)
  $id('diff-panel-close')?.addEventListener('click', () => depsBar.fecharPainelDiff())
  $id('editor-diff-bar-apply')?.addEventListener('click', async () => {
    const id = $id('editor-diff-bar')?.dataset?.propostaId
    if (!id) return
    await depsBar.aplicarUmaPropostaAgent(id)
    const ed = depsBar.getEditor()
    if (ed && ed.limparDiff) ed.limparDiff()
    ocultarEditorDiffBar()
  })
  $id('editor-diff-bar-reject')?.addEventListener('click', async () => {
    const id = $id('editor-diff-bar')?.dataset?.propostaId
    if (!id) return
    window.__dgApplyViaAgente = true
    await window.api.invoke('agente:rejeitar-proposta', id)
    const rest = await window.api.invoke('agente:propostas')
    depsBar.mostrarPropostasAgent(rest?.pendentes || [])
    const ed = depsBar.getEditor()
    if (ed && ed.limparDiff) ed.limparDiff()
    ocultarEditorDiffBar()
    depsBar.fecharPainelDiff()
    if (window.dgToast) window.dgToast('Proposta rejeitada', 'aviso')
  })
}
