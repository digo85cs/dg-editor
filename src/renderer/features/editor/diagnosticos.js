// diagnosticos.js — painel de diagnósticos do editor + toggle do minimapa.
// Extraído de app.js. editor acessado via getEditor() registrado no boot.
import { state } from '../../state/app-state.js'

const $ = (id) => document.getElementById(id)
export const LS_MINIMAP = 'dg.editor.minimapa.ativo'

let getEditor = () => null

/** Registra acesso ao editor do app.js. Chamar uma vez no boot. */
export function configurarDiagnosticos(deps) {
  if (deps && typeof deps.getEditor === 'function') getEditor = deps.getEditor
}

export function atualizarDiagEditor(lista) {
  const el = $('editor-diag')
  if (!el) return
  if (!state.abaAtiva) {
    el.classList.add('hidden')
    return
  }
  const diags = Array.isArray(lista) ? lista : []
  const erros = diags.filter((d) => d.severidade === 'erro')
  const avisos = diags.filter((d) => d.severidade !== 'erro')
  el.classList.remove('hidden', 'tem-erro', 'tem-aviso', 'ok')
  if (erros.length) {
    el.classList.add('tem-erro')
    el.textContent =
      erros.length + ' erro' + (erros.length > 1 ? 's' : '') +
      (avisos.length ? ' · ' + avisos.length + ' aviso' + (avisos.length > 1 ? 's' : '') : '')
  } else if (avisos.length) {
    el.classList.add('tem-aviso')
    el.textContent = avisos.length + ' aviso' + (avisos.length > 1 ? 's' : '')
  } else {
    el.classList.add('ok')
    el.textContent = 'Sem problemas'
  }
  el.title = diags.slice(0, 8).map((d) => 'L' + d.linha + ': ' + d.mensagem).join('\n') || 'Sem diagnosticos'
}

export function aplicarMinimapa(ligado) {
  const btn = $('btn-editor-minimapa')
  if (btn) {
    btn.setAttribute('aria-pressed', ligado ? 'true' : 'false')
    btn.classList.toggle('ativo', ligado)
  }
  getEditor()?.minimapaAlternar?.(ligado)
}

/** Botão + persistência do minimapa. Chamar uma vez no boot. */
export function ligarMinimapa() {
  $('btn-editor-minimapa')?.addEventListener('click', () => {
    const ligado = !(getEditor()?.minimapaVisivel?.() ?? false)
    localStorage.setItem(LS_MINIMAP, ligado ? '1' : '0')
    aplicarMinimapa(ligado)
  })
}
