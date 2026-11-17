// DG Editor - renderer (IDE Opção B)
import { mostrarRegrasUI } from './regras-ui.js'
// Editor (CodeMirror) e terminal (xterm) carregam sob demanda: pesam no boot
// e so sao necessarios quando o usuario abre um arquivo/painel.
let moduloEditorPromise = null
function carregarModuloEditor() {
  moduloEditorPromise ??= import('./editor-cm.js')
  return moduloEditorPromise
}
let moduloTerminalPromise = null
function carregarModuloTerminal() {
  moduloTerminalPromise ??= import('./terminal.js')
  return moduloTerminalPromise
}
import { registrarComando, listarComandosLocais, executarComandoLocal } from './comandos.js'
import {
  ligarHistoricoChat,
  novaConversaUi,
  abrirOrientadorPrompt,
  fecharOrientadorPrompt,
  ligarPainelOrientador,
  configurarHistoricoOrientador
} from './features/chat/historico-orientador.js'
import {
  mostrarLoadingChat,
  removerLoadingChat,
  marcarProviderFallback,
  animarEntradaMsg
} from './chat.js'
import { ligarFerramentas } from './ferramentas-ui.js'
import { tempoRelativoCommit } from './utils/format.js'
import { escapar } from './utils/dom.js'
import { instalarTrapFocoModais } from './utils/focus-trap.js'
import { anunciar } from './features/ui/live-region.js'
import { abrirJanelaFlutuante, iniciarJanelasFlutuantes } from './features/ui/janelas-flutuantes.js'
import { mostrarToast } from './features/ui/toast.js'
import { dgNormalizarErro, mostrarErroTipado } from './features/ui/erros.js'
import { recontarUsoChat, registrarUsoTurno } from './features/chat/uso.js'
import { obterReposGit, atualizarStatusBar } from './features/ui/repos-status.js'
import { atualizarDownloadUi, ligarDownloadUi } from './features/ui/download-status.js'
import {
  configurarPreviewMd,
  ehMarkdown,
  ehImagemExt,
  atualizarToolbarPreview,
  toggleMdPreview,
  sincronizarPreviewMdAba
} from './features/editor/preview-md.js'
import { mostrarImagem, esconderImagem } from './features/editor/imagem.js'
import {
  configurarAbasUi,
  persistirAbas,
  restaurarAbas,
  renderizarAbas,
  atualizarEmpty,
  atualizarBreadcrumb,
  perguntarDirty,
  fecharDirtyModal,
  ligarAbasUi
} from './features/editor/abas-ui.js'
import {
  configurarHistoricoAbas,
  limparHistoricoAbas,
  atualizarBotoesHist,
  registrarHistAba,
  irHistAbas
} from './features/editor/historico-abas.js'
import { configurarChatCtx, initChatIconContext } from './features/chat/context-menu.js'
import { mostrarEditorDiffBar, ocultarEditorDiffBar } from './features/ui/diff-bar.js'
import {
  configurarSkillChip,
  skillAtivaChat,
  definirSkillChat
} from './features/chat/skill-chip.js'
import { obterAnexosChat, limparAnexosChat, ligarAnexosChat } from './features/chat/anexos.js'
import { abrirModalReinicio, fecharModalReinicio, perguntarEscolha } from './features/ui/escolha-modal.js'
import {
  configurarDiagnosticos,
  atualizarDiagEditor,
  aplicarMinimapa,
  ligarMinimapa,
  LS_MINIMAP
} from './features/editor/diagnosticos.js'
import {
  configurarConfigContas,
  abrirConfig,
  abrirContas,
  rodarDiagnostico,
  rodarBackupOneDrive,
  copiarContinuidadeAdapta,
  copiarMcpAdapta,
  atualizarPainelAdapta
} from './features/ui/config-contas.js'
import {
  configurarPaleta,
  abrirPaletaComandos,
  abrirPaletaArquivos,
  fecharPaleta,
  abrirBuscaGlobal,
  fecharBuscaGlobal,
  renderizarPaleta,
  executarItemPaleta,
  rodarBuscaGlobal,
  destacarPaleta
} from './features/ui/paleta.js'
import {
  atualizarIndicadorDeps,
  atualizarBadgeProvedor,
  atualizarChipMemoria,
  atualizarBadgeProvedorReal
} from './features/ui/deps-status.js'
import {
  lerPreferenciasA11y,
  salvarPreferenciasA11y,
  aplicarPreferenciasA11y,
  ajustarZoomUi,
  ajustarFontePainelUi
} from './features/ui/acessibilidade.js'
import { iniciarGuardian } from './features/guardian/index.js'
import { relPosix, badgeGitHtml, corGit, gitStatusMap } from './features/arquivos/git-helpers.js'
import { CHEV, renderizarArvoreEm as _renderizarArvoreEm, criarNoDir as _criarNoDir, criarNoFile as _criarNoFile } from './features/arquivos/tree-render.js'
import { caminhoSobPasta, salvarPastas, carregarPastas, adicionarPastaState, removerPastaDoState, reapontarPastaState } from './features/arquivos/recentes.js'
import { pastasPermitidas, carregarFilhos as _carregarFilhos } from './features/arquivos/index.js'
import {
  configurarArvoreRender,
  renderizarArvoreEm,
  carregarFilhos,
  criarNoDir,
  criarNoFile,
  atualizarGitStatusArvore,
  renderizarPastas,
  renderizarProjects,
  setSidebarMode,
  ligarArvoreRender
} from './features/arquivos/arvore-render.js'
import {
  configurarAnalise,
  habilitarBotoesAnalise,
  analisarCompleta,
  escolherEscopoAnalise,
  rodarAnalise,
  renderizarAnalise,
  buscarOndeEsta
} from './features/analise/acoes.js'
import { configurarMenubar, initMenubar } from './features/ui/menubar.js'
import { configurarArvore, initMenuCtxArvore } from './features/arquivos/arvore-acoes.js'
import {
  configurarAgenteSeletor,
  initChatAgentSelector,
  carregarOpcoesAgenteChat,
  carregarAgentesUi,
  atualizarStatusAgent,
  agenteSelecionadoUi,
  sincronizarAgenteSelects
} from './features/chat/agente-seletor.js'
import {
  configurarChatCore,
  markupEmptyStateChat,
  ligarEmptyStateChat,
  garantirEmptyStateChat,
  renderizarChat,
  marcarChatComMsgs,
  setChatLiveStatus,
  ligarAcoesBolha,
  reeditarMensagemUsuario,
  adicionarBolha,
  setChatSendMode,
  limparUiAgenteChat,
  pararChatOuAgente,
  appendChatToolTrace,
  chatOcupado,
  obterHistChat,
  definirHistChat
} from './features/chat/chat-core.js'
import { agenteEstado } from './features/chat/agente-estado.js'
import {
  configurarAgenteCards,
  renderAgentTrace,
  appendAgentTraceLive,
  atualizarChatPlanoCard,
  atualizarChatApplyCard,
  mostrarChatRestoreAposApply,
  aplicarUmaPropostaAgent,
  mostrarPropostasAgent,
  ligarProgressoAgent,
  ligarAnuncioEtapasAgente,
  coletarAbasCtx,
  coletarErrosEditor,
  renderPlanoChecklist,
  refrescarPlanoUi,
  executarAgentUi,
  ligarPainelAgente
} from './features/chat/agente-cards.js'
import {
  configurarDiffPendentes,
  renderDiffHtml,
  abrirPainelDiff,
  fecharPainelDiff,
  anunciarEtapaAgente,
  previewDiffNoEditor,
  mostrarDiffOpenClaw,
  renderListaPendentesOc,
  pedirOpenClawUi,
  oferecerCommitAposApply,
  aplicarPendenteOc,
  aplicarHunksSelecionadosOc,
  rejeitarPendenteOc,
  carregarConfigOpenClawUi,
  salvarConfigOpenClawUi
} from './features/editor/diff-pendentes.js'
import {
  configurarPaineis,
  clamparLayout,
  carregarLayout,
  initResizers,
  toggleSidebar,
  sincronizarBotoesPainelDireito,
  toggleRight,
  setActivityActive,
  abrirTerminalNoBloco3,
  alternarTerminalNoBloco3
} from './features/layout/paineis.js'
import {
  configurarPanes,
  ativarPainelCentro,
  focarPainelIa,
  focarRegiao,
  ativarAbaDireita,
  ativarAbaCentro
} from './features/layout/panes.js'
import { configurarEnviar, enviarMensagem } from './features/chat/enviar.js'
import { normalizarMensagensChat, bolhaHtml, organizarRespostaCursor } from './features/chat/render.js'
import {
  humanizarStatus,
  humanizarToolInicio,
  humanizarToolFim,
  atualizarCartaoTrabalho,
  fecharCartaoTrabalho
} from './features/chat/progresso-humano.js'
import {
  criarStatsVazios,
  aplicarEventoStats,
  pintarStatsNoCartao,
  pedidoExigeAgentMode,
  mostrarBannerAgentMode,
  ocultarBannerAgentMode
} from './features/chat/agent-activity.js'
import {
  renderChatPlanoCard,
  renderChatApplyCard,
  renderChatRestoreStrip,
  ocultarChatRestoreStrip,
  limparChatParityCards
} from './features/chat/chat-parity.js'
import { ligarContextMenuDg } from './features/ui/context-menu.js'
import { dgAlert, dgConfirm, ligarDialogosDoMain } from './features/ui/dg-dialog.js'
import { ligarAutomacaoAprovacao } from './features/ui/automation-aprovacao.js'
import { abrirSobreDgEditor } from './features/ui/sobre.js'
import {
  abrirAssistenteNovo,
  ligarAssistenteNovo,
  ligarRightRail
} from './features/chat/assistente-novo.js'
import {
  ligarWorkspaceAutosave,
  agendarSalvarWorkspace,
  flushWorkspace,
  coletarWorkspacePadrao,
  restaurarWorkspaceNoBoot
} from './workspace-ui.js'
import { ligarExtrasUi } from './extras-ui.js'
import { nomeAmigavelArquivo, formatNomePastaUi } from './utils/nomes-amigaveis.js'
import {
  registrarJob,
  atualizarJob,
  removerJob,
  jobDaPasta,
  pastaTemJob,
  pintarSidebarJobs,
  algumJobAtivo
} from './features/chat/jobs-paralelos.js'
import { iniciarComposer } from './features/chat/composer.js'
import { aplicarTema, alternarTema as _alternarTema, carregarTema as _carregarTema } from './features/ui/tema.js'
import { ligarAcoesBolha as _ligarAcoesBolha, reeditarMensagemUsuario as _reeditarMensagemUsuario } from './features/chat/reeditar.js'
import { criarBrowserBloco3 } from './features/layout/browser-bloco3.js'

const $ = (id) => document.getElementById(id)

import { state, setPastaAtual } from './state/app-state.js'
ligarFerramentas(() => state.pastaAtual)
configurarPaleta({ abrirArquivoNaAba, executarComando })
/** @type {{ caminho: string, nome: string, dirty: boolean }[]} initialized in state */
state.abas = state.abas || []
state.abaAtiva = state.abaAtiva ?? null
/** @type {any} */
let editor = null
// modoPaleta movido para features/ui/paleta.js
/** #files-list precisa re-render quando a aba Files for ativada. */
let filesListaSuja = false
/** Histórico de navegação de abas: features/editor/historico-abas.js */
// state.vaultRaiz migrado para state/app-state.js


