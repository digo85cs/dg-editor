// Núcleo de abas do editor: ativar/fechar, autosave, init CodeMirror.
import { state } from '../../state/app-state.js'
import { mostrarToast } from '../ui/toast.js'
import { pastasPermitidas } from '../arquivos/index.js'
import { relPosix } from '../arquivos/git-helpers.js'
import {
  ehMarkdown,
  ehImagemExt,
  atualizarToolbarPreview,
  sincronizarPreviewMdAba
} from './preview-md.js'
import { mostrarImagem, esconderImagem } from './imagem.js'
import {
  registrarHistAba,
  limparHistoricoAbas
} from './historico-abas.js'
import {
  atualizarDiagEditor,
  aplicarMinimapa,
  LS_MINIMAP
} from './diagnosticos.js'
import { atualizarPainelVault } from '../arquivos/desktop-vault.js'
import { ativarAbaCentro } from '../layout/panes.js'
import { agendarSalvarWorkspace } from '../../workspace-ui.js'
import {
  renderizarAbas,
  persistirAbas,
  atualizarBreadcrumb,
  atualizarEmpty,
  perguntarDirty
} from './abas-ui.js'

const $ = (id) => document.getElementById(id)

let deps = {
  nomeArquivo: (p) => p,
  caminhoNoVault: (c) => false,
  getEditor: () => null,
  setEditor: () => {}
}

export function configurarAbasCore(d) {
  deps = { ...deps, ...d }
}

let moduloEditorPromise = null
function carregarModuloEditor() {
  moduloEditorPromise ??= import('../../editor-cm.js')
  return moduloEditorPromise
}

// ---------- Abas + editor ----------
export async function abrirArquivoNaAba(caminho, linha) {
  // exportada para ferramentas-ui
  ativarAbaCentro('editor')
  const existente = state.abas.find((a) => a.caminho === caminho)
  if (existente) {
    await ativarAba(caminho)
    if (linha) {
      if (!deps.getEditor()) await initEditor()
      deps.getEditor()?.irParaLinha?.(linha)
    }
    return
  }
  if (ehImagemExt(caminho)) {
    syncDirtyAtiva()
    state.abas.push({ caminho, nome: deps.nomeArquivo(caminho), dirty: false, imagem: true })
    state.abaAtiva = caminho
    registrarHistAba(caminho)
    if (!deps.getEditor()) await initEditor()
    esconderImagem()
    await mostrarImagem(caminho)
    renderizarAbas()
    atualizarBreadcrumb()
    atualizarEmpty()
    atualizarToolbarPreview(caminho)
    persistirAbas()
    return
  }
  const r = await window.api.invoke('arquivo:ler', caminho, pastasPermitidas())
  if (!r.ok) {
    mostrarToast('Não foi possível abrir: ' + (r.erro || 'erro'), 'erro')
    return
  }
  // sincronizar dirty da aba atual antes de trocar
  syncDirtyAtiva()
  state.abas.push({ caminho, nome: deps.nomeArquivo(caminho), dirty: false })
  await ativarAba(caminho, r.conteudo)
  persistirAbas()
  if (linha) {
    if (!deps.getEditor()) await initEditor()
    deps.getEditor()?.irParaLinha?.(linha)
  }
}

export function syncDirtyAtiva() {
  if (!state.abaAtiva || !deps.getEditor()) return
  const a = state.abas.find((x) => x.caminho === state.abaAtiva)
  if (a) a.dirty = deps.getEditor().isDirty()
}

