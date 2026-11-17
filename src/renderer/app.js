// DG Editor - renderer (IDE Opção B)
import { mostrarRegrasUI } from './regras-ui.js'
// Editor (CodeMirror) e terminal (xterm) carregam sob demanda: pesam no boot
// e so sao necessarios quando o usuario abre um arquivo/painel.
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
  configurarAbasCore,
  abrirArquivoNaAba,
  ativarAba,
  fecharAba,
  salvarArquivoAtivo,
  initEditor,
  ciclarAbas,
  agendarAutosave,
  cancelarAutosave,
  sincronizarOverviewGit,
  ligarAbasCore
} from './features/editor/abas-core.js'
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
,
  ligarPaletaEventos
} from './features/ui/paleta.js'
import {
  configurarComandos,
  bootstrapComandos,
  executarComando,
  acaoEditar,
  alternarTema,
  aplicarTemaLocal,
  carregarTema,
  abrirAtalhosTeclado,
  fecharAtalhosTeclado,
  atalhosTecladoAbertos,
  ligarComandosUi
} from './features/ui/comandos.js'
import { initTooltipsRicos } from './features/ui/tooltips.js'
import { iniciarStatusProviders, ligarBotaoOllama } from './features/ui/boot-status.js'
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
  configurarDesktopVault,
  desktopPermitido,
  pedirPermissaoDesktop,
  abrirVault,
  fecharVault,
  atualizarPainelVault,
  abrirWikiLink
} from './features/arquivos/desktop-vault.js'
import {
  configurarPastasCrud,
  abrirPasta,
  adicionarPasta,
  escolherNovoCaminhoPasta,
  criarBotaoRemoverPasta,
  removerPasta,
  garantirPastaRaizProjeto
} from './features/arquivos/pastas-crud.js'
import {
  configurarContextoPasta,
  selecionarPasta,
  definirContextoPasta,
  resolverPastaChatAtiva,
  sincronizarContextoPasta,
  raizWorkspaceDe
} from './features/arquivos/contexto-pasta.js'
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
import { ligarAcoesBolha as _ligarAcoesBolha, reeditarMensagemUsuario as _reeditarMensagemUsuario } from './features/chat/reeditar.js'
import {
  browserBloco3,
  setBrowserStatus,
  enviarBoundsBrowser,
  setBrowserVisivel,
  abrirNavegadorUi,
  abrirNavegadorNoBloco3,
  initActivityBar,
  ligarNavegadorBloco3,
  ligarAbasPaineis
} from './features/ui/activity-browser.js'

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


ligarNavegadorBloco3()
ligarAbasPaineis()

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
configurarComandos({
  verificarEReiniciarDg: () => verificarEReiniciarDg(),
  rodarAutoAuditoria: () => rodarAutoAuditoria(),
  abrirNavegadorNoBloco3: (u) => abrirNavegadorNoBloco3(u),
  getEditor: () => editor
})
configurarAbasCore({
  nomeArquivo: (p) => nomeArquivo(p),
  caminhoNoVault: (c) => caminhoNoVault(c),
  getEditor: () => editor,
  setEditor: (e) => { editor = e }
})
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
configurarContextoPasta({
  nomePastaUi: (p) => nomePastaUi(p),
  nomeArquivo: (p) => nomeArquivo(p)
})
configurarPastasCrud({
  nomeArquivo: (p) => nomeArquivo(p),
  selecionarPasta: (p) => selecionarPasta(p),
  getEditor: () => editor,
  habilitarBotoesAnalise: (v) => habilitarBotoesAnalise(v)
})
configurarDesktopVault({
  nomeArquivo: (p) => nomeArquivo(p),
  caminhoNoVault: (c) => caminhoNoVault(c),
  ehMarkdown: (c) => ehMarkdown(c),
  abrirArquivoNaAba: (c, l) => abrirArquivoNaAba(c, l),
  adicionarPasta: (p) => adicionarPasta(p),
  selecionarPasta: (p) => selecionarPasta(p),
  toggleRight: (v) => toggleRight(v),
  ativarAbaDireita: (p) => ativarAbaDireita(p),
  appendChatToolTrace: (t) => appendChatToolTrace(t),
  setChatLiveStatus: (t) => setChatLiveStatus(t)
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

// ---------- Paleta / Quick Open / Busca ----------
// paletaItens/paletaSel/buscaAbortId movidos para features/ui/paleta.js

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
ligarPaletaEventos()

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
ligarComandosUi()
ligarAnuncioEtapasAgente()
aplicarPreferenciasA11y()
carregarTema()
initChatAgentSelector()
ligarPainelAgente()
ligarPainelOrientador()
ligarAbasUi()
ligarAbasCore()
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

initTooltipsRicos()

iniciarStatusProviders(qaModoPromessa)
ligarBotaoOllama()

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