function caminhoNoVault(caminho) {
  if (!state.vaultRaiz || !caminho) return false
  return caminhoSobPasta(caminho, state.vaultRaiz)
}

function nomeArquivo(p) {
  const s = String(p || '').replace(/\//g, '\\')
  const i = s.lastIndexOf('\\')
  return i >= 0 ? s.slice(i + 1) : s
}

/** Nome amigável na UI (DGEditor → DG Editor). */
function nomePastaUi(p) {
  return formatNomePastaUi(p) || nomeArquivo(p)
}

function caminhoRelativo(abs) {
  const a = String(abs || '')
  for (const raiz of state.pastasRecentes) {
    const r = String(raiz)
    if (a === r) return nomeArquivo(r)
    const sep = r.endsWith('\\') || r.endsWith('/') ? '' : '\\'
    if (a.toLowerCase().startsWith((r + sep).toLowerCase())) {
      return a.slice(r.length + sep.length).replace(/\//g, '\\')
    }
  }
  return nomeArquivo(a)
}

function extIcon(nome) {
  const m = String(nome).toLowerCase().match(/\.([a-z0-9]+)$/)
  const ext = m ? m[1] : ''
  const label = (ext || '·').slice(0, 3).toUpperCase()
  return `<span class="file-icon ext-${ext || 'txt'}">${label}</span>`
}


/** Navegador Bloco 3 — módulo dedicado (bounds/status/IPC). */
const browserBloco3 = criarBrowserBloco3({
  $,
  toggleRight: (f) => toggleRight(f),
  ativarAbaDireita: (p) => ativarAbaDireita(p)
})
let browserMountObserver = null
const setBrowserStatus = (aberto) => browserBloco3.setStatus(aberto)
const enviarBoundsBrowser = () => browserBloco3.enviarBounds()
const setBrowserVisivel = (mostrar) => browserBloco3.setVisivel(mostrar)
const abrirNavegadorUi = (url) => browserBloco3.abrir(url)
const abrirNavegadorNoBloco3 = (url) => browserBloco3.abrirNoBloco3(url)

function initActivityBar() {
  document.querySelectorAll('#activity-bar .ab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.action
      if (a === 'explorer') {
        toggleSidebar()
        setActivityActive('explorer', !$('app').classList.contains('sidebar-collapsed'))
      } else if (a === 'busca') {
        abrirPaletaArquivos()
      } else if (a === 'chat') {
        focarPainelIa('chat')
      } else if (a === 'tema') {
        void alternarTema()
      }
    })
  })
  // Tema também no rodapé da sidebar (statusbar)
  $('btn-tema')?.addEventListener('click', () => void alternarTema())
}


$('browser-abrir')?.addEventListener('click', () => {
  toggleRight(true)
  ativarAbaDireita('browser')
  const url = /** @type {HTMLInputElement|null} */ ($('browser-url'))?.value
  void abrirNavegadorUi(url)
})
$('browser-abrir-inline')?.addEventListener('click', () => {
  const url = /** @type {HTMLInputElement|null} */ ($('browser-url'))?.value
  void abrirNavegadorUi(url || undefined)
})
$('browser-url')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    $('browser-abrir')?.click()
  }
})
$('browser-atualizar')?.addEventListener('click', async () => {
  try {
    const r = await window.api.invoke('navegador:recarregar')
    if (r?.ok) return
  } catch {
    /* fallback abrir */
  }
  const url = /** @type {HTMLInputElement|null} */ ($('browser-url'))?.value
  void abrirNavegadorUi(url || undefined)
})
$('browser-voltar')?.addEventListener('click', async () => {
  try {
    await window.api.invoke('navegador:voltar')
  } catch {
    /* canal opcional */
  }
})
try {
  window.api.on?.('navegador:aberto', () => {
    setBrowserStatus(true)
    setBrowserVisivel($('pane-browser')?.classList.contains('active'))
  })
  window.api.on?.('navegador:fechado', () => {
    setBrowserStatus(false)
    setBrowserVisivel(false)
  })
  window.api.on?.('navegador:download', (_e, info) => {
    const i = info && typeof info === 'object' ? info : {}
    if (i.ok) mostrarToast('Download salvo: ' + (i.nomeSalvo || 'arquivo'), 'ok')
    else mostrarToast('Download falhou: ' + (i.estado || 'erro'), 'erro')
  })
  window.api.on?.('navegador:download-progresso', (_e, p) => {
    atualizarDownloadUi(p)
  })
} catch {
  /* preload antigo */
}

window.addEventListener('resize', () => {
  if ($('pane-browser')?.classList.contains('active') && browserBloco3.isAberto()) {
    enviarBoundsBrowser()
  }
})
;(() => {
  const m = $('browser-mount')
  if (!m || typeof ResizeObserver === 'undefined') return
  browserMountObserver = new ResizeObserver(() => {
    if ($('pane-browser')?.classList.contains('active') && browserBloco3.isAberto()) {
      enviarBoundsBrowser()
    }
  })
  browserMountObserver.observe(m)
})()


document.querySelectorAll('.right-tab').forEach((t) => {
  t.addEventListener('click', () => ativarAbaDireita(t.dataset.pane))
})
document.querySelectorAll('.center-tab').forEach((t) => {
  t.addEventListener('click', () => {
    ativarPainelCentro(t.dataset.center === 'editor' ? 'editor' : 'chat')
    if (t.dataset.center === 'chat') setTimeout(() => $('chat-input')?.focus(), 0)
  })
})

// Bridge para terminal.js (toggle Ctrl+` / icon-bar) sem import circular
window.abrirArquivoNaAba = abrirArquivoNaAba
// Hook de QA: zera abas de forma determinística (a limpeza via DOM trava
// quando há abas dirty órfãs acumuladas pela suíte e2e).
window.__dgTestLimparAbas = () => {
  state.abas = []
  state.abaAtiva = null
  editor?.limpar?.()
  limparHistoricoAbas()
  atualizarBreadcrumb?.()
  atualizarEmpty?.()
  renderizarAbas()
  persistirAbas()
}
window.dgUi = {
  toggleRight,
  ativarAbaDireita,
  ativarAbaCentro,
  ativarPainelCentro,
  focarPainelIa
}

// ---------- Pastas ----------
async function abrirPasta() {
  const r = await window.api.invoke('folder:select')
  if (r.canceled) return
  adicionarPasta(r.path)
  await selecionarPasta(r.path)
}

async function abrirVault() {
  const r = await window.api.invoke('vault:abrir')
  if (r?.canceled) return
  if (!r?.ok) {
    alert('Não foi possível abrir o vault: ' + (r?.erro || 'erro'))
    return
  }
  state.vaultRaiz = r.raiz
  adicionarPasta(r.raiz)
  await selecionarPasta(r.raiz)
  const sec = $('vault-section')
  if (sec) sec.hidden = false
  const st = $('vault-status')
  if (st) st.textContent = nomeArquivo(r.raiz) + ' · ' + (r.total || 0) + ' notas'
  await atualizarPainelVault(state.abaAtiva)
}

async function fecharVault() {
  await window.api.invoke('vault:fechar')
  state.vaultRaiz = null
  const sec = $('vault-section')
  if (sec) sec.hidden = true
  const st = $('vault-status')
  if (st) st.textContent = 'Nenhum vault'
  const bl = $('vault-backlinks')
  if (bl) bl.innerHTML = ''
  const tg = $('vault-tags')
  if (tg) tg.innerHTML = ''
}

async function atualizarPainelVault(caminho) {
  if (!state.vaultRaiz) return
  const bl = $('vault-backlinks')
  const tg = $('vault-tags')
  if (bl) {
    bl.innerHTML = ''
    if (caminho && caminhoNoVault(caminho) && ehMarkdown(caminho)) {
      const r = await window.api.invoke('vault:backlinks', caminho)
      const itens = r?.backlinks || []
      if (!itens.length) {
        bl.innerHTML = '<span class="muted">Nenhum backlink</span>'
      } else {
        for (const n of itens) {
          const b = document.createElement('button')
          b.type = 'button'
          b.textContent = n.titulo || n.rel
          b.title = n.rel
          b.addEventListener('click', () => void abrirArquivoNaAba(n.path))
          bl.appendChild(b)
        }
      }
    } else {
      bl.innerHTML = '<span class="muted">Abra uma nota do vault</span>'
    }
  }
  if (tg) {
    tg.innerHTML = ''
    const r = await window.api.invoke('vault:tags')
    const tags = r?.tags || {}
    const keys = Object.keys(tags).sort((a, b) => a.localeCompare(b))
    if (!keys.length) {
      tg.innerHTML = '<span class="muted">Sem tags</span>'
    } else {
      for (const k of keys.slice(0, 40)) {
        const b = document.createElement('button')
        b.type = 'button'
        b.textContent = '#' + k + ' (' + tags[k].length + ')'
        b.title = tags[k].map((x) => x.rel).join(', ')
        b.addEventListener('click', () => {
          const first = tags[k][0]
          if (first) void abrirArquivoNaAba(first.path)
        })
        tg.appendChild(b)
      }
    }
  }
}

async function abrirWikiLink(alvo) {
  if (!state.vaultRaiz) {
    alert('Abra um vault para resolver [[links]].')
    return
  }
  const r = await window.api.invoke('vault:resolver-link', alvo, state.abaAtiva || undefined)
  if (!r?.path) {
    alert('Nota não encontrada: [[' + alvo + ']]')
    return
  }
  await abrirArquivoNaAba(r.path)
  void atualizarPainelVault(r.path)
}

function adicionarPasta(path) {
  adicionarPastaState(path)
  renderizarPastas()
  void renderizarProjects(true)
  void atualizarStatusBar(path)
}

async function escolherNovoCaminhoPasta(antigo) {
  try {
    const r = await window.api.invoke('folder:select')
    if (!r || r.canceled || !r.path) return
    const novo = r.path
    if (novo === antigo) return
    if (state.pastasRecentes.includes(novo)) {
      await removerPasta(antigo, { skipConfirm: true })
      await selecionarPasta(novo)
      return
    }
    reapontarPastaState(antigo, novo)
    await renderizarPastas()
    void renderizarProjects(true)
    await selecionarPasta(novo)
  } catch (e) {
    mostrarToast('Não foi possível alterar o caminho: ' + String(e), 'erro')
  }
}

function criarBotaoRemoverPasta(path) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'pasta-remover'
  btn.title = 'Remover da lista'
  btn.setAttribute('aria-label', 'Remover pasta ' + nomeArquivo(path))
  btn.textContent = '\u00D7'
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    void removerPasta(path)
  })
  return btn
}


/** Controle do PC: pede permissão explícita (sessão). */
function desktopPermitido() {
  try {
    return sessionStorage.getItem('dg-desktop-use') === '1'
  } catch {
    return false
  }
}