export async function ativarAba(caminho, conteudoPrevio) {
  cancelarAutosave()
  syncDirtyAtiva()
  let conteudo = conteudoPrevio
  const imagem = ehImagemExt(caminho)
  if (!imagem && conteudo == null) {
    const r = await window.api.invoke('arquivo:ler', caminho, pastasPermitidas())
    if (!r.ok) {
      // Aba órfã (arquivo removido): fecha a aba limpa; se suja, preserva.
      const idx = state.abas.findIndex((x) => x.caminho === caminho)
      const aba = idx >= 0 ? state.abas[idx] : null
      if (aba && !aba.dirty && caminho !== state.abaAtiva) {
        state.abas.splice(idx, 1)
        renderizarAbas()
        persistirAbas()
        mostrarToast('Aba fechada: "' + deps.nomeArquivo(caminho) + '" não existe mais.', 'aviso')
      } else {
        mostrarToast('Não foi possível abrir: ' + (r.erro || 'erro'), 'erro')
      }
      $('editor-tabs')?.querySelector('.editor-tab.active')?.focus()
      return false
    }
    conteudo = r.conteudo
  }
  state.abaAtiva = caminho
  registrarHistAba(caminho)
  ativarAbaCentro('editor')
  if (imagem) {
    if (!deps.getEditor()) await initEditor()
    await mostrarImagem(caminho)
    renderizarAbas()
    atualizarBreadcrumb()
    atualizarEmpty()
    atualizarToolbarPreview(caminho)
    persistirAbas()
    return true
  }
  esconderImagem()
  if (!deps.getEditor()) await initEditor()
  deps.getEditor().abrir(caminho, conteudo)
  const a = state.abas.find((x) => x.caminho === caminho)
  if (a) a.dirty = false
  renderizarAbas()
  atualizarBreadcrumb()
  atualizarEmpty()
  atualizarToolbarPreview(caminho)
  sincronizarPreviewMdAba(caminho, conteudo)
  deps.getEditor().focar()
  persistirAbas()
  void atualizarPainelVault(caminho)
  void sincronizarOverviewGit(caminho)
  return true
}

/** Extrai linhas +/- do unified diff para a overview ruler. */
export function parseDiffLinhasOverview(diffText) {
  const add = []
  const del = []
  let newLine = 0
  let oldLine = 0
  for (const ln of String(diffText || '').split(/\n/)) {
    const h = ln.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (h) {
      oldLine = Number(h[1])
      newLine = Number(h[2])
      continue
    }
    if (ln.startsWith('+') && !ln.startsWith('+++')) {
      add.push(newLine)
      newLine++
      continue
    }
    if (ln.startsWith('-') && !ln.startsWith('---')) {
      del.push(Math.max(1, newLine))
      oldLine++
      continue
    }
    if (ln.startsWith('\\')) continue
    oldLine++
    newLine++
  }
  return { add, del }
}

export async function sincronizarOverviewGit(caminho) {
  if (!deps.getEditor()?.overviewDiff || !caminho) return
  try {
    const raiz = raizWorkspaceDe(caminho) || state.pastaAtual
    if (!raiz) {
      deps.getEditor().overviewDiff({ del: [], add: [], ia: [] })
      return
    }
    const rel = relPosix(caminho, raiz)
    const r = await window.api.invoke('git:diff', raiz, rel)
    const { add, del } = parseDiffLinhasOverview(r?.diff || '')
    deps.getEditor().overviewDiff({ del, add, ia: [] })
    deps.getEditor().overviewRefresh?.()
  } catch {
    deps.getEditor().overviewDiff({ del: [], add: [], ia: [] })
  }
}

export async function fecharAba(caminho) {
  cancelarAutosave()
  const barAbas = $('editor-tabs')
  const focoEmAbas = !!barAbas && barAbas.contains(document.activeElement)
  const a = state.abas.find((x) => x.caminho === caminho)
  if (!a) return
  if (caminho === state.abaAtiva && deps.getEditor()) a.dirty = deps.getEditor().isDirty()
  if (a.dirty) {
    const resp = await perguntarDirty(caminho)
    if (resp === 'cancelar') return
    if (resp === 'salvar') {
      if (caminho === state.abaAtiva) {
        const ok = await salvarArquivoAtivo()
        if (!ok) return
      } else {
        // precisa ativar para salvar conteúdo atual no deps.getEditor() — se não é ativa e dirty, conteúdo perdido
        // state.abas dirty só se estavam ativas e editadas; ao trocar syncamos. OK.
        await ativarAba(caminho)
        const ok = await salvarArquivoAtivo()
        if (!ok) return
      }
    }
  }
  const idx = state.abas.findIndex((x) => x.caminho === caminho)
  state.abas.splice(idx, 1)
  if (state.abaAtiva === caminho) {
    state.abaAtiva = null
    if (state.abas.length) {
      const next = state.abas[Math.min(idx, state.abas.length - 1)]
      await ativarAba(next.caminho)
    } else {
      deps.getEditor()?.limpar()
      limparHistoricoAbas()
      atualizarBreadcrumb()
      atualizarEmpty()
      renderizarAbas()
    }
  } else {
    renderizarAbas()
  }
  if (focoEmAbas && state.abas.length) {
    barAbas.querySelector('.editor-tab.active')?.focus()
  }
  persistirAbas()
}

