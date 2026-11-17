// Abas do editor: render, teclado, empty/breadcrumb, dirty-modal, formatar.
import { state } from '../../state/app-state.js'
import { mostrarToast } from '../ui/toast.js'
import { pastasPermitidas } from '../arquivos/index.js'
import { escapar } from '../../utils/dom.js'
import { toggleMdPreview } from './preview-md.js'

const $ = (id) => document.getElementById(id)

let deps = {
  nomeArquivo: (p) => p,
  caminhoRelativo: (p) => p,
  extIcon: () => '',
  getEditor: () => null,
  ativarAba: async () => false,
  fecharAba: async () => {}
}

export function configurarAbasUi(d) {
  deps = { ...deps, ...d }
}

export function persistirAbas() {
  localStorage.setItem(
    'dg-state.abas',
    JSON.stringify({ abas: state.abas.map((a) => a.caminho), ativa: state.abaAtiva })
  )
}

export async function restaurarAbas() {
  try {
    const raw = localStorage.getItem('dg-state.abas')
    if (!raw) return
    const data = JSON.parse(raw)
    const lista = Array.isArray(data.abas) ? data.abas : []
    for (const c of lista) {
      const existe = await window.api.invoke('arquivo:existe', c, pastasPermitidas())
      if (existe.ok && existe.existe) {
        const r = await window.api.invoke('arquivo:ler', c, pastasPermitidas())
        if (r.ok) {
          state.abas.push({ caminho: c, nome: deps.nomeArquivo(c), dirty: false })
          // conteúdo fica no editor só para a ativa; dirty false
        }
      }
    }
    if (state.abas.length) {
      const alvo = data.ativa && state.abas.find((a) => a.caminho === data.ativa) ? data.ativa : state.abas[0].caminho
      await deps.ativarAba(alvo)
    }
    renderizarAbas()
  } catch (e) {
    console.warn('[state.abas] restaurar:', e)
  }
}

export function renderizarAbas() {
  const bar = $('editor-tabs')
  bar.innerHTML = ''
  for (const a of state.abas) {
    const btn = document.createElement('button')
    btn.type = 'button'
    const ativa = a.caminho === state.abaAtiva
    btn.className =
      'editor-tab' + (ativa ? ' active' : '') + (a.dirty ? ' dirty' : '')
    btn.dataset.caminho = a.caminho
    btn.setAttribute('role', 'tab')
    btn.setAttribute('aria-selected', String(ativa))
    btn.tabIndex = ativa ? 0 : -1
    btn.innerHTML =
      deps.extIcon(a.nome) +
      '<span class="tab-name">' +
      escapar(a.nome) +
      '</span>' +
      '<span class="tab-close" title="Fechar">×</span>'
    btn.title = a.caminho
    btn.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-close')) {
        e.stopPropagation()
        void deps.fecharAba(a.caminho)
      } else {
        void deps.ativarAba(a.caminho)
      }
    })
    bar.appendChild(btn)
  }
  // #tabbar fora de #app: esconde quando não há state.abas (Cursor)
  const tabbar = $('tabbar')
  if (tabbar) tabbar.style.display = state.abas.length ? 'flex' : 'none'
  atualizarEmpty()
}

/** Setas/Home/End navegam e ativam abas (padrão WAI-ARIA para tablist). */
export function initTecladoAbas() {
  const bar = $('editor-tabs')
  if (!bar || bar.dataset.teclado === '1') return
  bar.dataset.teclado = '1'
  bar.addEventListener('keydown', async (e) => {
    const botoes = [...bar.querySelectorAll('.editor-tab')]
    if (!botoes.length) return
    const i = botoes.indexOf(document.activeElement)
    let alvo = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') alvo = (i + 1) % botoes.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') alvo = (i - 1 + botoes.length) % botoes.length
    else if (e.key === 'Home') alvo = 0
    else if (e.key === 'End') alvo = botoes.length - 1
    else return
    e.preventDefault()
    const b = botoes[alvo]
    const caminho = b.dataset.caminho
    if (!caminho) {
      b.focus()
      return
    }
    // ativarAba re-renderiza a lista: refoca o botão novo pelo caminho.
    const ok = await deps.ativarAba(caminho)
    if (!ok) {
      bar.querySelector('.editor-tab.active')?.focus()
      return
    }
    const novo = [...bar.querySelectorAll('.editor-tab')].find((x) => x.dataset.caminho === caminho)
    novo?.focus()
  })
}

export function atualizarEmpty() {
  const empty = $('editor-empty')
  if (!empty) return
  empty.classList.toggle('hidden', !!state.abaAtiva)
}

export function atualizarBreadcrumb() {
  const bc = $('editor-breadcrumb')
  if (!bc) return
  bc.textContent = state.abaAtiva ? deps.caminhoRelativo(state.abaAtiva) : ''
}

export async function formatarDocumentoAtivo() {
  const editor = deps.getEditor()
  if (!state.abaAtiva || !editor) return false
  const btn = $('btn-editor-formatar')
  if (btn) btn.disabled = true
  try {
    const r = await editor.formatar?.()
    if (!r || !r.ok) {
      mostrarToast('Formatacao indisponivel: ' + ((r && r.erro) || 'tipo nao suportado'), 'aviso')
      return false
    }
    mostrarToast(r.alterado ? 'Documento formatado' : 'Documento ja estava formatado', 'ok')
    return true
  } finally {
    if (btn) btn.disabled = false
  }
}

let dirtyResolver = null

export function perguntarDirty(caminho) {
  return new Promise((resolve) => {
    dirtyResolver = resolve
    $('dirty-msg').textContent =
      'O arquivo "' + deps.nomeArquivo(caminho) + '" tem alterações não salvas. Deseja salvar?'
    $('modal-dirty').classList.remove('hidden')
  })
}

export function fecharDirtyModal(resultado) {
  $('modal-dirty').classList.add('hidden')
  if (dirtyResolver) {
    const r = dirtyResolver
    dirtyResolver = null
    r(resultado)
  }
}

export function ligarAbasUi() {
  initTecladoAbas()
  $('btn-md-preview')?.addEventListener('click', () => toggleMdPreview())
  $('btn-editor-formatar')?.addEventListener('click', () => void formatarDocumentoAtivo())
  $('btn-dirty-cancel')?.addEventListener('click', () => fecharDirtyModal('cancelar'))
  $('btn-dirty-discard')?.addEventListener('click', () => fecharDirtyModal('descartar'))
  $('btn-dirty-save')?.addEventListener('click', () => fecharDirtyModal('salvar'))
}