function pedirPermissaoDesktop() {
  let modal = $('modal-desktop-use')
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'modal-desktop-use'
    modal.className = 'modal hidden'
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    modal.innerHTML =
      '<div class="modal-box modal-desktop-box">' +
      '<h3>Controle do computador</h3>' +
      '<p class="muted">O Agent pode abrir o navegador embutido, terminal e testar navegação. ' +
      'Ele <strong>pede antes</strong> de agir fora do editor. Conceder só nesta sessão?</p>' +
      '<div class="desktop-perm-actions">' +
      '<button type="button" class="btn-ghost" id="desktop-use-negar">Agora não</button>' +
      '<button type="button" class="btn-primary" id="desktop-use-ok">Permitir nesta sessão</button>' +
      '</div></div>'
    document.body.appendChild(modal)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden')
    })
    modal.querySelector('#desktop-use-negar')?.addEventListener('click', () => {
      try { sessionStorage.setItem('dg-desktop-use', '0') } catch {}
      modal.classList.add('hidden')
      mostrarToast('Controle do PC negado nesta sessão', 'aviso')
      $('btn-desktop-use')?.classList.remove('active')
    })
    modal.querySelector('#desktop-use-ok')?.addEventListener('click', () => {
      try { sessionStorage.setItem('dg-desktop-use', '1') } catch {}
      modal.classList.add('hidden')
      mostrarToast('Controle do PC permitido nesta sessão', 'ok')
      $('btn-desktop-use')?.classList.add('active')
      toggleRight(true)
      ativarAbaDireita('browser')
      appendChatToolTrace('… Controle do PC autorizado — posso usar Navegador/Terminal no bloco 3')
      setChatLiveStatus('Controle do PC ativo')
    })
  }
  if (desktopPermitido()) {
    mostrarToast('Controle do PC já está ativo nesta sessão', 'ok')
    $('btn-desktop-use')?.classList.add('active')
    return
  }
  modal.classList.remove('hidden')
}

window.dgDesktopPedir = pedirPermissaoDesktop
window.dgDesktopPermitido = desktopPermitido

async function removerPasta(path, opts) {
  if (!path || !state.pastasRecentes.includes(path)) return
  const nome = nomeArquivo(path)
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
    editor?.limpar()
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
    habilitarBotoesAnalise(false)
    garantirEmptyStateChat()
    definirHistChat(null)
  }
  await renderizarPastas()
  void renderizarProjects(true)
  if (typeof atualizarStatusBar === 'function') void atualizarStatusBar(state.pastaAtual)
}

/** Garante a raiz do projeto no Explorer (evita "Nenhuma pasta" no primeiro boot). */
async function garantirPastaRaizProjeto() {
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
      await selecionarPasta(raiz)
    }
  } catch (e) {
    console.warn('[pastas] raiz projeto:', e)
  }
}

async function selecionarPasta(path) {
  console.time('selecionarPasta')
  ativarAbaCentro('chat')

  // Árvore: marcar expandida no Map (não obrigatório abrir filhos para contexto)
  if (!state.estadoArvore.has(path)) {
    state.estadoArvore.set(path, { expandida: true, filhosCarregados: false })
  } else {
    state.estadoArvore.get(path).expandida = true
  }

  // Contexto bloco 2/3 imediato (chat + análise + histórico)
  await sincronizarContextoPasta(path, { forceAnalise: true })

  // Filhos da árvore em paralelo (não bloqueia chat/análise)
  const raizEl = document.querySelector('.tree-root[data-path="' + CSS.escape(path) + '"]')
  if (raizEl) {
    const children = raizEl.querySelector(':scope > .tree-children')
    const chev = raizEl.querySelector('.chevron')
    if (children) {
      chev?.classList.add('open')
      children.classList.add('open')
      if (children.childElementCount === 0) {
        void carregarFilhos(path, children, 1)
      }
    }
  }

  void atualizarGitStatusArvore()
  window.api.invoke('rules:exists', path).then((temRegras) => {
    if (!temRegras) window.api.invoke('rules:create-template', path).catch(() => {})
  }).catch(() => {})

  console.timeEnd('selecionarPasta')
}

// ---------- Árvore ----------
/**
 * Contexto bloco 2 (chat/editor) + bloco 3 (análise/execução):
 * sempre segue a pasta/workspace selecionada. Fluido — sem esperar expandir árvore.
 */
function definirContextoPasta(p) {
  if (!p) return
  void sincronizarContextoPasta(p)
}

function resolverPastaChatAtiva() {
  const cand =
    state.pastaAtual ||
    window.__DG_PASTA_ATUAL__ ||
    (Array.isArray(state.pastasRecentes) && state.pastasRecentes[0]) ||
    ''
  return typeof cand === 'string' ? cand.trim() : ''
}

async function sincronizarContextoPasta(p, opts = {}) {
  if (!p) return
  const mudou = state.pastaAtual !== p
  if (mudou) {
    delete $('analysis-content')?.dataset.jaAnalisou
  }
  state.pastaAtual = p
  try {
    window.__DG_PASTA_ATUAL__ = p
  } catch {
    /* */
  }
  try {
    await window.api.invoke('workspace:definir-raiz', p)
  } catch {
    /* main ainda sem canal em builds antigos */
  }
  agendarSalvarWorkspace()
  void carregarOpcoesAgenteChat(p)
  void atualizarStatusBar(p)
  const titulo = $('chat-title')
  if (titulo) titulo.textContent = nomePastaUi(p)
  const send = $('chat-send')
  if (send) send.disabled = false
  habilitarBotoesAnalise(true)
  $('empty-state')?.remove()
  // Restaura cartão / botão Stop se este repo tem Agent em andamento
  const jobAtivo = jobDaPasta(p)
  if (jobAtivo) {
    setChatSendMode('stop')
    atualizarCartaoTrabalho($('chat-messages'), {
      titulo: jobAtivo.tituloCard || 'Trabalhando…',
      passo: jobAtivo.passo || 'Agent em andamento…',
      elapsedSec: (Date.now() - (jobAtivo.iniciadoEm || Date.now())) / 1000
    })
    if (jobAtivo.stats) pintarStatsNoCartao($('chat-messages'), jobAtivo.stats)
    setChatLiveStatus(jobAtivo.passo || 'Trabalhando…')
  } else if (!algumJobAtivo() || !pastaTemJob(p)) {
    setChatSendMode('send')
  }
  pintarSidebarJobs(() => state.pastaAtual)

  document.querySelectorAll('.tree-root.selected').forEach((el) => el.classList.remove('selected'))
  const raizEl = document.querySelector('.tree-root[data-path="' + CSS.escape(p) + '"]')
  if (raizEl) raizEl.classList.add('selected')

  if (opts.chatId) {
    try {
      localStorage.setItem('dg-chat-ativo', opts.chatId)
    } catch {
      /* */
    }
  }

  const tarefas = [ligarHistoricoChat(p)]
  if (mudou || opts.forceAnalise) {
    tarefas.push(
      window.api
        .invoke('analysis:cached', p)
        .then((cached) => {
          const box = $('analysis-content')
          if (!box) return
          const payload = cached && cached.ok === false ? null : cached && cached.result !== undefined ? cached.result : cached
          const rep =
            payload && typeof payload === 'object'
              ? payload.report && typeof payload.report === 'object'
                ? payload.report
                : payload
              : null
          const temRelatorio = !!(rep && (rep.oQueE || rep.stack || rep.estrutura || (rep.pontosAtencao && rep.pontosAtencao.length)))
          if (temRelatorio) {
            renderizarAnalise(rep, !!(payload && payload.fromCache))
          } else if (mudou) {
            box.innerHTML =
              '<p class="muted">Pasta ativa: <strong>' +
              nomeArquivo(p) +
              '</strong>. Nenhuma análise salva ainda — use <strong>Análise rápida</strong> ou <strong>Análise completa</strong> acima.</p>'
          }
        })
        .catch(() => {})
    )
  }
  await Promise.all(tarefas)
  void obterHistChat()?.refrescarLista?.()
}

function raizWorkspaceDe(caminho) {
  const a = String(caminho || '')
  for (const r of state.pastasRecentes) {
    if (!r) continue
    if (a === r) return r
    const sep = r.endsWith('\\') || r.endsWith('/') ? '' : '\\'
    if (a.toLowerCase().startsWith((r + sep).toLowerCase())) return r
  }
  return state.pastaAtual
}

$('diff-panel-close')?.addEventListener('click', () => fecharPainelDiff())
$('editor-diff-bar-apply')?.addEventListener('click', async () => {
  const id = $('editor-diff-bar')?.dataset?.propostaId
  if (!id) return
  await aplicarUmaPropostaAgent(id)
  if (editor && editor.limparDiff) editor.limparDiff()
  ocultarEditorDiffBar()
})
$('editor-diff-bar-reject')?.addEventListener('click', async () => {
  const id = $('editor-diff-bar')?.dataset?.propostaId
  if (!id) return
  window.__dgApplyViaAgente = true
  await window.api.invoke('agente:rejeitar-proposta', id)
  const rest = await window.api.invoke('agente:propostas')
  mostrarPropostasAgent(rest?.pendentes || [])
  if (editor && editor.limparDiff) editor.limparDiff()
  ocultarEditorDiffBar()
  fecharPainelDiff()
  if (window.dgToast) window.dgToast('Proposta rejeitada', 'aviso')
})
setInterval(() => {
  if (document.hidden || !state.pastaAtual) return
  void atualizarGitStatusArvore()
}, 5000)

// ---------- Abas + editor ----------
async function abrirArquivoNaAba(caminho, linha) {
  // exportada para ferramentas-ui
  ativarAbaCentro('editor')
  const existente = state.abas.find((a) => a.caminho === caminho)
  if (existente) {
    await ativarAba(caminho)
    if (linha) {
      if (!editor) await initEditor()
      editor?.irParaLinha?.(linha)
    }
    return
  }
  if (ehImagemExt(caminho)) {
    syncDirtyAtiva()
    state.abas.push({ caminho, nome: nomeArquivo(caminho), dirty: false, imagem: true })
    state.abaAtiva = caminho
    registrarHistAba(caminho)
    if (!editor) await initEditor()
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
  state.abas.push({ caminho, nome: nomeArquivo(caminho), dirty: false })
  await ativarAba(caminho, r.conteudo)
  persistirAbas()
  if (linha) {
    if (!editor) await initEditor()
    editor?.irParaLinha?.(linha)
  }
}

function syncDirtyAtiva() {
  if (!state.abaAtiva || !editor) return
  const a = state.abas.find((x) => x.caminho === state.abaAtiva)
  if (a) a.dirty = editor.isDirty()
}

async function ativarAba(caminho, conteudoPrevio) {
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
        mostrarToast('Aba fechada: "' + nomeArquivo(caminho) + '" não existe mais.', 'aviso')
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
    if (!editor) await initEditor()
    await mostrarImagem(caminho)
    renderizarAbas()
    atualizarBreadcrumb()
    atualizarEmpty()
    atualizarToolbarPreview(caminho)
    persistirAbas()
    return true
  }
  esconderImagem()
  if (!editor) await initEditor()
  editor.abrir(caminho, conteudo)
  const a = state.abas.find((x) => x.caminho === caminho)
  if (a) a.dirty = false
  renderizarAbas()
  atualizarBreadcrumb()
  atualizarEmpty()
  atualizarToolbarPreview(caminho)
  sincronizarPreviewMdAba(caminho, conteudo)
  editor.focar()
  persistirAbas()
  void atualizarPainelVault(caminho)
  void sincronizarOverviewGit(caminho)
  return true
}