const LS_AUTOSAVE_MS = 'dg.editor.autosave.ms'
let autosaveTimer = null
export function autosaveMs() {
  const n = Number(localStorage.getItem(LS_AUTOSAVE_MS) || 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}
export function cancelarAutosave() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
    autosaveTimer = null
  }
}
export function agendarAutosave() {
  cancelarAutosave()
  const ms = autosaveMs()
  if (!ms || !state.abaAtiva || !deps.getEditor()) return
  if (!deps.getEditor().isDirty()) return
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null
    if (!state.abaAtiva || !deps.getEditor()?.isDirty()) return
    void salvarArquivoAtivo({ silencioso: true })
  }, ms)
}

export async function salvarArquivoAtivo(opcoes = {}) {
  if (!state.abaAtiva || !deps.getEditor()) return false
  cancelarAutosave()
  if (/.json$/i.test(state.abaAtiva)) await deps.getEditor().formatar?.()
  const conteudo = deps.getEditor().getConteudo()
  let r
  if (state.vaultRaiz && deps.caminhoNoVault(state.abaAtiva) && ehMarkdown(state.abaAtiva)) {
    r = await window.api.invoke('vault:salvar', state.abaAtiva, conteudo, pastasPermitidas())
    if (r?.ok) void atualizarPainelVault(state.abaAtiva)
  } else {
    r = await window.api.invoke('arquivo:salvar', state.abaAtiva, conteudo, pastasPermitidas())
  }
  if (!r || !r.ok) {
    const msg = 'Erro ao salvar: ' + ((r && r.erro) || 'erro')
    mostrarToast(msg, 'erro')
    return false
  }
  deps.getEditor().marcarSalvo()
  const a = state.abas.find((x) => x.caminho === state.abaAtiva)
  if (a) a.dirty = false
  renderizarAbas()
  if (!opcoes.silencioso) mostrarToast('Salvo: ' + deps.nomeArquivo(state.abaAtiva), 'ok')
  return true
}


export async function initEditor() {
  const { criarEditor } = await carregarModuloEditor()
  if (deps.getEditor()) return deps.getEditor()
  const mount = $('editor-mount')
  deps.setEditor(criarEditor(mount, {
    onDiagnostics: (lista) => atualizarDiagEditor(lista),
    onChange: () => {
      const a = state.abas.find((x) => x.caminho === state.abaAtiva)
      if (!a || !deps.getEditor()) return
      const dirty = deps.getEditor().isDirty()
      if (a.dirty !== dirty) {
        a.dirty = dirty
        renderizarAbas()
      }
      deps.getEditor().overviewRefresh?.()
      agendarAutosave()
    },
    onSave: () => {
      salvarArquivoAtivo()
    }
  }))
  aplicarMinimapa(localStorage.getItem(LS_MINIMAP) !== '0')
  return deps.getEditor()
}

export function ciclarAbas() {
  if (state.abas.length < 2) return
  const idx = state.abas.findIndex((a) => a.caminho === state.abaAtiva)
  const next = state.abas[(idx + 1) % state.abas.length]
  ativarAba(next.caminho)
}

// ---------- Erros tipados (Block 7) ----------
// Implementação em features/ui/erros.js

// ---------- Análise ----------
// ---------- Chat ----------

function ligarAutosaveSeletor() {
  const sel = $('editor-autosave')
  if (!sel) return
  const atual = String(autosaveMs())
  if (![...sel.options].some((o) => o.value === atual)) sel.value = '0'
  else sel.value = atual
  sel.addEventListener('change', () => {
    localStorage.setItem(LS_AUTOSAVE_MS, String(Number(sel.value) || 0))
    cancelarAutosave()
    agendarAutosave()
  })
}

export function ligarAbasCore() {
  ligarAutosaveSeletor()
}
