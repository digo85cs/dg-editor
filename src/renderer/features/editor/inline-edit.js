/**
 * Edição Inline com IA (Ctrl+K no editor CodeMirror 6 — padrão Cursor).
 * Abre micro-barra flutuante sobre o trecho selecionado, gera proposta e aplica via transação (Ctrl+Z nativo).
 */
import { escapar } from '../../utils/dom.js'
import { mostrarToast } from '../ui/toast.js'
import { anunciar } from '../ui/live-region.js'

let hostOverlay = null
let estadoAtual = null

export function inlineEditAberto() {
  return Boolean(hostOverlay && !hostOverlay.hidden)
}

export function fecharInlineEdit(focarEditor = true) {
  const ed = estadoAtual?.editor
  if (hostOverlay) {
    hostOverlay.remove()
    hostOverlay = null
  }
  estadoAtual = null
  if (focarEditor) ed?.focar?.()
}

function obterFaixaAlvo(view) {
  const doc = view.state.doc
  const sel = view.state.selection.main
  if (!sel.empty) {
    const lIni = doc.lineAt(sel.from).number
    const lFim = doc.lineAt(sel.to).number
    return {
      from: sel.from,
      to: sel.to,
      texto: doc.sliceString(sel.from, sel.to),
      rotulo: lIni === lFim ? `Linha ${lIni}` : `Linhas ${lIni}–${lFim}`
    }
  }
  const linha = doc.lineAt(sel.head)
  return {
    from: linha.from,
    to: linha.to,
    texto: linha.text,
    rotulo: `Linha ${linha.number}`
  }
}

/**
 * Abre a barra flutuante de Edição Inline (Ctrl+K) sobre o editor ativo.
 * @param {any} editor Instância retornada por criarEditor()
 */
export function abrirInlineEdit(editor) {
  if (!editor?.view || !editor.getCaminho?.()) {
    mostrarToast('Abra um arquivo no editor para usar Edição Inline (Ctrl+K)', 'aviso')
    return false
  }
  fecharInlineEdit(false)

  const container = document.getElementById('editor-host') || editor.view.dom.parentElement
  if (!container) return false

  const faixa = obterFaixaAlvo(editor.view)
  const caminho = editor.getCaminho() || ''
  const nomeArq = String(caminho).split(/[/\\]/).pop() || caminho

  const box = document.createElement('div')
  box.id = 'dg-inline-edit'
  box.className = 'dg-inline-edit'
  box.setAttribute('role', 'dialog')
  box.setAttribute('aria-label', 'Edição inline com IA')
  box.innerHTML =
    '<div class="dg-ie-head">' +
    '<span class="dg-ie-badge">Ctrl+K</span>' +
    '<span class="dg-ie-meta">' + escapar(nomeArq) + ' · ' + escapar(faixa.rotulo) + '</span>' +
    '<button type="button" class="dg-ie-close" title="Fechar (Esc)" aria-label="Fechar edição inline">×</button>' +
    '</div>' +
    '<div class="dg-ie-row">' +
    '<input type="text" class="dg-ie-input" placeholder="O que alterar neste trecho? (Enter gera · Esc fecha)" autocomplete="off" />' +
    '<button type="button" class="btn-small btn-primary dg-ie-run">Gerar</button>' +
    '</div>' +
    '<div class="dg-ie-status muted" hidden></div>' +
    '<div class="dg-ie-preview" hidden>' +
    '<pre class="dg-ie-code dg-ie-before"></pre>' +
    '<pre class="dg-ie-code dg-ie-after"></pre>' +
    '<div class="dg-ie-actions">' +
    '<button type="button" class="btn-small btn-primary dg-ie-accept">Aceitar (Ctrl+Enter)</button>' +
    '<button type="button" class="btn-small dg-ie-reject">Descartar (Esc)</button>' +
    '</div>' +
    '</div>'

  container.appendChild(box)
  hostOverlay = box
  estadoAtual = { editor, faixa, caminho, proposta: null, gerando: false }

  const input = /** @type {HTMLInputElement} */ (box.querySelector('.dg-ie-input'))
  const btnRun = /** @type {HTMLButtonElement} */ (box.querySelector('.dg-ie-run'))
  const btnClose = /** @type {HTMLButtonElement} */ (box.querySelector('.dg-ie-close'))
  const statusEl = /** @type {HTMLElement} */ (box.querySelector('.dg-ie-status'))
  const previewEl = /** @type {HTMLElement} */ (box.querySelector('.dg-ie-preview'))
  const beforeEl = /** @type {HTMLElement} */ (box.querySelector('.dg-ie-before'))
  const afterEl = /** @type {HTMLElement} */ (box.querySelector('.dg-ie-after'))
  const btnAccept = /** @type {HTMLButtonElement} */ (box.querySelector('.dg-ie-accept'))
  const btnReject = /** @type {HTMLButtonElement} */ (box.querySelector('.dg-ie-reject'))

  const aplicarProposta = () => {
    if (!estadoAtual || estadoAtual.proposta == null) return
    const { from, to } = estadoAtual.faixa
    const novo = estadoAtual.proposta
    editor.view.dispatch({
      changes: { from, to, insert: novo },
      selection: { anchor: from + novo.length }
    })
    mostrarToast('Alteração inline aplicada (Ctrl+Z desfaz)', 'ok')
    anunciar('Alteração inline aplicada no editor')
    fecharInlineEdit(true)
  }

  const gerar = async () => {
    if (!estadoAtual || estadoAtual.gerando) return
    const instrucao = input.value.trim()
    if (!instrucao) {
      input.focus()
      return
    }
    estadoAtual.gerando = true
    btnRun.disabled = true
    statusEl.hidden = false
    statusEl.textContent = 'Gerando edição inline…'
    previewEl.hidden = true
    try {
      const fullDoc = editor.view.state.doc.toString()
      const antes = fullDoc.slice(Math.max(0, faixa.from - 2000), faixa.from)
      const depois = fullDoc.slice(faixa.to, faixa.to + 1000)
      const r = await window.api.invoke('editor:editar-inline', {
        instrucao,
        selecao: faixa.texto,
        antes,
        depois,
        caminho
      })
      if (!estadoAtual) return
      if (!r?.ok || typeof r.codigo !== 'string') {
        statusEl.textContent = 'Erro: ' + (r?.erro || 'não foi possível gerar a edição')
        return
      }
      estadoAtual.proposta = r.codigo
      statusEl.textContent = 'Sugestão pronta' + (r.provider ? ' · ' + r.provider : '')
      beforeEl.textContent = faixa.texto || '(linha vazia)'
      afterEl.textContent = r.codigo
      previewEl.hidden = false
      btnAccept.focus()
    } catch (e) {
      if (estadoAtual) statusEl.textContent = 'Erro: ' + String(e)
    } finally {
      if (estadoAtual) estadoAtual.gerando = false
      btnRun.disabled = false
    }
  }

  btnClose.addEventListener('click', () => fecharInlineEdit(true))
  btnReject.addEventListener('click', () => fecharInlineEdit(true))
  btnRun.addEventListener('click', () => void gerar())
  btnAccept.addEventListener('click', aplicarProposta)

  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      fecharInlineEdit(true)
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && estadoAtual?.proposta != null) {
      e.preventDefault()
      e.stopPropagation()
      aplicarProposta()
      return
    }
    if (e.key === 'Enter' && document.activeElement === input && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      void gerar()
    }
  })

  input.focus()
  return true
}