/** Extrai linhas +/- do unified diff para a overview ruler. */
function parseDiffLinhasOverview(diffText) {
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

async function sincronizarOverviewGit(caminho) {
  if (!editor?.overviewDiff || !caminho) return
  try {
    const raiz = raizWorkspaceDe(caminho) || state.pastaAtual
    if (!raiz) {
      editor.overviewDiff({ del: [], add: [], ia: [] })
      return
    }
    const rel = relPosix(caminho, raiz)
    const r = await window.api.invoke('git:diff', raiz, rel)
    const { add, del } = parseDiffLinhasOverview(r?.diff || '')
    editor.overviewDiff({ del, add, ia: [] })
    editor.overviewRefresh?.()
  } catch {
    editor.overviewDiff({ del: [], add: [], ia: [] })
  }
}

async function fecharAba(caminho) {
  cancelarAutosave()
  const barAbas = $('editor-tabs')
  const focoEmAbas = !!barAbas && barAbas.contains(document.activeElement)
  const a = state.abas.find((x) => x.caminho === caminho)
  if (!a) return
  if (caminho === state.abaAtiva && editor) a.dirty = editor.isDirty()
  if (a.dirty) {
    const resp = await perguntarDirty(caminho)
    if (resp === 'cancelar') return
    if (resp === 'salvar') {
      if (caminho === state.abaAtiva) {
        const ok = await salvarArquivoAtivo()
        if (!ok) return
      } else {
        // precisa ativar para salvar conteúdo atual no editor — se não é ativa e dirty, conteúdo perdido
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
      editor?.limpar()
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
function autosaveMs() {
  const n = Number(localStorage.getItem(LS_AUTOSAVE_MS) || 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}
function cancelarAutosave() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
    autosaveTimer = null
  }
}
function agendarAutosave() {
  cancelarAutosave()
  const ms = autosaveMs()
  if (!ms || !state.abaAtiva || !editor) return
  if (!editor.isDirty()) return
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null
    if (!state.abaAtiva || !editor?.isDirty()) return
    void salvarArquivoAtivo({ silencioso: true })
  }, ms)
}

async function salvarArquivoAtivo(opcoes = {}) {
  if (!state.abaAtiva || !editor) return false
  cancelarAutosave()
  if (/.json$/i.test(state.abaAtiva)) await editor.formatar?.()
  const conteudo = editor.getConteudo()
  let r
  if (state.vaultRaiz && caminhoNoVault(state.abaAtiva) && ehMarkdown(state.abaAtiva)) {
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
  editor.marcarSalvo()
  const a = state.abas.find((x) => x.caminho === state.abaAtiva)
  if (a) a.dirty = false
  renderizarAbas()
  if (!opcoes.silencioso) mostrarToast('Salvo: ' + nomeArquivo(state.abaAtiva), 'ok')
  return true
}

{
  const sel = $('editor-autosave')
  if (sel) {
    const atual = String(autosaveMs())
    if (![...sel.options].some((o) => o.value === atual)) sel.value = '0'
    else sel.value = atual
    sel.addEventListener('change', () => {
      localStorage.setItem(LS_AUTOSAVE_MS, String(Number(sel.value) || 0))
      cancelarAutosave()
      agendarAutosave()
    })
  }
}

async function initEditor() {
  const { criarEditor } = await carregarModuloEditor()
  if (editor) return editor
  const mount = $('editor-mount')
  editor = criarEditor(mount, {
    onDiagnostics: (lista) => atualizarDiagEditor(lista),
    onChange: () => {
      const a = state.abas.find((x) => x.caminho === state.abaAtiva)
      if (!a || !editor) return
      const dirty = editor.isDirty()
      if (a.dirty !== dirty) {
        a.dirty = dirty
        renderizarAbas()
      }
      editor.overviewRefresh?.()
      agendarAutosave()
    },
    onSave: () => {
      salvarArquivoAtivo()
    }
  })
  aplicarMinimapa(localStorage.getItem(LS_MINIMAP) !== '0')
  return editor
}

function ciclarAbas() {
  if (state.abas.length < 2) return
  const idx = state.abas.findIndex((a) => a.caminho === state.abaAtiva)
  const next = state.abas[(idx + 1) % state.abas.length]
  ativarAba(next.caminho)
}

// ---------- Erros tipados (Block 7) ----------
// Implementação em features/ui/erros.js

// ---------- Análise ----------
// ---------- Chat ----------

function enviarMensagemUi() { void enviarMensagem() }
$('chat-send')?.addEventListener('click', enviarMensagemUi)
iniciarComposer($('chat-input'), { onEnviar: enviarMensagemUi })

/** Popover de contexto dos ícones do chat (clique → contexto → ação). */
initChatIconContext()
ligarAnexosChat()
ligarMinimapa()

// ---------- Janelas flutuantes (Config / Contas): arrastar + sempre à frente ----------
// Implementação em features/ui/janelas-flutuantes.js
iniciarJanelasFlutuantes()
ligarDownloadUi()
configurarPreviewMd({ getEditor: () => editor })
configurarDiagnosticos({ getEditor: () => editor })
configurarHistoricoAbas({ abrirArquivo: (c) => abrirArquivoNaAba(c) })
configurarAbasUi({
  nomeArquivo: (p) => nomeArquivo(p),
  caminhoRelativo: (p) => caminhoRelativo(p),
  extIcon: (n) => extIcon(n),
  getEditor: () => editor,
  ativarAba: (c, ct) => ativarAba(c, ct),
  fecharAba: (c) => fecharAba(c)
})
configurarHistoricoOrientador({
  sincronizarContextoPasta: (p, o) => sincronizarContextoPasta(p, o),
  removerPasta: (p, o) => removerPasta(p, o),
  nomePastaUi: (p) => nomePastaUi(p)
})
configurarChatCtx({
  novaConversa: () => novaConversaUi(),
  abrirOrientador: () => abrirOrientadorPrompt()
})
configurarSkillChip({ focarPainelIa: (p) => focarPainelIa(p) })
configurarConfigContas({ carregarOpenClaw: () => carregarConfigOpenClawUi() })
configurarAnalise({
  ativarAbaDireita: (p) => ativarAbaDireita(p),
  abrirArquivo: (c) => abrirArquivoNaAba(c)
})
configurarMenubar({
  executarComando: (id) => executarComando(id),
  acaoEditar: (cmd) => acaoEditar(cmd)
})
configurarArvoreRender({
  nomeArquivo: (p) => nomeArquivo(p),
  extIcon: (n) => extIcon(n),
  sincronizarContextoPasta: (p, o) => sincronizarContextoPasta(p, o),
  selecionarPasta: (p) => selecionarPasta(p),
  definirContextoPasta: (p) => definirContextoPasta(p),
  criarBotaoRemoverPasta: (p) => criarBotaoRemoverPasta(p),
  removerPasta: (p, o) => removerPasta(p, o),
  escolherNovoCaminhoPasta: (p) => escolherNovoCaminhoPasta(p),
  abrirArquivoNaAba: (c, l) => abrirArquivoNaAba(c, l),
  raizWorkspaceDe: (c) => raizWorkspaceDe(c),
  setFilesListaSuja: (v) => { filesListaSuja = v }
})
configurarArvore({
  recarregarArvore: async () => {
    await renderizarPastas()
    await atualizarGitStatusArvore()
  },
  garantirTerminal: () => garantirTerminal()
})
configurarAgenteSeletor({
  definirSkillChat: (id, nome) => definirSkillChat(id, nome),
  focarPainelIa: (p) => focarPainelIa(p),
  executarAgentUi: (o) => executarAgentUi(o),
  agendarSalvarWorkspace: () => agendarSalvarWorkspace()
})
configurarChatCore({
  resolverPastaChatAtiva: () => resolverPastaChatAtiva(),
  nomeArquivo: (p) => nomeArquivo(p),
  abrirPasta: () => abrirPasta(),
  focarPainelIa: (p) => focarPainelIa(p),
  ativarPainelCentro: (p) => ativarPainelCentro(p),
  enviarMensagemUi: () => enviarMensagemUi(),
  appendAgentTraceLive: (l) => appendAgentTraceLive(l)
})
configurarAgenteCards({
  getEditor: () => editor,
  toggleRight: (f) => toggleRight(f),
  ativarAbaDireita: (p) => ativarAbaDireita(p),
  oferecerCommitAposApply: (a) => oferecerCommitAposApply(a),
  renderListaPendentesOc: () => renderListaPendentesOc(),
  mostrarDiffOpenClaw: (p) => mostrarDiffOpenClaw(p),
  anunciarEtapaAgente: (e) => anunciarEtapaAgente(e),
  previewDiffNoEditor: (p) => previewDiffNoEditor(p)
})
configurarDiffPendentes({
  getEditor: () => editor,
  raizWorkspaceDe: (c) => raizWorkspaceDe(c),
  ativarAbaCentro: (p) => ativarAbaCentro(p),
  abrirArquivoNaAba: (c) => abrirArquivoNaAba(c),
  nomeArquivo: (p) => nomeArquivo(p),
  mostrarPropostasAgent: (ps) => mostrarPropostasAgent(ps),
  mostrarChatRestoreAposApply: (a) => mostrarChatRestoreAposApply(a)
})
configurarPaineis({
  enviarBoundsBrowser: () => enviarBoundsBrowser(),
  ativarAbaDireita: (p) => ativarAbaDireita(p)
})
configurarPanes({
  browserBloco3,
  setBrowserVisivel: (m) => setBrowserVisivel(m),
  abrirNavegadorUi: (u) => abrirNavegadorUi(u),
  garantirTerminal: () => garantirTerminal(),
  getFilesListaSuja: () => filesListaSuja,
  setFilesListaSuja: (v) => { filesListaSuja = v },
  renderizarArvoreEm: (l) => renderizarArvoreEm(l)
})
configurarEnviar({
  resolverPastaChatAtiva: () => resolverPastaChatAtiva(),
  sincronizarContextoPasta: (p, o) => sincronizarContextoPasta(p, o),
  nomePastaUi: (p) => nomePastaUi(p)
})

// ---------- Config / Contas ----------
// Agendador: injeta o prompt no chat quando um job vence
window.api.on('agendador:disparo', (_e, p) => {
  try {
    if (!p || !p.prompt) return
    const input = $('chat-input')
    if (input) {
      input.value = String(p.prompt)
      mostrarToast('Job agendado disparou: ' + String(p.prompt).slice(0, 60), 'info')
      void enviarMensagem()
    }
  } catch {
    /* */
  }
})

/** Valida UI crítica e recarrega o app (passo self-loop). */
async function verificarEReiniciarDg() {
  mostrarToast('Verificando Bloco 3 e chat…', 'aviso')
  toggleRight(true)
  ativarAbaDireita('agent')
  sincronizarBotoesPainelDireito()
  const okToggle = !!$('btn-right-toggle')
  const okPanel = !!$('exec-panel') && !$('app').classList.contains('right-collapsed')
  const okRail = !!$('right-rail') && !!$('rail-collapse')
  const okEdge = !!$('bloco3-edge')
  const okChats = !!$('agent-chats-list')
  // ciclo recolher/expandir garante botão de retorno
  toggleRight(false)
  sincronizarBotoesPainelDireito()
  const okCollapsed = $('app').classList.contains('right-collapsed') &&
    !!$('right-rail') &&
    $('bloco3-edge') &&
    !$('bloco3-edge').hidden
  toggleRight(true)
  sincronizarBotoesPainelDireito()
  if (!okToggle || !okPanel || !okRail || !okEdge || !okChats || !okCollapsed) {
    mostrarToast('Checagem parcial — use “Abrir Bloco 3” / aba ‹ na borda', 'erro')
  } else {
    mostrarToast('Bloco 3 + chats OK — recarregando', 'ok')
  }
  try {
    await window.api.invoke('janela:recarregar', true)
  } catch {
    location.reload()
  }
}

// ---------- Tema (módulo features/ui/tema.js) ----------
async function alternarTema() {
  return _alternarTema(editor)
}

function trocarTemaEditor(_tema) {
  editor?.aplicarTema()
}

function aplicarTemaLocal(tema) {
  return aplicarTema(tema, editor)
}

async function carregarTema() {
  return _carregarTema(editor)
}

// ---------- Paleta / Quick Open / Busca ----------
// paletaItens/paletaSel/buscaAbortId movidos para features/ui/paleta.js

function bootstrapComandos() {
  const defs = [
    { id: 'abrir-pasta', titulo: 'Abrir pasta de trabalho', atalho: 'Ctrl+O', fn: () => abrirPasta() },
    { id: 'abrir-vault', titulo: 'Abrir vault Markdown', fn: () => abrirVault() },
    { id: 'fechar-vault', titulo: 'Fechar vault', fn: () => fecharVault() },
    { id: 'quick-open', titulo: 'Quick Open', atalho: 'Ctrl+P', fn: () => abrirPaletaArquivos() },
    { id: 'busca-global', titulo: 'Busca no projeto', atalho: 'Ctrl+Shift+F', fn: () => abrirBuscaGlobal() },
    { id: 'paleta-comandos', titulo: 'Paleta de comandos', atalho: 'Ctrl+Shift+P', fn: () => abrirPaletaComandos() },
    { id: 'atalhos', titulo: 'Atalhos de teclado', atalho: '?', fn: () => abrirAtalhosTeclado() },
    { id: 'analisar', titulo: 'Analisar sistema aberto', fn: () => state.pastaAtual && escolherEscopoAnalise(state.pastaAtual) },
    { id: 'analisar-completa', titulo: 'Analise completa do projeto', fn: () => state.pastaAtual && analisarCompleta(state.pastaAtual) },
    { id: 'reanalisar', titulo: 'Analisar novamente', fn: () => state.pastaAtual && escolherEscopoAnalise(state.pastaAtual, true) },
    {
      id: 'limpar-chat',
      titulo: 'Limpar chat',
      fn: () => state.pastaAtual && window.api.invoke('chat:clear', state.pastaAtual).then(() => renderizarChat([]))
    },
    { id: 'contas', titulo: 'Contas e saude', fn: () => abrirContas() },
    { id: 'config', titulo: 'Configuracoes', fn: () => abrirConfig() },
    { id: 'tema', titulo: 'Alternar tema', fn: () => alternarTema() },
    { id: 'tema-escuro', titulo: 'Tema escuro', fn: () => { void window.api.invoke('tema:set', 'escuro').catch(() => {}); aplicarTemaLocal('escuro') } },
    { id: 'tema-claro', titulo: 'Tema claro', fn: () => { void window.api.invoke('tema:set', 'claro').catch(() => {}); aplicarTemaLocal('claro') } },
    { id: 'orientar-prompt', titulo: 'Assistente de prompt', atalho: 'Ctrl+Alt+P', fn: () => abrirOrientadorPrompt() },
    { id: 'guardian', titulo: 'Guardiao', fn: () => abrirContas() },
    { id: 'salvar', titulo: 'Salvar', atalho: 'Ctrl+S', fn: () => salvarArquivoAtivo() },
    { id: 'formatar', titulo: 'Formatar documento', atalho: 'Shift+Alt+F', fn: () => void formatarDocumentoAtivo() },
    { id: 'openclaw-pedir', titulo: 'Pedir ao OpenClaw', fn: () => void pedirOpenClawUi() },
    {
      id: 'agent-panel',
      titulo: 'Painel Agent',
      fn: () => {
        focarPainelIa('agent')
      }
    },
    {
      id: 'agent-undo',
      titulo: 'Desfazer último apply (checkpoint)',
      fn: async () => {
        const r = await window.api.invoke('agente:checkpoint-desfazer', pastasPermitidas())
        alert(r?.ok ? 'Restaurado.' : r?.erro || 'falha')
      }
    },
    { id: 'fechar-aba', titulo: 'Fechar aba', atalho: 'Ctrl+W', fn: () => state.abaAtiva && fecharAba(state.abaAtiva) },
    { id: 'toggle-sidebar', titulo: 'Alternar Explorer', atalho: 'Ctrl+B', fn: () => toggleSidebar() },
    { id: 'toggle-right', titulo: 'Alternar Bloco 3', atalho: 'Ctrl+Alt+B', fn: () => toggleRight() },
    { id: 'assistente-novo', titulo: 'Novo — o que criar?', atalho: 'Ctrl+N', fn: () => { toggleRight(true); abrirAssistenteNovo() } },
    {
      id: 'verificar-reiniciar',
      titulo: 'Verificar instalação e reiniciar',
      fn: () => void verificarEReiniciarDg()
    },
    {
      id: 'toggle-terminal',
      titulo: 'Alternar terminal',
      atalho: 'Ctrl+`',
      fn: () => abrirTerminalNoBloco3()
    },
    {
      id: 'navegador',
      titulo: 'Navegador embutido',
      atalho: 'Ctrl+Shift+N',
      fn: () => abrirNavegadorNoBloco3()
    },
    {
      id: 'adapta-copiar',
      titulo: 'Adapta: copiar continuidade (ONE)',
      fn: () => void copiarContinuidadeAdapta(false)
    },
    {
      id: 'adapta-mcp',
      titulo: 'Adapta: copiar comando MCP (Maestro)',
      fn: () => void copiarMcpAdapta()
    },
    {
      id: 'adapta-maestro',
      titulo: 'Adapta: abrir Maestro',
      fn: () => void window.api.invoke('adapta:abrir', 'maestro')
    },
    {      id: 'recarregar',
      titulo: 'Recarregar janela',
      atalho: 'Ctrl+R',
      fn: () => void window.api.invoke('janela:recarregar', false)
    },
    {
      id: 'forcar-recarregar',
      titulo: 'Forçar recarregamento',
      atalho: 'Ctrl+Shift+R',
      fn: () => void window.api.invoke('janela:recarregar', true)
    },
    {
      id: 'zoom-in',
      titulo: 'Zoom: aumentar',
      atalho: 'Ctrl+=',
      fn: () => ajustarZoomUi(1)
    },
    {
      id: 'zoom-out',
      titulo: 'Zoom: diminuir',
      atalho: 'Ctrl+-',
      fn: () => ajustarZoomUi(-1)
    },
    {
      id: 'zoom-reset',
      titulo: 'Zoom: padrão',
      atalho: 'Ctrl+0',
      fn: () => ajustarZoomUi(0)
    },
    {
      id: 'tela-cheia',
      titulo: 'Tela cheia',
      atalho: 'F11',
      fn: () => void window.api.invoke('janela:tela-cheia')
    },
    {
      id: 'auditar',
      titulo: 'Auto auditoria',
      fn: () => void rodarAutoAuditoria()
    },
    {
      id: 'sair',
      titulo: 'Sair',
      fn: () => {
        try {
          window.api.quit()
        } catch {
          void window.api.invoke('janela:fechar')
        }
      }
    },
    {
      id: 'sobre',
      titulo: 'Sobre o DG Editor',
      fn: () => void mostrarSobreDgEditor()
    }
  ]
  for (const d of defs) registrarComando(d)
}

async function mostrarSobreDgEditor() {
  await abrirSobreDgEditor()
}

function abrirAtalhosTeclado() {
  const m = $('modal-atalhos')
  if (!m) return
  fecharPaleta()
  fecharBuscaGlobal()
  m.classList.remove('hidden')
  requestAnimationFrame(() => m.querySelector('#btn-atalhos-fechar')?.focus())
}

function fecharAtalhosTeclado() {
  $('modal-atalhos')?.classList.add('hidden')
}

function atalhosTecladoAbertos() {
  return !!$('modal-atalhos') && !$('modal-atalhos').classList.contains('hidden')
}

function ligarPreferenciasA11y() {
  const selMov = $('a11y-movimento')
  const cbContraste = $('a11y-alto-contraste')
  const selEscala = $('a11y-escala')
  const selAnuncio = $('a11y-anuncio')
  const selFonte = $('a11y-fonte')
  const selTamEditor = $('a11y-fonte-editor')
  const selTamTerminal = $('a11y-fonte-terminal')
  if (!selMov || !cbContraste || !selEscala) return
  const prefs = lerPreferenciasA11y()
  selMov.value = prefs.movimento
  cbContraste.checked = !!prefs.altoContraste
  selEscala.value = String(prefs.escalaInterface)
  if (selAnuncio) selAnuncio.value = prefs.anuncioStreaming
  if (selFonte) selFonte.value = prefs.fonteEditor
  if (selTamEditor) selTamEditor.value = String(prefs.tamanhoEditor)
  if (selTamTerminal) selTamTerminal.value = String(prefs.tamanhoTerminal)
  const aplicar = () => {
    const p = salvarPreferenciasA11y({
      movimento: selMov.value,
      altoContraste: cbContraste.checked,
      escalaInterface: Number(selEscala.value),
      anuncioStreaming: selAnuncio ? selAnuncio.value : prefs.anuncioStreaming,
      fonteEditor: selFonte ? selFonte.value : prefs.fonteEditor,
      tamanhoEditor: selTamEditor ? Number(selTamEditor.value) : prefs.tamanhoEditor,
      tamanhoTerminal: selTamTerminal ? Number(selTamTerminal.value) : prefs.tamanhoTerminal
    })
    aplicarPreferenciasA11y(p)
    editor?.aplicarTema?.()
  }
  for (const el of [selMov, cbContraste, selEscala, selAnuncio, selFonte, selTamEditor, selTamTerminal].filter(Boolean)) {
    el.addEventListener('change', aplicar)
  }
  try {
    window
      .matchMedia('(prefers-reduced-motion: reduce)')
      .addEventListener('change', () => aplicarPreferenciasA11y())
  } catch {
    /* navegador sem matchMedia (jsdom antigo) */
  }
}

// A escala altera o zoom nativo do webContents; re-mede editor e terminal
// para evitar medições antigas (sem aplicar o fator duas vezes).
window.addEventListener('dg:escala-ui', () => {
  editor?.requestMeasure?.()
  requestAnimationFrame(() => {
    editor?.requestMeasure?.()
    window.dgTerminal?.fit?.()
  })
})

// Fonte/tamanho por painel: editor usa CSS var (re-medir), terminal ajusta xterm.
window.addEventListener('dg:fonte-painel', (ev) => {
  const d = ev && ev.detail ? ev.detail : {}
  editor?.requestMeasure?.()
  requestAnimationFrame(() => {
    editor?.requestMeasure?.()
    window.dgTerminal?.aplicarFonte?.(d.terminal)
  })
})

function acaoEditar(cmd) {
  try {
    document.execCommand(cmd)
  } catch (e) {
    console.warn('[menubar] editar:', cmd, e)
  }
}

// Paleta/Quick Open/Busca movidos para features/ui/paleta.js
// (abrirPaletaComandos, abrirPaletaArquivos, fecharPaleta, abrirBuscaGlobal,
//  fecharBuscaGlobal, renderizarPaleta, executarItemPaleta, rodarBuscaGlobal,
//  destacarPaleta — importados no topo; executarComando permanece aqui)

function executarComando(id) {
  if (executarComandoLocal(id)) return
  if (id === 'assistente-novo') {
    toggleRight(true)
    abrirAssistenteNovo()
  } else if (id === 'abrir-pasta') abrirPasta()
  else if (id === 'analisar') {
    if (state.pastaAtual) void escolherEscopoAnalise(state.pastaAtual)
  } else if (id === 'analisar-completa') {
    if (state.pastaAtual) void analisarCompleta(state.pastaAtual)
  } else if (id === 'reanalisar') {
    if (state.pastaAtual) void escolherEscopoAnalise(state.pastaAtual, true)
  } else if (id === 'limpar-chat') {
    if (state.pastaAtual) window.api.invoke('chat:clear', state.pastaAtual).then(() => renderizarChat([]))
  } else if (id === 'contas') abrirContas()
  else if (id === 'config') abrirConfig()
  else if (id === 'tema') alternarTema()
  else if (id === 'tema-escuro') {
    void window.api.invoke('tema:set', 'escuro').catch(() => {})
    aplicarTemaLocal('escuro')
  } else if (id === 'tema-claro') {
    void window.api.invoke('tema:set', 'claro').catch(() => {})
    aplicarTemaLocal('claro')
  } else if (id === 'agent-panel') focarPainelIa('agent')
  else if (id === 'guardian') abrirContas()
  else if (id === 'salvar') salvarArquivoAtivo()
  else if (id === 'formatar') void formatarDocumentoAtivo()
  else if (id === 'fechar-aba') {
    if (state.abaAtiva) fecharAba(state.abaAtiva)
  } else if (id === 'toggle-sidebar') toggleSidebar()
  else if (id === 'toggle-right') toggleRight()
  else if (id === 'verificar-reiniciar') void verificarEReiniciarDg()
  else if (id === 'orientar-prompt') abrirOrientadorPrompt()
  else if (id === 'navegador') {
    toggleRight(true)
    ativarAbaDireita('browser')
    void abrirNavegadorUi()
  } else if (id === 'regras-projeto') {
    if (state.pastaAtual) void mostrarRegrasUI(state.pastaAtual)
  }
}
// rodarBuscaGlobal/destacarPaleta movidos para features/ui/paleta.js

// ---------- Guardião ----------
window.__dgAtualizarAba = window.__dgAtualizarAba || function () {}

// Indicadores de IA extraídos para features/ui/deps-status.js

// mostrarToast extraído para features/ui/toast.js (import no topo)
window.dgToast = mostrarToast

// Checagem ocasional de versões remotas (não bloqueia UI)
setTimeout(() => {
  void window.api
    .invoke('modelos:versoes-remotas')
    .then(() => atualizarBadgeProvedorReal())
    .catch(() => {})
}, 20000)

if (typeof window.api?.on === 'function') {
  window.api.on('chat:fallback', (_e, payload) => {
    const p = payload || {}
    const de = p.de || 'provedor'
    marcarProviderFallback()
    setChatLiveStatus('Provedor ' + de + ' falhou — tentando outro…')
  })
  window.api.on('brain:fallback', (_e, payload) => {
    const p = payload || {}
    const de = p.de || '?'
    const para = p.para || '?'
    mostrarToast('IA trocou de modelo: ' + de + ' → ' + para, 'aviso')
    marcarProviderFallback()
    void atualizarBadgeProvedorReal(para)
    void window.api.invoke('brain:avaliar', para).then((r) => {
      const nota = r?.avaliacao?.nota
      if (typeof nota === 'number' && nota < 6) {
        mostrarToast(
          'Modelo ' + para + ' respondeu abaixo do esperado (nota ' + nota + '/10) — verifique',
          'aviso'
        )
      }
    }).catch(() => {})
  })
}

$('btn-brain-avaliar')?.addEventListener('click', async () => {
  mostrarToast('Avaliando modelo ativo…', 'aviso')
  try {
    const r = await window.api.invoke('brain:avaliar')
    if (!r?.ok) {
      mostrarToast('Avaliação falhou: ' + (r?.erro || 'erro'), 'erro')
      return
    }
    const a = r.avaliacao
    mostrarToast(
      'Nota ' + a.nota + '/10 (' + a.acertos + '/' + a.total + ') — ' + a.modelo,
      a.nota < 6 ? 'aviso' : 'ok'
    )
  } catch (e) {
    mostrarToast('Avaliação falhou: ' + String(e), 'erro')
  }
})

// ---------- Eventos ----------
$('btn-add-folder')?.addEventListener('click', abrirPasta)
$('btn-add-repo')?.addEventListener('click', abrirPasta)
$('btn-sidebar-nova-chat')?.addEventListener('click', () => {
  obterHistChat()?.nova?.()
  focarPainelIa('chat')
})
$('btn-desktop-use')?.addEventListener('click', () => pedirPermissaoDesktop())
$('btn-open-vault')?.addEventListener('click', () => void abrirVault())
$('btn-close-vault')?.addEventListener('click', () => void fecharVault())
$('md-preview')?.addEventListener('click', (ev) => {
  const a = ev.target?.closest?.('a.wiki-link')
  if (!a) return
  ev.preventDefault()
  const alvo = a.getAttribute('data-wiki-target')
  if (alvo) void abrirWikiLink(alvo)
})
$('btn-empty-open')?.addEventListener('click', abrirPasta)
$('btn-analise-rapida')?.addEventListener('click', () => {
  if (state.pastaAtual) void rodarAnalise(state.pastaAtual, 'rapida')
})
$('btn-analise-completa')?.addEventListener('click', () => {
  if (state.pastaAtual) void analisarCompleta(state.pastaAtual)
})
$('btn-whereis')?.addEventListener('click', () => { void buscarOndeEsta() })
$('whereis-query')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); void buscarOndeEsta() }
})
$('btn-config').addEventListener('click', abrirConfig)
const fecharConfig = () => $('modal-config').classList.add('hidden')
$('btn-config-close').addEventListener('click', fecharConfig)
$('btn-config-fechar')?.addEventListener('click', fecharConfig)
$('modal-config').addEventListener('click', (e) => { if (e.target === $('modal-config')) fecharConfig() })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modal-config').classList.contains('hidden')) fecharConfig() })
$('btn-oc-salvar')?.addEventListener('click', () => void salvarConfigOpenClawUi())
$('btn-oc-limpar-token')?.addEventListener('click', async () => {
  await window.api.invoke('openclaw:token-clear')
  await carregarConfigOpenClawUi()
})
$('btn-oc-preview-editor')?.addEventListener('click', () => {
  const p = agenteEstado.ocPendentes.find((x) => x.id === agenteEstado.ocPendenteAtivoId)
  if (p) void previewDiffNoEditor(p)
})
$('btn-oc-aplicar')?.addEventListener('click', () => void aplicarPendenteOc())
$('btn-oc-aplicar-hunks')?.addEventListener('click', () => void aplicarHunksSelecionadosOc())
$('btn-oc-rejeitar')?.addEventListener('click', () => void rejeitarPendenteOc())



