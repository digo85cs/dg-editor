// CRUD de pastas/repositórios recentes (sidebar).
import { state } from '../../state/app-state.js'
import { mostrarToast } from '../ui/toast.js'
import { dgConfirm } from '../ui/dg-dialog.js'
import {
  adicionarPastaState,
  removerPastaDoState,
  reapontarPastaState,
  salvarPastas
} from './recentes.js'
import { renderizarPastas, renderizarProjects } from './arvore-render.js'
import { atualizarStatusBar } from '../ui/repos-status.js'
import { limparHistoricoAbas } from '../editor/historico-abas.js'
import {
  renderizarAbas,
  persistirAbas,
  atualizarBreadcrumb,
  atualizarEmpty
} from '../editor/abas-ui.js'
import {
  setChatSendMode,
  garantirEmptyStateChat,
  definirHistChat
} from '../chat/chat-core.js'

const $ = (id) => document.getElementById(id)

let deps = {
  nomeArquivo: (p) => p,
  selecionarPasta: async () => {},
  getEditor: () => null,
  habilitarBotoesAnalise: () => {}
}

export function configurarPastasCrud(d) {
  deps = { ...deps, ...d }
}

export async function abrirPasta() {
  const r = await window.api.invoke('folder:select')
  if (r.canceled) return
  adicionarPasta(r.path)
  await deps.selecionarPasta(r.path)
}

export function adicionarPasta(path) {
  adicionarPastaState(path)
  void renderizarPastas()
  void renderizarProjects(true)
  void atualizarStatusBar(path)
}

export async function escolherNovoCaminhoPasta(antigo) {
  try {
    const r = await window.api.invoke('folder:select')
    if (!r || r.canceled || !r.path) return
    const novo = r.path
    if (novo === antigo) return
    if (state.pastasRecentes.includes(novo)) {
      await removerPasta(antigo, { skipConfirm: true })
      await deps.selecionarPasta(novo)
      return
    }
    reapontarPastaState(antigo, novo)
    await renderizarPastas()
    void renderizarProjects(true)
    await deps.selecionarPasta(novo)
  } catch (e) {
    mostrarToast('Não foi possível alterar o caminho: ' + String(e), 'erro')
  }
}

export function criarBotaoRemoverPasta(path) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'pasta-remover'
  btn.title = 'Remover da lista'
  btn.setAttribute('aria-label', 'Remover pasta ' + deps.nomeArquivo(path))
  btn.textContent = '×'
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    void removerPasta(path)
  })
  return btn
}

export async function removerPasta(path, opts) {
  if (!path || !state.pastasRecentes.includes(path)) return
  const nome = deps.nomeArquivo(path)
  const confirmar = !(opts && opts.skipConfirm)
  if (
    confirmar &&
    !(await dgConfirm(
      "Remover '" + nome + "' da lista?\n\nA pasta não será apagada do disco.",
      'Remover da lista'
    ))
  ) return
  const res = removerPastaDoState(path)
  if (!res) return
  if (res.abaAtivaPerdida) {
    deps.getEditor()?.limpar()
    limparHistoricoAbas()
  }
  if (res.abasFechadas.length) {
    renderizarAbas()
    atualizarBreadcrumb()
    atualizarEmpty()
    persistirAbas()
  }
  if (res.eraPastaAtual) {
    const titulo = $('chat-title')
    if (titulo) titulo.textContent = 'DG Editor'
    setChatSendMode('send')
    if ($('chat-send')) $('chat-send').disabled = true
    deps.habilitarBotoesAnalise(false)
    garantirEmptyStateChat()
    definirHistChat(null)
  }
  await renderizarPastas()
  void renderizarProjects(true)
  if (typeof atualizarStatusBar === 'function') void atualizarStatusBar(state.pastaAtual)
}

/** Garante a raiz do projeto no Explorer (evita "Nenhuma pasta" no primeiro boot). */
export async function garantirPastaRaizProjeto() {
  try {
    const r = await window.api.invoke('app:raiz-projeto')
    if (!r?.ok || !r.raiz) return
    const raiz = String(r.raiz)
    // Remove caminhos truncados por bug de espaco (ex.: "D:\\CURSOR\\DG Edi")
    for (let i = state.pastasRecentes.length - 1; i >= 0; i--) {
      const p = String(state.pastasRecentes[i] || '')
      if (!p) {
        state.pastasRecentes.splice(i, 1)
        continue
      }
      if (p !== raiz && raiz.toLowerCase().startsWith(p.toLowerCase())) {
        state.pastasRecentes.splice(i, 1)
      }
    }
    if (!state.pastasRecentes.includes(raiz)) {
      state.pastasRecentes.unshift(raiz)
    }
    salvarPastas()
    await renderizarPastas()
    if (!state.pastaAtual) {
      await deps.selecionarPasta(raiz)
    }
  } catch (e) {
    console.warn('[pastas] raiz projeto:', e)
  }
}