$('btn-contas').addEventListener('click', abrirContas)
$('btn-contas-fechar')?.addEventListener('click', () => $('modal-contas').classList.add('hidden'))
$('btn-editor-salvar')?.addEventListener('click', () => { void salvarArquivoAtivo() })
$('btn-diag').addEventListener('click', rodarDiagnostico)
$('btn-backup-onedrive')?.addEventListener('click', () => { void rodarBackupOneDrive() })
$('btn-contas-close').addEventListener('click', () => $('modal-contas').classList.add('hidden'))
$('btn-adapta-copiar')?.addEventListener('click', () => void copiarContinuidadeAdapta(false))
$('btn-adapta-gerar')?.addEventListener('click', async () => {
  const g = await window.api.invoke('adapta:gerar')
  alert(g?.ok ? 'Continuidade gerada em:\n' + g.destino : 'Falha: ' + (g?.erro || ''))
  await atualizarPainelAdapta('adapta-status')
})
$('btn-adapta-mcp')?.addEventListener('click', () => void copiarMcpAdapta())
$('btn-adapta-one')?.addEventListener('click', () => void window.api.invoke('adapta:abrir', 'one'))
$('btn-adapta-maestro')?.addEventListener('click', () => void window.api.invoke('adapta:abrir', 'maestro'))
$('btn-adapta-docs')?.addEventListener('click', () => void window.api.invoke('adapta:abrir', 'docs'))
$('btn-adapta-copiar-cfg')?.addEventListener('click', () => void copiarContinuidadeAdapta(false))
$('btn-adapta-gerar-cfg')?.addEventListener('click', async () => {
  const g = await window.api.invoke('adapta:gerar')
  alert(g?.ok ? 'Continuidade gerada.' : 'Falha: ' + (g?.erro || ''))
  await atualizarPainelAdapta('adapta-status-cfg')
})
$('btn-adapta-mcp-cfg')?.addEventListener('click', () => void copiarMcpAdapta())
$('btn-adapta-one-cfg')?.addEventListener('click', () => void window.api.invoke('adapta:abrir', 'one'))
$('btn-adapta-maestro-cfg')?.addEventListener('click', () =>
  void window.api.invoke('adapta:abrir', 'maestro')
)
$('palette-input').addEventListener('input', (e) => {
  renderizarPaleta(e.target.value)
})
$('palette-input').addEventListener('keydown', (e) => {
  const itens = document.querySelectorAll('.palette-item')
  if (e.key === 'Escape') fecharPaleta()
  else if (e.key === 'ArrowDown') {
    e.preventDefault()
    paletaSel = Math.min(paletaSel + 1, itens.length - 1)
    destacarPaleta(itens)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    paletaSel = Math.max(paletaSel - 1, 0)
    destacarPaleta(itens)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const alvo = paletaItens[paletaSel]
    if (alvo) {
      fecharPaleta()
      executarItemPaleta(alvo)
    }
  }
})

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey
  const key = e.key.toLowerCase()

  if (mod && e.shiftKey && key === 'p') {
    e.preventDefault()
    abrirPaletaComandos()
    return
  }
  if (mod && e.shiftKey && key === 'f') {
    e.preventDefault()
    abrirBuscaGlobal()
    return
  }
  if (mod && key === 'p' && !e.shiftKey && !e.altKey) {
    e.preventDefault()
    abrirPaletaArquivos()
    return
  }
  if (mod && key === 'b' && !e.altKey && !e.shiftKey) {
    e.preventDefault()
    toggleSidebar()
    return
  }
  if (mod && e.altKey && key === 'b') {
    e.preventDefault()
    toggleRight()
    return
  }
  if (mod && e.altKey && key === 'p') {
    e.preventDefault()
    abrirOrientadorPrompt()
    return
  }
  if (mod && e.shiftKey && key === 'e') {
    e.preventDefault()
    toggleSidebar(true)
    setActivityActive('explorer', true)
    return
  }
  if (mod && key === 's') {
    e.preventDefault()
    salvarArquivoAtivo()
    return
  }
  if (e.altKey && e.shiftKey && key === 'f') {
    e.preventDefault()
    void formatarDocumentoAtivo()
    return
  }
  if (mod && key === 'w') {
    e.preventDefault()
    if (state.abaAtiva) fecharAba(state.abaAtiva)
    return
  }
  if (e.altKey && !mod && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'Left')) {
    e.preventDefault()
    void irHistAbas(-1)
    return
  }
  if (e.altKey && !mod && !e.shiftKey && (e.key === 'ArrowRight' || e.key === 'Right')) {
    e.preventDefault()
    void irHistAbas(1)
    return
  }
  if (mod && key === 'tab') {
    e.preventDefault()
    ciclarAbas()
    return
  }
  if (mod && key === 'f') {
    // deixa o CM6 abrir busca se o foco estiver no editor; senão abre explicitamente
    if (editor && state.abaAtiva) {
      e.preventDefault()
      editor.buscar()
    }
    return
  }
  if (e.key === 'Escape') {
    fecharPaleta()
    fecharBuscaGlobal()
    if (!$('modal-prompt-orientador')?.classList.contains('hidden')) fecharOrientadorPrompt()
    $('modal-config').classList.add('hidden')
    $('modal-contas').classList.add('hidden')
  }
})

$('palette').addEventListener('click', (e) => {
  if (e.target === $('palette')) fecharPaleta()
})
$('busca-global')?.addEventListener('click', (e) => {
  if (e.target === $('busca-global')) fecharBuscaGlobal()
})
let buscaTimer = null
$('busca-input')?.addEventListener('input', () => {
  clearTimeout(buscaTimer)
  buscaTimer = setTimeout(() => void rodarBuscaGlobal(), 280)
})
$('busca-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fecharBuscaGlobal()
  if (e.key === 'Enter') {
    e.preventDefault()
    void rodarBuscaGlobal()
  }
})
$('busca-regex')?.addEventListener('change', () => void rodarBuscaGlobal())

$('busca-substituir')?.addEventListener('click', async () => {
  const raiz = state.pastaAtual || state.pastasRecentes[0]
  const q = ($('busca-input')?.value || '').trim()
  const subst = $('busca-subst')?.value ?? ''
  const regex = !!$('busca-regex')?.checked
  if (!raiz) return mostrarToast('Abra uma pasta primeiro', 'aviso')
  if (!q) return mostrarToast('Digite o texto a substituir', 'aviso')
  const btn = $('busca-substituir')
  if (btn) btn.disabled = true
  try {
    const prev = await window.api.invoke('busca:substituir', raiz, q, subst, { regex, previa: true })
    if (!prev?.ok) return mostrarToast(prev?.erro || 'falha na prévia', 'erro')
    if (!prev.ocorrencias) return mostrarToast('Nenhuma ocorrência encontrada', 'aviso')
    const msg =
      'Substituir ' +
      prev.ocorrencias +
      ' ocorrência(s) em ' +
      prev.arquivos +
      ' arquivo(s)?\n\nTexto: ' +
      q +
      '\nPor: ' +
      (subst || '(vazio)')
    if (!window.confirm(msg)) return
    const r = await window.api.invoke('busca:substituir', raiz, q, subst, { regex, previa: false })
    if (!r?.ok) return mostrarToast(r?.erro || 'falha ao substituir', 'erro')
    mostrarToast(
      r.ocorrencias + ' substituição(ões) em ' + (r.alterados ?? r.arquivos) + ' arquivo(s)',
      'ok'
    )
    void rodarBuscaGlobal()
  } catch (e) {
    mostrarToast('Substituição falhou: ' + String(e?.message || e), 'erro')
  } finally {
    if (btn) btn.disabled = false
  }
})
// Config/Contas flutuantes: não fecham ao clicar no fundo (só no ×)
function alternarPainel() {
  toggleRight()
}
$('btn-painel')?.addEventListener('click', alternarPainel)

async function rodarAutoAuditoria() {
  const btn = document.getElementById('btn-auditar')
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Auditando...'
  }
  try {
    // Mesma regua do boot (autoAtualizar=false) — numeros OK/warn/erro identicos
    const r = await window.api.invoke('auditoria:rodar', {
      autoAtualizar: false,
      reiniciarAoFim: false
    })
    if (!r || r.erro) {
      console.warn('[auditoria] erro:', r && r.erro)
    } else {
      const falhas = (r.achados || []).filter(function (a) {
        return a.status === 'falhou'
      })
      const pend = (r.resumo && r.resumo.pendencias) || []
      var msg =
        'Auditoria concluida\n' +
        'OK: ' +
        r.resumo.ok +
        ' | Avisos: ' +
        r.resumo.warn +
        ' | Erros: ' +
        r.resumo.erro +
        '\n' +
        'Corrigidos: ' +
        r.resumo.corrigidos +
        ' | Falhas: ' +
        r.resumo.falhas
      if (pend.length) {
        msg +=
          '\n\nPendencias:\n' +
          pend
            .map(function (p) {
              return '- [' + p.severidade + '] ' + p.id + ' — ' + p.titulo
            })
            .join('\n')
      }
      if (falhas.length) {
        msg +=
          '\n\nFalhas:\n' +
          falhas
            .map(function (a) {
              return '- ' + a.titulo
            })
            .join('\n')
      }
      if (!r.reiniciarPendente) {
        alert(msg)
      }
      if (r.reiniciarPendente) {
        abrirModalReinicio(r.motivoReinicio)
      }
    }
  } catch (e) {
    console.warn('[auditoria] excecao:', e)
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = 'Auditar'
    }
  }
}

/** Diretório pai de um caminho (arquivo → pasta). */
async function atualizarIconeMax() {
  try {
    const st = await window.api.invoke('janela:estado')
    const b = document.getElementById('tb-max')
    if (!b) return
    b.title = st && st.maximizado ? 'Restaurar' : 'Maximizar'
  } catch {}
}

// Menubar (titlebar frameless): features/ui/menubar.js

// ---------- Boot ----------
carregarLayout()
sincronizarBotoesPainelDireito()
$('btn-right-collapse')?.addEventListener('click', () => toggleRight())
$('bloco3-edge')?.addEventListener('click', () => toggleRight(true))
$('btn-right-expand')?.addEventListener('click', () => toggleRight(true))
$('btn-right-toggle')?.addEventListener('click', () => toggleRight())
document.querySelectorAll('[data-right-close]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const pane = btn.getAttribute('data-right-close')
    if (pane === 'terminal') {
      try { window.dgTerminal?.fechar?.() } catch {}
    }
    if (pane === 'browser') {
      try { window.api.invoke('navegador:fechar') } catch {}
      setBrowserVisivel(false)
      setBrowserStatus(false)
    }
    toggleRight(false)
  })
})
carregarPastas()
initResizers()
initActivityBar()
bootstrapComandos()
initMenubar()
ligarPreferenciasA11y()
ligarAnuncioEtapasAgente()
aplicarPreferenciasA11y()
carregarTema()
initChatAgentSelector()
ligarPainelAgente()
ligarPainelOrientador()
ligarAbasUi()
ligarArvoreRender()
ligarExtrasUi()
ligarDialogosDoMain()
ligarAutomacaoAprovacao({ toast: (m, t) => mostrarToast(m, t) })
window.dgAlert = dgAlert
window.dgConfirm = dgConfirm
window.alert = (msg) => {
  void dgAlert(String(msg ?? ''), 'DG Editor')
}
window.addEventListener('dg:workspace-sujo', () => agendarSalvarWorkspace())
;(() => {
  const el = $('sb-workspace')
  const mark = (t) => {
    if (el) el.textContent = 'WS: ' + t
  }
  const _flush = flushWorkspace
  window.__dgFlushWorkspace = async () => {
    mark('salvando…')
    const r = await _flush()
    mark(r?.ok ? 'salvo' : 'local')
    setTimeout(() => mark('auto'), 2500)
  }
  const _agendar = agendarSalvarWorkspace
  // reexport visual: wrap via event after flush
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
})()
// Lazy: terminal só no primeiro uso (botão / atalho / abrirEm)
let terminalIniciado = null
function garantirTerminal() {
  terminalIniciado ??= carregarModuloTerminal().then((m) => m.initTerminalPanel())
  return terminalIniciado
}
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Escape' && atalhosTecladoAbertos()) {
      e.preventDefault()
      fecharAtalhosTeclado()
      return
    }
    const alvoTecla = e.target
    const digitando =
      alvoTecla instanceof HTMLElement &&
      (alvoTecla.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvoTecla.tagName))
    const naArvore = alvoTecla instanceof HTMLElement && !!alvoTecla.closest?.('#files-list')
    if (!digitando && !naArvore && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === '?') {
      e.preventDefault()
      abrirAtalhosTeclado()
      return
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === '/') {
      e.preventDefault()
      if (atalhosTecladoAbertos()) fecharAtalhosTeclado()
      else abrirAtalhosTeclado()
      return
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        if (e.shiftKey) ajustarFontePainelUi('editor', 1)
        else ajustarZoomUi(1)
        return
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        if (e.shiftKey) ajustarFontePainelUi('editor', -1)
        else ajustarZoomUi(-1)
        return
      }
      if ((e.key === '0' || e.code === 'Digit0') && e.shiftKey) {
        e.preventDefault()
        ajustarFontePainelUi('editor', 0)
        ajustarFontePainelUi('terminal', 0)
        return
      }
      if (e.key === '0' && !e.shiftKey) {
        e.preventDefault()
        ajustarZoomUi(0)
        return
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.altKey) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        ajustarFontePainelUi('terminal', 1)
        return
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        ajustarFontePainelUi('terminal', -1)
        return
      }
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === '1' || e.key === '2' || e.key === '3')) {
      e.preventDefault()
      if (e.key === '1') focarRegiao('sidebar', 'Barra lateral')
      else if (e.key === '2') focarRegiao('center-panel', 'Conteúdo principal')
      else focarRegiao('exec-panel', 'Painel direito')
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '`') {
      e.preventDefault()
      alternarTerminalNoBloco3()
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault()
      if (!desktopPermitido()) {
        pedirPermissaoDesktop()
        return
      }
      abrirNavegadorNoBloco3()
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault()
      focarPainelIa('chat')
    }
  },
  true
)
// placeholder até primeiro uso
const termPanel = document.getElementById('terminal-panel')
if (termPanel && !termPanel.dataset.lazyReady) {
  termPanel.dataset.lazyReady = '0'
}
initMenuCtxArvore()
$('dg-skip-link')?.addEventListener('click', (e) => {
  e.preventDefault()
  focarRegiao('center-panel', 'Conteúdo principal')
})
$('btn-atalhos-fechar')?.addEventListener('click', fecharAtalhosTeclado)
$('modal-atalhos')?.addEventListener('click', (e) => {
  if (e.target === $('modal-atalhos')) fecharAtalhosTeclado()
})
instalarTrapFocoModais()
setSidebarMode('explorer')
// Área de trabalho: autosave + restauração (layout, chats, panes, draft)
ligarWorkspaceAutosave({
  coletar: () => {
    const doc = coletarWorkspacePadrao(() => state)
    const histChatAtivo = obterHistChat()
  if (histChatAtivo?.obterId) doc.chat = { ...(doc.chat || {}), ativoId: histChatAtivo.obterId() || doc.chat?.ativoId }
    return doc
  },
  aplicar: async (doc) => {
    if (!doc) return
    if (doc.layout) {
      const app = $('app')
      if (doc.layout.sidebarWidth) {
        app.style.setProperty('--dg-sidebar-w', doc.layout.sidebarWidth + 'px')
        app.style.setProperty('--dg-sidebar-width', doc.layout.sidebarWidth + 'px')
      }
      if (doc.layout.rightWidth) {
        app.style.setProperty('--dg-panel-w', doc.layout.rightWidth + 'px')
        app.style.setProperty('--dg-right-panel-width', doc.layout.rightWidth + 'px')
      }
      app.classList.toggle('sidebar-collapsed', !!doc.layout.sidebarCollapsed)
      app.classList.toggle('right-collapsed', !!doc.layout.rightCollapsed)
      clamparLayout()
    }
    if (doc.tema) aplicarTemaLocal(doc.tema)
    if (doc.ui?.centerPane) ativarPainelCentro(doc.ui.centerPane)
    else ativarPainelCentro('chat')
    if (doc.ui?.rightPane) ativarAbaDireita(doc.ui.rightPane)
    else ativarAbaDireita('agent')
    if (doc.ui?.sidebarMode) setSidebarMode(doc.ui.sidebarMode)
    if (doc.ui?.browserUrl && $('browser-url')) $('browser-url').value = doc.ui.browserUrl
    if (doc.chat?.draft && $('chat-input') && !$('chat-input').value) {
      $('chat-input').value = doc.chat.draft
    }
    // Restaura a pasta ativa no main/renderer: sem isso a analise e o agente
    // acordam sem raiz e o painel de analise fica vazio.
    const alvoRaiz = typeof doc.pastaAtual === 'string' ? doc.pastaAtual.trim() : ''
    if (alvoRaiz) {
      try {
        const r = await window.api.invoke('workspace:definir-raiz', alvoRaiz)
        const valida = !!(r?.ok && r?.raiz && String(r.raiz).toLowerCase() === alvoRaiz.toLowerCase())
        if (valida) await selecionarPasta(r.raiz)
      } catch (e) {
        console.warn('[boot] restaurar raiz:', e)
      }
    }
    sincronizarBotoesPainelDireito()
  }
})
{
  void (async () => {
    const doc = await restaurarWorkspaceNoBoot()
    if (!doc) {
      ativarPainelCentro('chat')
      ativarAbaDireita('agent')
      if (window.innerWidth >= 900) toggleRight(true)
      else toggleRight(false)
    }
    sincronizarBotoesPainelDireito()
    // P1 responsivo: janela estreita recolhe Bloco 3
    const syncResp = () => {
      if (window.innerWidth < 900 && !$('app').classList.contains('right-collapsed')) {
        toggleRight(false)
      }
    }
    window.addEventListener('resize', () => {
      clearTimeout(window.__dgRespT)
      window.__dgRespT = setTimeout(syncResp, 200)
    })
    syncResp()
  })()
  if (desktopPermitido()) $('btn-desktop-use')?.classList.add('active')
  ligarRightRail({
    toggleRight,
    ativarAba: ativarAbaDireita,
    abrirBrowser: () => void abrirNavegadorUi(),
    garantirTerminal: () => {
      try { garantirTerminal() } catch { /* */ }
    }
  })
  ligarAssistenteNovo({
    focarChat: () => focarPainelIa('chat'),
    setChatText: (t) => {
      const input = $('chat-input')
      if (input) input.value = t || ''
    },
    enviarChat: () => enviarMensagemUi(),
    toggleRight,
    ativarAba: ativarAbaDireita,
    abrirFerramentas: (id) => {
      try {
        document.querySelector('.tool-nav-btn[data-tool="' + id + '"]')?.click()
      } catch { /* */ }
    },
    toast: (m, t) => mostrarToast(m, t || 'ok')
  })
}
ligarContextMenuDg()
renderizarPastas()
  .then(() => garantirPastaRaizProjeto())
  .then(() => restaurarAbas())
void renderizarProjects().then(() => atualizarStatusBar(state.pastaAtual || state.pastasRecentes[0] || null))
void atualizarStatusBar(state.pastaAtual || state.pastasRecentes[0] || null)
iniciarGuardian()
void atualizarBadgeProvedorReal()
/** Modo QA (e2e/mock): suprime avisos transitórios de boot nas capturas. */
const qaModoPromessa = window.api
  .invoke('app:qa-mode')
  .then((r) => !!r?.e2e)
  .catch(() => false)
void (async () => {
  try {
    const emQa = await qaModoPromessa
    const st = await window.api.invoke('deps:status')
    if (st) {
      atualizarIndicadorDeps(st)
      if (!emQa && st.ollama === 'offline' && !st.llmApiKey && st.instalado) {
        mostrarToast('Ollama instalado, mas offline. Use "Iniciar Ollama" na barra de status ou rode "ollama serve".', 'aviso')
      } else if (!emQa && st.ollama === 'nao-instalado' && !st.llmApiKey) {
        mostrarToast('IA local: Ollama não instalado. Instale em ollama.com ou configure LLM_API_KEY.', 'aviso')
      }
    }
  } catch { /* ignora */ }
})()

/** Tooltips ricos (balão) para ícones e botões com title/data-tip. */
function initTooltipsRicos() {
  if (document.body.dataset.tipsWired === '1') return
  document.body.dataset.tipsWired = '1'
  let tip = document.getElementById('dg-rich-tip')
  if (!tip) {
    tip = document.createElement('div')
    tip.id = 'dg-rich-tip'
    tip.className = 'dg-tip'
    tip.setAttribute('role', 'tooltip')
    document.body.appendChild(tip)
  }
  let timer = 0
  const esconder = () => {
    tip.classList.remove('is-show')
  }
  const mostrar = (el, texto) => {
    if (!texto) return
    const r = el.getBoundingClientRect()
    tip.textContent = texto
    tip.classList.add('is-show')
    const naRail = !!el.closest('#activity-bar')
    requestAnimationFrame(() => {
      const h = tip.offsetHeight || 28
      const w = tip.offsetWidth || 120
      if (naRail) {
        tip.style.left = Math.min(window.innerWidth - w - 8, r.right + 10) + 'px'
        tip.style.top = Math.max(8, r.top + (r.height - h) / 2) + 'px'
      } else {
        tip.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left)) + 'px'
        let top = r.top - 8 - h
        if (top < 8) top = r.bottom + 8
        tip.style.top = top + 'px'
      }
    })
  }
  document.addEventListener(
    'mouseover',
    (e) => {
      const t = e.target
      if (!(t instanceof Element)) return
      const el = t.closest(
        'button[title], .btn-icon[title], .ab-btn[data-tip], .tool-nav-btn[title], .chat-ctx-btn[title], .mb-btn[title], .right-tab[title]'
      )
      if (!el) return
      const texto = el.getAttribute('data-tip') || el.getAttribute('title') || ''
      if (!texto) return
      clearTimeout(timer)
      timer = window.setTimeout(() => mostrar(el, texto), 380)
    },
    true
  )
  document.addEventListener('mouseout', (e) => {
    const t = e.target
    if (!(t instanceof Element)) return
    if (t.closest('button[title], .btn-icon[title], .ab-btn[data-tip], .tool-nav-btn[title], .chat-ctx-btn[title]')) {
      clearTimeout(timer)
      esconder()
    }
  }, true)
  document.addEventListener('scroll', esconder, true)
}

initTooltipsRicos()

/** Boot: OpenClaw token + OpenRouter (env/cofre) + status. */
void (async () => {
  const emQa = await qaModoPromessa
  try {
    const oc = await window.api.invoke('openclaw:token-ensure')
    if (oc?.criado && !emQa) mostrarToast('Token OpenClaw criado automaticamente', 'ok')
  } catch { /* */ }
  try {
    await window.api.invoke('providers:sincronizar-env')
    let r = await window.api.invoke('providers:testar', { id: 'openrouter-north' })
    if (!r || r.ok === false) {
      r = await window.api.invoke('providers:testar', { id: 'openrouter-inkling' })
    }
    if (r && r.ok) {
      if (!emQa) mostrarToast('OpenRouter OK (' + (r.latenciaMs || '?') + ' ms)', 'ok')
      const sb = document.getElementById('sb-ia')
      if (sb) {
        sb.textContent = 'IA: OpenRouter'
        sb.title = 'OpenRouter online'
      }
    } else if (!emQa) {
      const motivo = (r && r.erro) || 'chave inválida ou ausente'
      mostrarToast('OpenRouter: ' + motivo + ' — cole uma chave válida em Provedores IA', 'aviso')
    }
  } catch (e) {
    /* silencioso se canal indisponível */
  }
})()

document.getElementById('btn-ollama-start')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget
  if (btn) { btn.disabled = true; btn.textContent = 'Iniciando…' }
  try {
    const r = await window.api.invoke('deps:ollama:start')
    if (r && r.ativo) {
      mostrarToast('Ollama iniciado.', 'ok')
    } else if (r && !r.instalado) {
      mostrarToast('Ollama não está instalado. Instale em ollama.com.', 'aviso')
    } else {
      mostrarToast('Não foi possível iniciar o Ollama. Tente "ollama serve" no terminal.', 'erro')
    }
  } catch (err) {
    mostrarToast('Falha ao iniciar Ollama: ' + String(err), 'erro')
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Iniciar Ollama' }
    try { atualizarIndicadorDeps(await window.api.invoke('deps:status')) } catch { /* */ }
  }
})

document.addEventListener('DOMContentLoaded', function () {
  var btn = document.getElementById('btn-auditar')
  if (btn) btn.addEventListener('click', rodarAutoAuditoria)
  var bMin = document.getElementById('tb-min')
  var bMax = document.getElementById('tb-max')
  var bClose = document.getElementById('tb-close')
  var bVoltar = document.getElementById('tb-voltar')
  var bAvancar = document.getElementById('tb-avancar')
  if (bVoltar) bVoltar.addEventListener('click', function () {
    void irHistAbas(-1)
  })
  if (bAvancar) bAvancar.addEventListener('click', function () {
    void irHistAbas(1)
  })
  atualizarBotoesHist()
  if (bMin) bMin.addEventListener('click', function () {
    window.api.invoke('janela:minimizar')
  })
  if (bMax)
    bMax.addEventListener('click', async function () {
      try {
        await window.api.invoke('janela:maximizar')
      } catch (e) {
        console.warn('[janela] maximizar:', e)
      }
      setTimeout(atualizarIconeMax, 120)
    })
  if (bClose) bClose.addEventListener('click', function () {
    window.api.invoke('janela:fechar')
  })
  var bAgora = document.getElementById('btn-reinicio-agora')
  var bDepois = document.getElementById('btn-reinicio-depois')
  if (bDepois) bDepois.addEventListener('click', fecharModalReinicio)
  if (bAgora)
    bAgora.addEventListener('click', function () {
      fecharModalReinicio()
      window.api.invoke('auditoria:rodar', { autoAtualizar: false, reiniciarAoFim: true })
    })
  atualizarIconeMax()
  initMenubar()
})




