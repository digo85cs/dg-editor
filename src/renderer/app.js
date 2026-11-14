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
  iniciarHistoricoChat,
  mostrarLoadingChat,
  removerLoadingChat,
  marcarProviderFallback,
  animarEntradaMsg
} from './chat.js'
import { ligarFerramentas } from './ferramentas-ui.js'
import { abrirGrafoVault } from './grafo-vault.js'
import { abrirMapaMental } from './mapa-mental.js'
import { abrirGravador } from './gravador.js'
import { abrirCompartilhamento } from './compartilhar.js'
import { abrirReversa } from './reversa.js'
import { tempoRelativoCommit } from './utils/format.js'
import { escapar } from './utils/dom.js'
import { instalarTrapFocoModais } from './utils/focus-trap.js'
import { anunciar } from './features/ui/live-region.js'
import {
  lerPreferenciasA11y,
  salvarPreferenciasA11y,
  aplicarPreferenciasA11y,
  ajustarEscalaInterface,
  ajustarTamanhoFonte
} from './features/ui/acessibilidade.js'
import { iniciarGuardian } from './features/guardian/index.js'
import { relPosix, badgeGitHtml, corGit, gitStatusMap } from './features/arquivos/git-helpers.js'
import { CHEV, renderizarArvoreEm as _renderizarArvoreEm, criarNoDir as _criarNoDir, criarNoFile as _criarNoFile } from './features/arquivos/tree-render.js'
import { caminhoSobPasta, salvarPastas, carregarPastas, adicionarPastaState, removerPastaDoState, reapontarPastaState } from './features/arquivos/recentes.js'
import { CHAVE_ABAS, CHAVE_SEM_PROJETO, normalizarMapaAbas, podarMapaAbas, podarProjetosInexistentes } from './features/editor/abas-mapa.js'
import { pastasPermitidas, carregarFilhos as _carregarFilhos } from './features/arquivos/index.js'
import { renderizarAnaliseHtml, renderizarErroHtml } from './features/analise/render.js'
import { renderizarWhereisMatchesHtml, renderizarWhereisVazioHtml, renderizarWhereisErroHtml } from './features/analise/whereis.js'
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
/** @type {{ caminho: string, nome: string, dirty: boolean }[]} initialized in state */
state.abas = state.abas || []
state.abaAtiva = state.abaAtiva ?? null
/** @type {any} */
let editor = null
let modoPaleta = 'comandos' // 'comandos' | 'arquivos'
let dirtyResolver = null
/** #files-list precisa re-render quando a aba Files for ativada. */
let filesListaSuja = false
/** Histórico de navegação de state.abas (tb-voltar / tb-avancar). */
let histAbas = []
let histIdx = -1
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

// ---------- Layout persistido ----------
const LAYOUT_MIN = { sidebar: 200, right: 320, center: 420 }
const LAYOUT_MAX = { sidebar: 340, right: 460 }
const LAYOUT_ICONBAR = 48
const LAYOUT_TRILHOS = 8

function larguraTotalApp() {
  const app = $('app')
  return app?.clientWidth || window.innerWidth
}

/** Larguras finais respeitando o minimo do centro (chat/composer legivel). */
function largurasPermitidas() {
  const app = $('app')
  const total = larguraTotalApp()
  let sidebar = parseInt(getComputedStyle(app).getPropertyValue('--dg-sidebar-w'), 10) || 260
  let right = parseInt(getComputedStyle(app).getPropertyValue('--dg-panel-w'), 10) || 420
  sidebar = Math.min(LAYOUT_MAX.sidebar, Math.max(LAYOUT_MIN.sidebar, sidebar))
  const rightMax = Math.max(
    LAYOUT_MIN.right,
    Math.min(LAYOUT_MAX.right, total - LAYOUT_ICONBAR - LAYOUT_TRILHOS - sidebar - LAYOUT_MIN.center)
  )
  right = Math.min(rightMax, Math.max(LAYOUT_MIN.right, right))
  const sobraSidebar = total - LAYOUT_ICONBAR - LAYOUT_TRILHOS - right - LAYOUT_MIN.center
  if (sobraSidebar < sidebar) sidebar = Math.max(LAYOUT_MIN.sidebar, sobraSidebar)
  return { sidebar, right }
}

function aplicarLarguras({ sidebar, right }) {
  const app = $('app')
  app.style.setProperty('--dg-sidebar-w', sidebar + 'px')
  app.style.setProperty('--dg-sidebar-width', sidebar + 'px')
  app.style.setProperty('--dg-panel-w', right + 'px')
  app.style.setProperty('--dg-right-panel-width', right + 'px')
}

/** Reaplica limites em qualquer largura de janela. Retorna as larguras usadas. */
function clamparLayout() {
  const l = largurasPermitidas()
  aplicarLarguras(l)
  return l
}

function carregarLayout() {
  try {
    const raw = localStorage.getItem('dg-layout')
    if (!raw) { clamparLayout(); return }
    const L = JSON.parse(raw)
    const app = $('app')
    // Inline sobrepoe tokens; nomes novos (--dg-sidebar-w / --dg-panel-w) + aliases legados
    if (L.sidebarWidth) {
      app.style.setProperty('--dg-sidebar-w', L.sidebarWidth + 'px')
      app.style.setProperty('--dg-sidebar-width', L.sidebarWidth + 'px')
    }
    if (L.rightWidth) {
      app.style.setProperty('--dg-panel-w', L.rightWidth + 'px')
      app.style.setProperty('--dg-right-panel-width', L.rightWidth + 'px')
    }
    if (L.sidebarCollapsed) app.classList.add('sidebar-collapsed')
    // Bloco 3: migração — se ficou recolhido “para sempre”, reabre uma vez
    const mig = localStorage.getItem('dg-bloco3-v2')
    if (mig !== '1') {
      app.classList.remove('right-collapsed')
      localStorage.setItem('dg-bloco3-v2', '1')
      try {
        localStorage.setItem(
          'dg-layout',
          JSON.stringify({ ...L, rightCollapsed: false })
        )
      } catch { /* */ }
    } else if (L.rightCollapsed) {
      app.classList.add('right-collapsed')
    }
  } catch { /* ignora */ }
  clamparLayout()
}

function salvarLayout() {
  const app = $('app')
  const sw = parseInt(getComputedStyle(app).getPropertyValue('--dg-sidebar-w'), 10) || 260
  const rw = parseInt(getComputedStyle(app).getPropertyValue('--dg-panel-w'), 10) || 420
  localStorage.setItem(
    'dg-layout',
    JSON.stringify({
      sidebarWidth: sw,
      rightWidth: rw,
      sidebarCollapsed: app.classList.contains('sidebar-collapsed'),
      rightCollapsed: app.classList.contains('right-collapsed')
    })
  )
  agendarSalvarWorkspace()
}

function initResizers() {
  const bind = (el, kind) => {
    if (!el) return
    let startX = 0
    let startW = 0
    const onMove = (e) => {
      const dx = e.clientX - startX
      const total = larguraTotalApp()
      if (kind === 'sidebar') {
        const outra = parseInt(getComputedStyle($('app')).getPropertyValue('--dg-panel-w'), 10) || 420
        const max = Math.min(
          LAYOUT_MAX.sidebar,
          Math.max(LAYOUT_MIN.sidebar, total - LAYOUT_ICONBAR - LAYOUT_TRILHOS - outra - LAYOUT_MIN.center)
        )
        const w = Math.min(max, Math.max(LAYOUT_MIN.sidebar, startW + dx))
        $('app').style.setProperty('--dg-sidebar-w', w + 'px')
        $('app').style.setProperty('--dg-sidebar-width', w + 'px')
      } else {
        const outra = parseInt(getComputedStyle($('app')).getPropertyValue('--dg-sidebar-w'), 10) || 260
        const max = Math.min(
          LAYOUT_MAX.right,
          Math.max(LAYOUT_MIN.right, total - LAYOUT_ICONBAR - LAYOUT_TRILHOS - outra - LAYOUT_MIN.center)
        )
        const w = Math.min(max, Math.max(LAYOUT_MIN.right, startW - dx))
        $('app').style.setProperty('--dg-panel-w', w + 'px')
        $('app').style.setProperty('--dg-right-panel-width', w + 'px')
        if (typeof enviarBoundsBrowser === 'function') enviarBoundsBrowser()
      }
    }
    const onUp = () => {
      el.classList.remove('dragging')
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      salvarLayout()
      // Larguras mudaram: remede o CodeMirror e reajuste o xterm.
      editor?.requestMeasure?.()
      requestAnimationFrame(() => {
        editor?.requestMeasure?.()
        window.dgTerminal?.fit?.()
      })
      if (typeof enviarBoundsBrowser === 'function') enviarBoundsBrowser()
    }
    el.addEventListener('mousedown', (e) => {
      e.preventDefault()
      startX = e.clientX
      const prop = kind === 'sidebar' ? '--dg-sidebar-w' : '--dg-panel-w'
      startW = parseInt(getComputedStyle($('app')).getPropertyValue(prop), 10) || (kind === 'sidebar' ? 260 : 320)
      el.classList.add('dragging')
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
    el.addEventListener('dblclick', () => {
      if (kind === 'sidebar') {
        $('app').style.setProperty('--dg-sidebar-w', '260px')
        $('app').style.setProperty('--dg-sidebar-width', '260px')
      } else {
        $('app').style.setProperty('--dg-panel-w', '420px')
        $('app').style.setProperty('--dg-right-panel-width', '420px')
      }
      clamparLayout()
      salvarLayout()
    })
  }
  bind($('resize-sidebar'), 'sidebar')
  bind($('resize-right'), 'right')

  let timerJanela = 0
  window.addEventListener('resize', () => {
    clamparLayout()
    clearTimeout(timerJanela)
    timerJanela = setTimeout(() => {
      salvarLayout()
      if (typeof enviarBoundsBrowser === 'function') enviarBoundsBrowser()
    }, 250)
  })
}

function toggleSidebar(forcar) {
  const app = $('app')
  if (typeof forcar === 'boolean') {
    app.classList.toggle('sidebar-collapsed', !forcar)
  } else {
    app.classList.toggle('sidebar-collapsed')
  }
  salvarLayout()
  setActivityActive('explorer', !app.classList.contains('sidebar-collapsed'))
}

function sincronizarBotoesPainelDireito() {
  const recolhido = $('app').classList.contains('right-collapsed')
  const pressed = String(recolhido)
  $('btn-right-collapse')?.setAttribute('aria-pressed', pressed)
  $('btn-right-expand')?.setAttribute('aria-pressed', pressed)
  const tog = $('btn-right-toggle')
  if (tog) {
    tog.hidden = false
    tog.style.display = 'inline-flex'
    tog.setAttribute('aria-pressed', pressed)
    tog.title = recolhido
      ? 'Abrir Bloco 3 (Execução, Terminal, Navegador)'
      : 'Fechar Bloco 3'
    tog.textContent = recolhido ? 'Abrir Bloco 3' : 'Bloco 3'
  }
  const exp = $('btn-right-expand')
  if (exp) exp.hidden = true
  const rail = $('rail-collapse')
  if (rail) {
    rail.title = recolhido ? 'Expandir Bloco 3' : 'Recolher Bloco 3'
    rail.setAttribute('aria-label', rail.title)
    rail.setAttribute('aria-pressed', pressed)
  }
  const edge = $('bloco3-edge')
  if (edge) {
    edge.hidden = !recolhido
    edge.setAttribute('aria-hidden', recolhido ? 'false' : 'true')
    edge.title = 'Abrir Bloco 3'
  }
}

function toggleRight(forcar) {
  const app = $('app')
  if (typeof forcar === 'boolean') {
    app.classList.toggle('right-collapsed', !forcar)
  } else {
    app.classList.toggle('right-collapsed')
  }
  salvarLayout()
  sincronizarBotoesPainelDireito()
}

function setActivityActive(action, on) {
  document.querySelectorAll('.ab-btn').forEach((b) => {
    if (b.dataset.action === action) b.classList.toggle('active', !!on)
  })
}

function abrirTerminalNoBloco3() {
  toggleRight(true)
  // ativarAbaDireita aguarda o módulo lazy e chama dgTerminal.abrir()
  ativarAbaDireita('terminal')
}

/** Ctrl+`: abre; se já está visível na aba Terminal, apenas oculta (ptys continuam vivos). */
function alternarTerminalNoBloco3() {
  const dg = window.dgTerminal
  const tabTerminalAtiva = document
    .querySelector('.right-tab[data-pane="terminal"]')
    ?.classList.contains('active')
  const direitaVisivel = !$('app')?.classList.contains('right-collapsed')
  if (dg?.isOpen?.() && tabTerminalAtiva && direitaVisivel) {
    void dg.ocultar?.()
    return
  }
  abrirTerminalNoBloco3()
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

/** Alterna Chat | Editor no bloco central (estilo Cursor Agent). */
function ativarPainelCentro(pane) {
  const alvo = pane === 'editor' ? 'editor' : 'chat'
  document.querySelectorAll('.center-tab').forEach((t) => {
    const on = t.dataset.center === alvo
    t.classList.toggle('active', on)
    t.setAttribute('aria-selected', on ? 'true' : 'false')
  })
  const chat = $('center-pane-chat')
  const ed = $('center-pane-editor')
  if (chat) chat.classList.toggle('active', alvo === 'chat')
  if (ed) ed.classList.toggle('active', alvo === 'editor')
  if (alvo === 'chat') {
    try { initChatAgentSelector() } catch (_) { /* ok */ }
  }
  return alvo
}

function focarPainelIa(pane) {
  const alvo = pane === 'agent' ? 'agent' : 'chat'
  if (alvo === 'chat') {
    ativarPainelCentro('chat')
    setActivityActive('chat', true)
    setTimeout(() => $('chat-input')?.focus(), 0)
    return
  }
  toggleRight(true)
  ativarAbaDireita('agent')
  setActivityActive('chat', true)
  setTimeout(() => $('chat-input')?.focus(), 0)
}

/** Move o foco para um bloco (skip link e Alt+1/2/3). */
function focarRegiao(id, rotulo) {
  const el = $(id)
  if (!el) return
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  try {
    el.focus()
  } catch {
    /* */
  }
  if (rotulo) anunciar(rotulo)
}

function ativarAbaDireita(pane) {
  let p = pane
  if (p === 'chat') {
    ativarPainelCentro('chat')
    return
  }
  const eraBrowser = $('pane-browser')?.classList.contains('active')
  document.querySelectorAll('.right-tab').forEach((t) => {
    const on = t.dataset.pane === p
    t.classList.toggle('active', on)
    if (on) t.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
  document.querySelectorAll('.right-pane').forEach((el) => {
    el.classList.toggle('active', el.id === 'pane-' + p)
  })
  if (p === 'agent') void carregarAgentesUi()
  if (p === 'browser') {
    if (browserBloco3.isAberto()) setBrowserVisivel(true)
    else {
      // Aba do navegador ativa = navegador pronto para uso (about:blank se nao houver URL).
      const url = /** @type {HTMLInputElement|null} */ ($('browser-url'))?.value
      void abrirNavegadorUi(url || undefined)
    }
  } else if (eraBrowser || p !== 'browser') {
    setBrowserVisivel(false)
  }
  if (p === 'terminal') {
    void garantirTerminal().then(() => {
      const fit = () => {
        window.dgTerminal?.fit?.()
      }
      const open = window.dgTerminal?.abrir
      if (typeof open === 'function') {
        Promise.resolve(open()).then(() => {
          requestAnimationFrame(() => {
            fit()
            requestAnimationFrame(fit)
          })
        })
      } else {
        requestAnimationFrame(() => {
          fit()
          requestAnimationFrame(fit)
        })
      }
    })
  } else if (p === 'files' && filesListaSuja) {
    filesListaSuja = false
    void renderizarArvoreEm($('files-list'))
  }
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

function atualizarDownloadUi(p) {
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

function ativarAbaCentro(pane) {
  if (pane === 'agent') {
    focarPainelIa('agent')
    return
  }
  if (pane === 'chat') {
    ativarPainelCentro('chat')
    return
  }
  ativarPainelCentro(pane === 'editor' ? 'editor' : 'chat')
}

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

async function colarComoMarkdown() {
  try {
    const r = await window.api.invoke('clipboard:colar-markdown')
    if (!r?.ok) {
      mostrarToast(r?.erro || 'Área de transferência vazia', 'erro')
      return
    }
    const painelEditor = $('center-pane-editor')
    const editorAtivo = painelEditor?.classList.contains('active')
    if (editorAtivo && editor && state.abaAtiva && typeof editor.inserirTexto === 'function') {
      editor.inserirTexto(r.markdown)
      mostrarToast('Markdown colado · ' + r.caracteres + ' caracteres', 'ok')
      anunciar('Conteúdo colado como Markdown no editor')
      return
    }
    const { abrirColarMarkdown } = await import('./colar-markdown.js')
    abrirColarMarkdown(r.markdown, r.origem)
  } catch (e) {
    mostrarToast('Falha ao colar Markdown: ' + String(e), 'erro')
  }
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

const SUGESTOES_CHAT = [
  'Explique a arquitetura deste projeto',
  'Onde fica o ponto de entrada?',
  'Sugira melhorias de UI e UX',
  'Liste riscos e pontos de atenção'
]

function markupEmptyStateChat() {
  const raiz = resolverPastaChatAtiva()
  if (!raiz) {
    return (
      '<div class="empty-state" id="empty-state">' +
      '<h2>Vamos começar</h2>' +
      '<p>Abra um repositório para o agente ler o código, analisar e executar tarefas.</p>' +
      '<button id="btn-empty-open" class="btn-primary">Adicionar repositório</button>' +
      '</div>'
    )
  }
  const nome = nomeArquivo(raiz)
  const chips = SUGESTOES_CHAT.map(
    (s) =>
      '<button type="button" class="empty-chip" data-sugestao="' +
      escapar(s) +
      '">' +
      escapar(s) +
      '</button>'
  ).join('')
  return (
    '<div class="empty-state empty-state--chat" id="empty-state">' +
    '<h2>Como posso ajudar com ' +
    escapar(nome) +
    '?</h2>' +
    '<p>Pergunte sobre o código, peça uma alteração ou deixe o agente explorar o projeto.</p>' +
    '<div class="empty-chips">' +
    chips +
    '</div>' +
    '</div>'
  )
}

function ligarEmptyStateChat() {
  const empty = $('empty-state')
  if (!empty) return
  $('btn-empty-open')?.addEventListener('click', abrirPasta)
  empty.querySelectorAll('[data-sugestao]').forEach((b) => {
    b.addEventListener('click', () => {
      const texto = b.getAttribute('data-sugestao') || ''
      const input = /** @type {HTMLTextAreaElement|null} */ ($('chat-input'))
      if (input) {
        input.value = texto
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
      focarPainelIa('chat')
      enviarMensagemUi()
    })
  })
}

function garantirEmptyStateChat() {
  const area = $('chat-messages')
  if (!area) return
  let empty = $('empty-state')
  if (!empty) {
    empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.id = 'empty-state'
    area.innerHTML = ''
    area.classList.remove('has-msgs')
    area.appendChild(empty)
  }
  empty.outerHTML = markupEmptyStateChat()
  area.classList.remove('has-msgs')
  ligarEmptyStateChat()
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
    histAbas = []
    histIdx = -1
    atualizarBotoesHist()
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
    histChat = null
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
  void histChat?.refrescarLista?.()
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

function treeDeps() {
  return {
    renderizarPastas,
    carregarFilhos,
    selecionarPasta,
    definirContextoPasta,
    raizWorkspaceDe,
    criarBotaoRemoverPasta,
    nomeArquivo,
  }
}

async function renderizarArvoreEm(lista) {
  const r = await _renderizarArvoreEm(lista, treeDeps())
  garantirLinhaFocavel(lista)
  return r
}

function abaFilesVisivel() {
  return !!$('pane-files')?.classList.contains('active')
}

async function renderizarPastas() {
  console.time('renderizarPastas')
  try {
    // Sidebar Repositórios = Cursor (pasta + chats). Sem árvore de arquivos.
    if (histChat && typeof histChat.refrescarLista === 'function') {
      await histChat.refrescarLista()
    } else if ($('folder-list')) {
      // Boot antes do hist: cabeçalhos das pastas
      const el = $('folder-list')
      el.innerHTML = ''
      for (const p of state.pastasRecentes || []) {
        const g = document.createElement('div')
        g.className = 'agent-chat-group' + (p === state.pastaAtual ? ' active' : '')
        g.innerHTML =
          '<div class="agent-chat-group-head-row"><button type="button" class="agent-chat-group-head" data-raiz="' +
          String(p).replace(/"/g, '') +
          '"><span class="agent-chat-folder-ico" aria-hidden="true">📁</span><span class="agent-chat-group-name"></span></button></div>' +
          '<div class="agent-chat-group-body"><p class="agent-chats-empty agent-chats-empty-sm">Sem conversas</p></div>'
        g.querySelector('.agent-chat-group-name').textContent = nomeArquivo(p)
        g.querySelector('.agent-chat-group-head')?.addEventListener('click', () => {
          void sincronizarContextoPasta(p, { forceAnalise: true })
        })
        el.appendChild(g)
      }
      if (!(state.pastasRecentes || []).length) {
        el.innerHTML = '<p class="agent-chats-empty">Nenhum repositório. Clique em + para adicionar.</p>'
      }
    }
    // Árvore de pastas/arquivos só no Bloco 3 → Arquivos
    if (abaFilesVisivel()) {
      await renderizarArvoreEm($('files-list'))
      filesListaSuja = false
    } else {
      filesListaSuja = true
    }
  } finally {
    console.timeEnd('renderizarPastas')
  }
}

async function carregarFilhos(dir, container, nivel) {
  const r = await _carregarFilhos(dir, container, nivel, {
    removerPasta,
    escolherNovoCaminhoPasta,
    criarNoDir,
    criarNoFile,
  })
  garantirLinhaFocavel($('files-list'))
  return r
}

function criarNoDir(ent, nivel) {
  return _criarNoDir(ent, nivel, { carregarFilhos })
}




function renderDiffHtml(diffText) {
  const lines = String(diffText || '').split(/\r?\n/)
  return lines
    .map((ln) => {
      let cls = 'diff-ctx'
      if (ln.startsWith('+') && !ln.startsWith('+++')) cls = 'diff-add'
      else if (ln.startsWith('-') && !ln.startsWith('---')) cls = 'diff-del'
      else if (ln.startsWith('@@')) cls = 'diff-hunk'
      return '<span class="' + cls + '">' + escapar(ln) + '</span>'
    })
    .join('\n')
}

async function abrirPainelDiff(absPath) {
  const raiz = raizWorkspaceDe(absPath) || state.pastaAtual
  if (!raiz) return
  const rel = relPosix(absPath, raiz)
  const panel = $('diff-panel')
  const body = $('diff-panel-body')
  const title = $('diff-panel-title')
  if (!panel || !body) return
  title.textContent = 'Diff: ' + rel
  body.textContent = 'Carregando…'
  panel.classList.remove('hidden')
  panel.setAttribute('aria-hidden', 'false')
  try {
    const r = await window.api.invoke('git:diff', raiz, rel)
    body.innerHTML = renderDiffHtml(r?.diff || r?.erro || '(vazio)')
  } catch (e) {
    body.textContent = String(e)
  }
}

/** @type {{ id: string, path: string, unifiedDiff: string, absPath: string, origem?: string }[]} */
let ocPendentes = []
/** @type {string | null} */
let ocPendenteAtivoId = null
/** @type {{ id: string, path: string, absPath?: string, unifiedDiff: string, origem?: string }[]} */
let agentPropostas = []
let agentProgressUnsub = null
let ultimoStatusAgente = ''
let ultimoStatusAgenteEm = 0
/** @type {Set<number>} */
let ocHunksAceitos = new Set()

/**
 * Anuncia a etapa do agente no aria-live, sem repetir a mesma etapa em
 * sequência (streaming), mas permitindo repetir em outro turno.
 * @param {string} etapa
 */
function anunciarEtapaAgente(etapa) {
  if (!etapa) return
  const agora = Date.now()
  if (etapa === ultimoStatusAgente && agora - ultimoStatusAgenteEm < 4000) return
  if (lerPreferenciasA11y().anuncioStreaming === 'silencioso') return
  ultimoStatusAgente = etapa
  ultimoStatusAgenteEm = agora
  anunciar('Agente: ' + etapa)
}

function fecharPainelDiff() {
  const panel = $('diff-panel')
  if (!panel) return
  panel.classList.add('hidden')
  panel.setAttribute('aria-hidden', 'true')
  ocPendenteAtivoId = null
  window.__dgApplyViaAgente = false
  ocHunksAceitos = new Set()
  const acoes = $('diff-panel-actions')
  if (acoes) acoes.hidden = true
  const lista = $('oc-pendentes-lista')
  if (lista) {
    lista.hidden = true
    lista.innerHTML = ''
  }
  const bar = $('diff-hunks-bar')
  if (bar) {
    bar.hidden = true
    bar.innerHTML = ''
  }
  if (editor && editor.limparDiff) editor.limparDiff()
  ocultarEditorDiffBar()
}

/** Preview side-by-side no CodeMirror via propostas:preview (sem gravar disco). */
async function previewDiffNoEditor(pendente) {
  if (!pendente?.id || !editor || !editor.mostrarDiffProposta) return
  const r = await window.api.invoke('propostas:preview', pendente.id, pastasPermitidas())
  if (!r?.ok) {
    alert('Preview: ' + (r?.erro || 'falha'))
    return
  }
  // abre o arquivo no editor (antes) se ainda nao estiver
  const abs = r.absPath || pendente.absPath || pendente.path
  if (abs && state.abaAtiva !== abs) {
    try {
      await abrirArquivoNaAba(abs)
    } catch {
      /* */
    }
  }
  if (abs && editor.getCaminho && editor.getCaminho() !== abs && r.antes != null) {
    editor.abrir(abs, r.antes)
  } else if (r.antes != null && editor.getConteudo && editor.getConteudo() !== r.antes) {
    // alinha doc com o original do disco usado no preview
    editor.abrir(abs || editor.getCaminho(), r.antes)
  }
  editor.mostrarDiffProposta({
    linhasDel: r.linhasDel || [],
    linhasAdd: r.linhasAdd || [],
    depois: r.depois,
    caminho: abs
  })
  mostrarEditorDiffBar(
    { id: pendente.id, path: pendente.path || abs, absPath: abs },
    { linhasDel: r.linhasDel || [], linhasAdd: r.linhasAdd || [] }
  )
  ativarAbaCentro('editor')
}

async function carregarHunksDiff(pendenteId) {
  const bar = $('diff-hunks-bar')
  if (!bar) return
  bar.innerHTML = ''
  ocHunksAceitos = new Set()
  const r = await window.api.invoke('propostas:hunks', pendenteId)
  if (!r?.ok || !r.hunks?.length) {
    bar.hidden = true
    return
  }
  bar.hidden = false
  for (const h of r.hunks) {
    ocHunksAceitos.add(h.index)
    const row = document.createElement('div')
    row.className = 'diff-hunk-row'
    row.dataset.index = String(h.index)
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = true
    cb.setAttribute('aria-label', 'Aceitar hunk ' + (h.index + 1))
    cb.addEventListener('change', () => {
      if (cb.checked) {
        ocHunksAceitos.add(h.index)
        row.classList.remove('rejeitado')
      } else {
        ocHunksAceitos.delete(h.index)
        row.classList.add('rejeitado')
      }
    })
    const code = document.createElement('code')
    code.textContent = 'hunk ' + (h.index + 1) + ' ' + (h.resumo || '') + ' ' + (h.header || '')
    row.appendChild(cb)
    row.appendChild(code)
    bar.appendChild(row)
  }
}

function mostrarDiffOpenClaw(pendente) {
  const panel = $('diff-panel')
  const body = $('diff-panel-body')
  const title = $('diff-panel-title')
  const acoes = $('diff-panel-actions')
  if (!panel || !body || !pendente) return
  ocPendenteAtivoId = pendente.id
  const origem = pendente.origem || (window.__dgApplyViaAgente ? 'agent' : 'openclaw')
  if (title) title.textContent = origem + ': ' + (pendente.path || pendente.absPath)
  body.innerHTML = renderDiffHtml(pendente.unifiedDiff)
  if (acoes) acoes.hidden = false
  panel.classList.remove('hidden')
  panel.setAttribute('aria-hidden', 'false')
  void previewDiffNoEditor(pendente)
  const lista = $('oc-pendentes-lista')
  if (lista) {
    for (const btn of lista.querySelectorAll('button')) {
      btn.classList.toggle('active', btn.dataset.id === pendente.id)
    }
  }
  void carregarHunksDiff(pendente.id)
}

function renderListaPendentesOc() {
  const lista = $('oc-pendentes-lista')
  if (!lista) return
  const tinhaFoco = lista.contains(document.activeElement)
  lista.innerHTML = ''
  if (!ocPendentes.length) {
    lista.hidden = true
    return
  }
  lista.hidden = false
  lista.setAttribute('role', 'menu')
  lista.setAttribute('aria-label', 'Propostas pendentes')
  for (const p of ocPendentes) {
    const b = document.createElement('button')
    b.type = 'button'
    b.setAttribute('role', 'menuitem')
    b.dataset.id = p.id
    b.textContent = nomeArquivo(p.path || p.absPath)
    b.title = p.absPath || p.path
    if (p.id === ocPendenteAtivoId) b.classList.add('active')
    b.addEventListener('click', () => mostrarDiffOpenClaw(p))
    lista.appendChild(b)
  }
  if (tinhaFoco) lista.querySelector('button')?.focus()
}

/** Setas/Home/End percorrem as propostas; Enter/Espaço abrem o diff. */
function initTecladoPendentes() {
  const lista = $('oc-pendentes-lista')
  if (!lista || lista.dataset.teclado === '1') return
  lista.dataset.teclado = '1'
  lista.addEventListener('keydown', (e) => {
    const botoes = [...lista.querySelectorAll('button')]
    if (!botoes.length) return
    const i = botoes.indexOf(document.activeElement)
    let alvo = null
    if (e.key === 'ArrowDown') alvo = (i + 1) % botoes.length
    else if (e.key === 'ArrowUp') alvo = (i - 1 + botoes.length) % botoes.length
    else if (e.key === 'Home') alvo = 0
    else if (e.key === 'End') alvo = botoes.length - 1
    else return
    e.preventDefault()
    botoes[alvo].focus()
  })
}
initTecladoPendentes()

async function pedirOpenClawUi() {
  const prompt = window.prompt('Pedido para o OpenClaw (edicoes voltam como diff para aprovacao):')
  if (prompt == null || !String(prompt).trim()) return
  const arquivosAbertos = []
  for (const a of state.abas) {
    const item = { path: a.caminho }
    if (a.caminho === state.abaAtiva && editor) {
      item.conteudo = editor.getConteudo()
      if (editor.getSelecao) {
        const sel = editor.getSelecao()
        if (sel) item.selecao = sel
      }
    }
    arquivosAbertos.push(item)
  }
  const r = await window.api.invoke('openclaw:pedir', {
    prompt: String(prompt).trim(),
    pastas: pastasPermitidas(),
    arquivosAbertos
  })
  if (!r?.ok) {
    alert('OpenClaw: ' + (r?.erro || 'erro'))
    return
  }
  ocPendentes = r.pendentes || []
  if (r.rejeitados?.length) {
    console.warn('[openclaw] paths rejeitados:', r.rejeitados)
  }
  if (!ocPendentes.length) {
    alert(r.mensagem || 'Nenhum diff proposto.')
    return
  }
  renderListaPendentesOc()
  mostrarDiffOpenClaw(ocPendentes[0])
}

async function oferecerCommitAposApply(arquivos) {
  const raiz = (pastasPermitidas() || [])[0] || (state.pastasRecentes || [])[0] || ''
  if (!raiz) return
  const lista = (arquivos || []).filter(Boolean)
  const msgPadrao = lista.length === 1
    ? 'Aplicar diff: ' + lista[0]
    : 'Aplicar diffs do agente (' + lista.length + ' arquivo(s))'
  if (!(await dgConfirm('Diff aplicado. Criar commit local agora?', 'Commit'))) return
  const mensagem = window.prompt('Mensagem do commit:', msgPadrao)
  if (!mensagem || !String(mensagem).trim()) return
  const r = await window.api.invoke('git:commit', {
    raiz,
    mensagem: String(mensagem).trim(),
    arquivos: lista
  })
  if (r?.ok) {
    if (window.dgToast) window.dgToast('Commit ' + (r.hash || 'ok'), 'ok')
    else alert('Commit ' + (r.hash || 'ok'))
  } else if (r?.erro && r.erro !== 'cancelado') {
    if (window.dgToast) window.dgToast('Commit: ' + r.erro, 'erro')
    else alert('Commit: ' + r.erro)
  }
}

async function finalizarApplyPendente(r, id) {
  const viaAgente = !!window.__dgApplyViaAgente
  const pathAplicado = r?.path || r?.absPath || ''
  ocPendentes = ocPendentes.filter((p) => p.id !== id)
  agentPropostas = agentPropostas.filter((p) => p.id !== id)
  mostrarPropostasAgent(agentPropostas)
  if (r.absPath && state.abaAtiva === r.absPath && editor) {
    const ler = await window.api.invoke('arquivo:ler', r.absPath, pastasPermitidas())
    if (ler?.ok) editor.abrir(r.absPath, ler.conteudo)
  }
  // fila unificada
  const rest = await window.api.invoke('propostas:listar')
  ocPendentes = (rest?.pendentes || []).map((p) => ({
    id: p.id,
    path: p.path,
    absPath: p.absPath,
    unifiedDiff: p.unifiedDiff,
    origem: p.origem
  }))
  agentPropostas = ocPendentes.slice()
  mostrarPropostasAgent(agentPropostas)
  if (ocPendentes.length) {
    renderListaPendentesOc()
    mostrarDiffOpenClaw(ocPendentes[0])
  } else {
    fecharPainelDiff()
    const base = viaAgente && r.checkpointId ? 'Diff aplicado (checkpoint ' + r.checkpointId + ').' : 'Diff aplicado.'
    if (window.dgToast) window.dgToast(base, 'ok')
    else alert(base)
    mostrarChatRestoreAposApply(pathAplicado ? [pathAplicado] : [])
    await oferecerCommitAposApply(pathAplicado ? [pathAplicado] : [])
  }
}

async function aplicarPendenteOc() {
  if (!ocPendenteAtivoId) return
  if (!(await dgConfirm('Aplicar este arquivo no disco?', 'Aplicar'))) return
  const viaAgente = !!window.__dgApplyViaAgente
  const canal = viaAgente ? 'agente:aplicar-proposta' : 'openclaw:aplicar'
  const id = ocPendenteAtivoId
  const r = await window.api.invoke(canal, id, pastasPermitidas())
  if (!r?.ok) {
    alert('Falha ao aplicar: ' + (r?.erro || 'erro'))
    return
  }
  await finalizarApplyPendente(r, id)
}

async function aplicarHunksSelecionadosOc() {
  if (!ocPendenteAtivoId) return
  const indices = [...ocHunksAceitos].sort((a, b) => a - b)
  if (!indices.length) {
    alert('Nenhum hunk selecionado.')
    return
  }
  if (!(await dgConfirm('Aplicar ' + indices.length + ' hunk(s) selecionado(s)?', 'Aplicar hunks'))) return
  const def = await window.api.invoke('propostas:definir-hunks', ocPendenteAtivoId, indices)
  if (!def?.ok) {
    alert('Falha ao filtrar hunks: ' + (def?.erro || ''))
    return
  }
  if (def.rejeitado) {
    alert('Todos os hunks rejeitados.')
    fecharPainelDiff()
    return
  }
  const viaAgente = !!window.__dgApplyViaAgente || def.pendente?.origem === 'agent'
  const canal = viaAgente ? 'agente:aplicar-proposta' : 'openclaw:aplicar'
  const id = ocPendenteAtivoId
  const r = await window.api.invoke(canal, id, pastasPermitidas())
  if (!r?.ok) {
    alert('Falha ao aplicar hunks: ' + (r?.erro || 'erro'))
    return
  }
  await finalizarApplyPendente(r, id)
}

async function rejeitarPendenteOc() {
  if (!ocPendenteAtivoId) return
  const viaAgente = !!window.__dgApplyViaAgente
  const canal = viaAgente ? 'agente:rejeitar-proposta' : 'openclaw:rejeitar'
  await window.api.invoke(canal, ocPendenteAtivoId)
  const id = ocPendenteAtivoId
  ocPendentes = ocPendentes.filter((p) => p.id !== id)
  if (viaAgente) {
    agentPropostas = agentPropostas.filter((p) => p.id !== id)
    mostrarPropostasAgent(agentPropostas)
  }
  if (ocPendentes.length) {
    renderListaPendentesOc()
    mostrarDiffOpenClaw(ocPendentes[0])
  } else {
    fecharPainelDiff()
  }
}

async function carregarConfigOpenClawUi() {
  const cfg = await window.api.invoke('openclaw:config-get')
  let st = await window.api.invoke('openclaw:token-ensure')
  if (!st?.ok || !st?.configurado) {
    st = await window.api.invoke('openclaw:token-status')
  }
  if (cfg?.config) {
    const ep = $('oc-endpoint')
    const md = $('oc-model')
    if (ep) ep.value = cfg.config.endpoint || ''
    if (md) md.value = cfg.config.model || ''
  }
  const tok = $('oc-token')
  if (tok) tok.value = ''
  const status = $('oc-token-status')
  if (status) {
    if (st?.configurado || st?.ok) {
      status.textContent = st?.criado
        ? 'Token OpenClaw criado automaticamente (prefixo ' + (st.prefixo || 'oc_') + '…).'
        : 'Token gravado no cofre do SO (safeStorage).'
    } else {
      status.textContent = 'Nenhum token configurado.' + (st?.erro ? ' ' + st.erro : '')
    }
  }
}

async function salvarConfigOpenClawUi() {
  const endpoint = $('oc-endpoint')?.value?.trim()
  const model = $('oc-model')?.value?.trim()
  await window.api.invoke('openclaw:config-set', { endpoint, model })
  const token = $('oc-token')?.value
  if (token && token.trim()) {
    const r = await window.api.invoke('openclaw:token-set', token.trim())
    if (!r?.ok) {
      alert('Token nao salvo: ' + (r?.erro || 'erro'))
      return
    }
    const tok = $('oc-token')
    if (tok) tok.value = ''
  }
  await carregarConfigOpenClawUi()
  alert('OpenClaw salvo.')
}

async function atualizarGitStatusArvore() {
  const raiz = state.pastaAtual
  if (!raiz) return
  try {
    const r = await window.api.invoke('git:status', raiz)
    gitStatusMap.clear()
    if (r?.ok && Array.isArray(r.itens)) {
      for (const it of r.itens) {
        gitStatusMap.set(String(it.path).replace(/\\/g, '/'), it.status)
      }
    }
    document.querySelectorAll('.tree-item[data-tipo="file"]').forEach((row) => {
      const abs = row.dataset.path || ''
      const rel = relPosix(abs, raiz)
      const st = gitStatusMap.get(rel)
      let badge = row.querySelector('.git-badge')
      if (!st) {
        badge?.remove()
        return
      }
      if (!badge) {
        badge = document.createElement('span')
        badge.className = 'git-badge'
        row.appendChild(badge)
      }
      badge.dataset.git = st
      badge.textContent = st
      badge.title = 'git ' + st
      badge.style.color = corGit(st)
    })
  } catch {
    /* */
  }
}

function criarNoFile(ent, nivel) {
  return _criarNoFile(ent, nivel, {
    extIcon,
    nomeAmigavelArquivo,
    raizWorkspaceDe,
    definirContextoPasta,
    abrirArquivoNaAba,
    abrirPainelDiff,
  })
}

$('btn-refresh-tree')?.addEventListener('click', () => {
  for (const [, st] of state.estadoArvore) st.filhosCarregados = false
  renderizarPastas().then(() => atualizarGitStatusArvore())
  void renderizarProjects(true)
  void atualizarStatusBar(state.pastaAtual)
})
$('btn-git-refresh')?.addEventListener('click', () => {
  void atualizarGitStatusArvore()
  void renderizarProjects(true)
  void atualizarStatusBar(state.pastaAtual)
})

// ---------- Sidebar modos: Projects / Explorer ----------
let sidebarMode = 'explorer'

function setSidebarMode(mode) {
  sidebarMode = mode === 'projects' ? 'projects' : 'explorer'
  const projects = $('projects-list')
  const folders = $('folder-list')
  const btnP = $('sidebar-mode-projects')
  const btnE = $('sidebar-mode-explorer')
  const isProjects = sidebarMode === 'projects'
  if (projects) projects.hidden = !isProjects
  if (folders) folders.hidden = isProjects
  btnP?.classList.toggle('active', isProjects)
  btnE?.classList.toggle('active', !isProjects)
  btnP?.setAttribute('aria-selected', isProjects ? 'true' : 'false')
  btnE?.setAttribute('aria-selected', isProjects ? 'false' : 'true')
  if (isProjects) void renderizarProjects()
}

/** Cache local do ultimo git:repos (main tambem cacheia 30s). */
let reposCacheLocal = { ts: 0, itens: [] }
const REPOS_CACHE_LOCAL_MS = 30000

async function obterReposGit(force) {
  if (
    !force &&
    reposCacheLocal.ts &&
    Date.now() - reposCacheLocal.ts <= REPOS_CACHE_LOCAL_MS
  ) {
    return reposCacheLocal.itens
  }
  try {
    const r = await window.api.invoke('git:repos', { pastas: [...state.pastasRecentes] })
    reposCacheLocal = { ts: Date.now(), itens: Array.isArray(r) ? r : [] }
  } catch (e) {
    console.warn('[projects] git:repos', e)
    reposCacheLocal = { ts: Date.now(), itens: [] }
  }
  return reposCacheLocal.itens
}

async function atualizarStatusBar(pasta) {
  const elBranch = $('sb-branch')
  const elPasta = $('sb-pasta')
  if (!elBranch || !elPasta) return
  if (!pasta) {
    elBranch.textContent = '—'
    elPasta.textContent = '—'
    return
  }
  const itens = await obterReposGit(false)
  const hit =
    itens.find((it) => it && it.pasta === pasta) ||
    itens.find(
      (it) =>
        it &&
        it.repo &&
        (pasta === it.pasta ||
          pasta.toLowerCase().startsWith(String(it.pasta).toLowerCase() + '\\') ||
          pasta.toLowerCase().startsWith(String(it.pasta).toLowerCase() + '/'))
    )
  if (hit && hit.repo) {
    elBranch.textContent = (hit.branch || 'HEAD') + (hit.dirty ? ' \u25CF' : '')
    elPasta.textContent = hit.repo
  } else {
    elBranch.textContent = '—'
    elPasta.textContent = nomeArquivo(pasta)
  }
}

async function renderizarProjects(force) {
  const lista = $('projects-list')
  if (!lista) return
  const t0 = performance.now()
  const itens = await obterReposGit(!!force)
  const ms = Math.round(performance.now() - t0)
  // Deduplicar por nome de repo (basename do toplevel); pastas sem repo somem
  const porRepo = new Map()
  for (const it of itens) {
    if (!it || !it.repo) continue
    if (!porRepo.has(it.repo)) porRepo.set(it.repo, it)
  }
  const unicos = [...porRepo.values()]
  lista.innerHTML = ''
  if (unicos.length === 0) {
    lista.innerHTML =
      '<p class="projects-empty">Nenhum repositório git nas pastas abertas.</p>'
    console.log('[projects] git:repos ' + ms + 'ms itens=0 pastas=' + state.pastasRecentes.length)
    void atualizarStatusBar(state.pastaAtual)
    return
  }
  for (const it of unicos) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'project-item' + (it.pasta === state.pastaAtual ? ' selected' : '')
    btn.dataset.path = it.pasta
    btn.title = it.pasta
    const nome = document.createElement('span')
    nome.className = 'project-name'
    nome.textContent = it.repo
    const branch = document.createElement('span')
    branch.className = 'project-branch'
    branch.textContent = '(' + (it.branch || '?') + ')'
    btn.appendChild(nome)
    btn.appendChild(branch)
    if (it.dirty) {
      const dot = document.createElement('span')
      dot.className = 'project-dirty'
      dot.title = 'Alterações não commitadas'
      btn.appendChild(dot)
    }
    const tempo = tempoRelativoCommit(it.ultimoCommitTs)
    if (tempo) {
      const t = document.createElement('span')
      t.className = 'project-time'
      t.textContent = tempo
      btn.appendChild(t)
    }
    btn.appendChild(criarBotaoRemoverPasta(it.pasta))
    btn.addEventListener('click', (e) => {
      if (e.target.closest('.pasta-remover')) return
      void selecionarPasta(it.pasta)
      setSidebarMode('explorer')
    })
    lista.appendChild(btn)
  }
  console.log(
    '[projects] git:repos ' +
      ms +
      'ms repos=' +
      unicos.length +
      ' pastas=' +
      state.pastasRecentes.length +
      ' dedup=' +
      (itens.filter((i) => i && i.repo).length - unicos.length)
  )
  void atualizarStatusBar(state.pastaAtual)
}

$('sidebar-mode-projects')?.addEventListener('click', () => setSidebarMode('projects'))
$('sidebar-mode-explorer')?.addEventListener('click', () => setSidebarMode('explorer'))
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
function chaveProjetoAbas() {
  const p = String(state.pastaAtual || '').trim()
  return p ? p.toLowerCase() : CHAVE_SEM_PROJETO
}

function lerMapaAbas() {
  try {
    return normalizarMapaAbas(JSON.parse(localStorage.getItem(CHAVE_ABAS) || '{}'), chaveProjetoAbas())
  } catch {
    return {}
  }
}

function salvarMapaAbas(mapa) {
  try {
    localStorage.setItem(CHAVE_ABAS, JSON.stringify(mapa))
  } catch {
    /* armazenamento cheio */
  }
}

function persistirAbas() {
  const mapa = lerMapaAbas()
  mapa[chaveProjetoAbas()] = {
    abas: state.abas.map((a) => a.caminho),
    ativa: state.abaAtiva,
    raiz: String(state.pastaAtual || ''),
    em: Date.now()
  }
  salvarMapaAbas(podarMapaAbas(mapa))
}

async function restaurarAbas() {
  try {
    const mapa = await podarProjetosInexistentes(lerMapaAbas(), existeRaizProjeto)
    salvarMapaAbas(mapa)
    const data = mapa[chaveProjetoAbas()] || {}
    const lista = Array.isArray(data.abas) ? data.abas : []
    for (const c of lista) {
      const existe = await window.api.invoke('arquivo:existe', c, pastasPermitidas())
      if (existe.ok && existe.existe) {
        const r = await window.api.invoke('arquivo:ler', c, pastasPermitidas())
        if (r.ok) {
          state.abas.push({ caminho: c, nome: nomeArquivo(c), dirty: false })
          // conteúdo fica no editor só para a ativa; dirty false
        }
      }
    }
    if (state.abas.length) {
      const alvo = data.ativa && state.abas.find((a) => a.caminho === data.ativa) ? data.ativa : state.abas[0].caminho
      await ativarAba(alvo)
    }
    renderizarAbas()
  } catch (e) {
    console.warn('[state.abas] restaurar:', e)
  }
}

async function existeRaizProjeto(raiz) {
  const r = await window.api.invoke('arquivo:existe', raiz, [raiz])
  return r?.ok === true && r.existe === true
}

function renderizarAbas() {
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
      extIcon(a.nome) +
      '<span class="tab-name">' +
      escapar(a.nome) +
      '</span>' +
      '<span class="tab-close" title="Fechar">×</span>'
    btn.title = a.caminho
    btn.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-close')) {
        e.stopPropagation()
        fecharAba(a.caminho)
      } else {
        ativarAba(a.caminho)
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
function initTecladoAbas() {
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
    const ok = await ativarAba(caminho)
    if (!ok) {
      bar.querySelector('.editor-tab.active')?.focus()
      return
    }
    const novo = [...bar.querySelectorAll('.editor-tab')].find((x) => x.dataset.caminho === caminho)
    novo?.focus()
  })
}
initTecladoAbas()

function atualizarEmpty() {
  const empty = $('editor-empty')
  if (!empty) return
  empty.classList.toggle('hidden', !!state.abaAtiva)
}

function atualizarBreadcrumb() {
  const bc = $('editor-breadcrumb')
  if (!bc) return
  bc.textContent = state.abaAtiva ? caminhoRelativo(state.abaAtiva) : ''
}

function extDe(caminho) {
  const m = String(caminho || '')
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

function ehMarkdown(caminho) {
  const e = extDe(caminho)
  return e === 'md' || e === 'markdown'
}

function ehImagemExt(caminho) {
  return /^(png|jpe?g|gif|webp)$/.test(extDe(caminho))
}

/** Renderer markdown mínimo + sanitização (sem HTML arbitrário). */
function sanitizarERenderMarkdown(src) {
  let t = String(src || '')
  t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  t = t.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
  t = t.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
  t = t.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
  t = t.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
  t = t.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
  t = t.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
  t = t.replace(/```([\s\S]*?)```/g, (_, code) => '<pre><code>' + code.trim() + '</code></pre>')
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  t = t.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>')
  t = t.replace(/(<li>.*<\/li>\n?)+/g, (m) => '<ul>' + m + '</ul>')
  t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>')
  t = t.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
    const parts = String(inner).split('|')
    const alvo = parts[0].trim()
    const label = (parts[1] || parts[0]).trim()
    const esc = (s) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
    return (
      '<a href="#" class="wiki-link" data-wiki-target="' +
      esc(alvo) +
      '">' +
      esc(label) +
      '</a>'
    )
  })
  t = t.replace(/^\|(.+)\|$/gm, (line) => {
    const cells = line
      .slice(1, -1)
      .split('|')
      .map((c) => '<td>' + c.trim() + '</td>')
      .join('')
    return '<tr>' + cells + '</tr>'
  })
  t = t.replace(/(<tr>.*<\/tr>\n?)+/g, (m) => '<table>' + m + '</table>')
  t = t.replace(/^(?!<[hupolt]|<li|<tr|<table|<pre)(.+)$/gm, '<p>$1</p>')
  // remove on* / script / iframe mesmo se vazarem
  t = t.replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  t = t.replace(/<\/?(script|iframe|object|embed)[^>]*>/gi, '')
  return t
}

let mdPreviewOn = false

function atualizarToolbarPreview(caminho) {
  const bar = $('editor-toolbar')
  const btn = $('btn-md-preview')
  const mdBox = $('md-preview')
  const imgBox = $('image-preview')
  if (!bar) return
  const md = ehMarkdown(caminho)
  const img = ehImagemExt(caminho)
  const temArquivo = !!caminho
  bar.classList.toggle('hidden', !temArquivo)
  if (btn) btn.classList.toggle('hidden', !md)
  if (!md) {
    mdPreviewOn = false
    mdBox?.classList.add('hidden')
    mdBox?.setAttribute('aria-hidden', 'true')
    $('editor-host')?.classList.remove('split-preview')
  }
  if (!img) {
    imgBox?.classList.add('hidden')
    imgBox?.setAttribute('aria-hidden', 'true')
  }
}

function toggleMdPreview() {
  const caminho = state.abaAtiva
  if (!ehMarkdown(caminho) || !editor) return
  mdPreviewOn = !mdPreviewOn
  const host = $('editor-host')
  const box = $('md-preview')
  if (!box || !host) return
  if (mdPreviewOn) {
    box.innerHTML = sanitizarERenderMarkdown(editor.getConteudo ? editor.getConteudo() : '')
    box.classList.remove('hidden')
    box.setAttribute('aria-hidden', 'false')
    host.classList.add('split-preview')
  } else {
    box.classList.add('hidden')
    box.setAttribute('aria-hidden', 'true')
    host.classList.remove('split-preview')
  }
}

/** @type {{ src: string, caminho: string } | null} */
let imgEditEstado = null

function imgEditInfo(msg) {
  const el = $('img-edit-info')
  if (el) el.textContent = msg || ''
}

function imgEditCanvas() {
  return /** @type {HTMLCanvasElement|null} */ ($('img-edit-canvas'))
}

function imgEditMostrarCanvas(show) {
  const canvas = imgEditCanvas()
  const img = $('image-preview-img')
  if (!canvas || !img) return
  canvas.hidden = !show
  img.style.display = show ? 'none' : ''
}

function imgEditSyncInputs() {
  const canvas = imgEditCanvas()
  const w = $('img-edit-w')
  const h = $('img-edit-h')
  if (!canvas || !w || !h) return
  w.value = String(canvas.width || '')
  h.value = String(canvas.height || '')
  imgEditInfo(canvas.width + '×' + canvas.height + ' px')
}

function imgEditCarregarDataUrl(dataUrl) {
  const canvas = imgEditCanvas()
  const img = $('image-preview-img')
  if (!canvas || !img) return
  const im = new Image()
  im.onload = () => {
    canvas.width = im.naturalWidth
    canvas.height = im.naturalHeight
    const ctx = canvas.getContext('2d')
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
    ctx?.drawImage(im, 0, 0)
    img.src = dataUrl
    imgEditMostrarCanvas(true)
    imgEditSyncInputs()
  }
  im.src = dataUrl
}

function imgEditResize() {
  const canvas = imgEditCanvas()
  if (!canvas) return
  const nw = Math.max(16, Math.min(8192, parseInt(String($('img-edit-w')?.value || '0'), 10) || 0))
  const nh = Math.max(16, Math.min(8192, parseInt(String($('img-edit-h')?.value || '0'), 10) || 0))
  if (!nw || !nh) {
    mostrarToast('Informe largura e altura', 'aviso')
    return
  }
  const tmp = document.createElement('canvas')
  tmp.width = nw
  tmp.height = nh
  tmp.getContext('2d')?.drawImage(canvas, 0, 0, nw, nh)
  canvas.width = nw
  canvas.height = nh
  canvas.getContext('2d')?.drawImage(tmp, 0, 0)
  imgEditSyncInputs()
  mostrarToast('Redimensionado para ' + nw + '×' + nh, 'ok')
}

function imgEditCropCentro() {
  const canvas = imgEditCanvas()
  if (!canvas) return
  const fator = 0.8
  const cw = Math.max(16, Math.floor(canvas.width * fator))
  const ch = Math.max(16, Math.floor(canvas.height * fator))
  const sx = Math.floor((canvas.width - cw) / 2)
  const sy = Math.floor((canvas.height - ch) / 2)
  const tmp = document.createElement('canvas')
  tmp.width = cw
  tmp.height = ch
  tmp.getContext('2d')?.drawImage(canvas, sx, sy, cw, ch, 0, 0, cw, ch)
  canvas.width = cw
  canvas.height = ch
  canvas.getContext('2d')?.drawImage(tmp, 0, 0)
  imgEditSyncInputs()
  mostrarToast('Recorte central aplicado', 'ok')
}

function imgEditReset() {
  if (!imgEditEstado?.src) return
  imgEditCarregarDataUrl(imgEditEstado.src)
  mostrarToast('Imagem original restaurada', 'ok')
}

function imgEditDownload() {
  const canvas = imgEditCanvas()
  if (!canvas) return
  const a = document.createElement('a')
  const base = (imgEditEstado?.caminho || 'imagem').split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'imagem'
  a.download = base + '-edit.png'
  a.href = canvas.toDataURL('image/png')
  a.click()
  mostrarToast('PNG baixado', 'ok')
}

function initEditorImagem() {
  if (document.body.dataset.imgEditWired === '1') return
  document.body.dataset.imgEditWired = '1'
  $('img-edit-resize')?.addEventListener('click', () => imgEditResize())
  $('img-edit-crop')?.addEventListener('click', () => imgEditCropCentro())
  $('img-edit-reset')?.addEventListener('click', () => imgEditReset())
  $('img-edit-download')?.addEventListener('click', () => imgEditDownload())
}

async function mostrarImagem(caminho) {
  const host = $('editor-host')
  const box = $('image-preview')
  const img = $('image-preview-img')
  const mount = $('editor-mount')
  if (!box || !img) return
  initEditorImagem()
  const r = await window.api.invoke('arquivo:ler-base64', caminho, pastasPermitidas())
  if (!r?.ok || !r.dataUrl) {
    alert('Não foi possível abrir imagem: ' + (r?.erro || 'erro'))
    return
  }
  imgEditEstado = { src: r.dataUrl, caminho: String(caminho || '') }
  imgEditCarregarDataUrl(r.dataUrl)
  box.classList.remove('hidden')
  box.setAttribute('aria-hidden', 'false')
  mount?.classList.add('hidden')
  $('editor-empty')?.classList.add('hidden')
  host?.classList.add('modo-imagem')
}

function esconderImagem() {
  const box = $('image-preview')
  const mount = $('editor-mount')
  box?.classList.add('hidden')
  box?.setAttribute('aria-hidden', 'true')
  mount?.classList.remove('hidden')
  $('editor-host')?.classList.remove('modo-imagem')
  imgEditEstado = null
  imgEditMostrarCanvas(false)
}

$('btn-md-preview')?.addEventListener('click', () => toggleMdPreview())

async function formatarDocumentoAtivo() {
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
$('btn-editor-formatar')?.addEventListener('click', () => void formatarDocumentoAtivo())

function atualizarBotoesHist() {
  const v = document.getElementById('tb-voltar')
  const a = document.getElementById('tb-avancar')
  const canBack = histIdx > 0
  const canFwd = histIdx >= 0 && histIdx < histAbas.length - 1
  if (v) {
    v.disabled = !canBack
    v.setAttribute('aria-disabled', canBack ? 'false' : 'true')
  }
  if (a) {
    a.disabled = !canFwd
    a.setAttribute('aria-disabled', canFwd ? 'false' : 'true')
  }
}

/** Empurra no histórico só se o caminho for diferente da posição atual (evita loop com irHistAbas). */
function registrarHistAba(caminho) {
  if (!caminho) return
  if (histAbas[histIdx] === caminho) {
    atualizarBotoesHist()
    return
  }
  histAbas = histAbas.slice(0, histIdx + 1)
  histAbas.push(caminho)
  histIdx = histAbas.length - 1
  if (histAbas.length > 100) {
    histAbas.shift()
    histIdx--
  }
  atualizarBotoesHist()
}

async function irHistAbas(delta) {
  const novo = histIdx + delta
  if (novo < 0 || novo >= histAbas.length) return
  const alvo = histAbas[novo]
  histIdx = novo
  try {
    await abrirArquivoNaAba(alvo)
    // arquivo apagado / falha de IPC: não ficou em state.abas
    if (!state.abas.some((a) => a.caminho === alvo)) {
      histAbas.splice(novo, 1)
      histIdx = Math.min(novo, histAbas.length - 1)
      if (histAbas.length === 0) histIdx = -1
    }
  } catch (e) {
    console.warn('[hist-state.abas]', e)
    histAbas.splice(novo, 1)
    histIdx = Math.min(novo, histAbas.length - 1)
    if (histAbas.length === 0) histIdx = -1
  }
  atualizarBotoesHist()
}

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
  if (mdPreviewOn && ehMarkdown(caminho)) {
    const box = $('md-preview')
    if (box) box.innerHTML = sanitizarERenderMarkdown(conteudo)
  } else {
    mdPreviewOn = false
    $('md-preview')?.classList.add('hidden')
    $('editor-host')?.classList.remove('split-preview')
  }
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

function perguntarDirty(caminho) {
  return new Promise((resolve) => {
    dirtyResolver = resolve
    $('dirty-msg').textContent =
      'O arquivo "' + nomeArquivo(caminho) + '" tem alterações não salvas. Deseja salvar?'
    $('modal-dirty').classList.remove('hidden')
  })
}

function fecharDirtyModal(resultado) {
  $('modal-dirty').classList.add('hidden')
  if (dirtyResolver) {
    const r = dirtyResolver
    dirtyResolver = null
    r(resultado)
  }
}

$('btn-dirty-cancel')?.addEventListener('click', () => fecharDirtyModal('cancelar'))
$('btn-dirty-discard')?.addEventListener('click', () => fecharDirtyModal('descartar'))
$('btn-dirty-save')?.addEventListener('click', () => fecharDirtyModal('salvar'))

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
      const abriu = await ativarAba(next.caminho)
      if (!abriu) {
        // Próxima aba não abriu (arquivo removido): sem re-render a barra
        // continuaria mostrando a aba recém-fechada como elemento fantasma.
        renderizarAbas()
        atualizarBreadcrumb()
        atualizarEmpty()
      }
    } else {
      editor?.limpar()
      histAbas = []
      histIdx = -1
      atualizarBotoesHist()
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

function atualizarDiagEditor(lista) {
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

const LS_MINIMAP = 'dg.editor.minimapa.ativo'
function aplicarMinimapa(ligado) {
  const btn = $('btn-editor-minimapa')
  if (btn) {
    btn.setAttribute('aria-pressed', ligado ? 'true' : 'false')
    btn.classList.toggle('ativo', ligado)
  }
  editor?.minimapaAlternar?.(ligado)
}
$('btn-editor-minimapa')?.addEventListener('click', () => {
  const ligado = !(editor?.minimapaVisivel?.() ?? false)
  localStorage.setItem(LS_MINIMAP, ligado ? '1' : '0')
  aplicarMinimapa(ligado)
})
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
const DG_CODIGOS_OLLAMA = new Set(['ERR_OLLAMA_OFFLINE', 'ERR_OLLAMA_MODEL_MISSING', 'ERR_LLM_TIMEOUT'])
function dgIsErroApp(v) {
  return !!v && typeof v === 'object' && typeof v.codigo === 'string' && typeof v.mensagem === 'string' && v.mensagem.trim().length > 0 && /^ERR_[A-Z0-9_]+$/.test(v.codigo)
}
function dgNormalizarErro(e, fallbackMsg) {
  if (dgIsErroApp(e)) return e
  if (e && typeof e === 'object' && dgIsErroApp(e.erro)) return e.erro
  if (typeof e === 'string' && e.trim()) return { codigo: 'ERR_UNKNOWN', mensagem: e.trim() }
  if (e && typeof e.erro === 'string' && e.erro.trim()) return { codigo: 'ERR_UNKNOWN', mensagem: e.erro.trim() }
  return { codigo: 'ERR_UNKNOWN', mensagem: String(fallbackMsg || 'Ocorreu um erro.'), detalhe: String(e && e.message ? e.message : e || '') }
}
function mostrarErroTipado(erro, alvoId) {
  const e = dgNormalizarErro(erro)
  const alvo = $(alvoId || 'analysis-content')
  if (!alvo) { mostrarToast(e.mensagem, 'erro'); return }
  alvo.innerHTML = renderizarErroHtml(e)
}

// ---------- Análise ----------
function habilitarBotoesAnalise(habilitar) {
  const rapida = $('btn-analise-rapida')
  const completa = $('btn-analise-completa')
  const disabled = !habilitar
  if (rapida) rapida.disabled = disabled
  if (completa) completa.disabled = disabled
  const whereisQ = $('whereis-query')
  const whereisBtn = $('btn-whereis')
  if (whereisQ) whereisQ.disabled = disabled
  if (whereisBtn) whereisBtn.disabled = disabled
}

async function solicitarDialogoEscopoAnalise(modo) {
  const resposta = await window.api.invoke('analysis:choose-scope', modo)
  if (resposta?.ok !== true || !Number.isInteger(resposta.response)) {
    throw new Error(resposta?.erro || 'Não foi possível abrir a escolha de escopo.')
  }
  return resposta.response
}

async function analisarCompleta(root, force = false) {
  try {
    const resposta = await solicitarDialogoEscopoAnalise('confirm-complete')
    if (resposta === 0) await rodarAnalise(root, 'completa', force)
  } catch (err) {
    mostrarToast('Não foi possível confirmar a análise completa: ' + String(err), 'erro')
  }
}

async function escolherEscopoAnalise(root, force = false) {
  try {
    const resposta = await solicitarDialogoEscopoAnalise('choose-scope')
    if (resposta === 0) await rodarAnalise(root, 'rapida', force)
    else if (resposta === 1) await analisarCompleta(root, force)
  } catch (err) {
    mostrarToast('Não foi possível escolher o escopo da análise: ' + String(err), 'erro')
  }
}

async function rodarAnalise(root, escopo = 'rapida', force = false) {
  $('analysis-progress').classList.remove('hidden')
  $('progress-text').textContent = force ? 'Analisando novamente...' : (escopo === 'completa' ? 'Analisando projeto inteiro...' : 'Analisando arquivos-chave...')
  $('analysis-content').innerHTML =
    '<p class="muted">' + (escopo === 'completa' ? 'Lendo o projeto inteiro' : 'Lendo os arquivos-chave') + ' e perguntando à IA...</p>'
  ativarAbaDireita('analise')
  try {
    const r = await window.api.analysisRun(root, force, escopo)
    if (!r || r.ok === false) {
      mostrarErroTipado(r || { codigo: 'ERR_UNKNOWN', mensagem: 'Falha na análise.' })
      return
    }
    const payload = (r.result && typeof r.result === 'object') ? r.result : r
    const report = payload && payload.report && typeof payload.report === 'object'
      ? payload.report
      : (payload && typeof payload === 'object' ? payload : null)
    if (!report || typeof report !== 'object') {
      mostrarErroTipado({ codigo: 'ERR_ANALYSIS_EMPTY', mensagem: 'A análise não retornou dados suficientes para exibir.', acao: 'Tente novamente com análise rápida.' })
      return
    }
    renderizarAnalise(report, !!payload.fromCache)
    $('analysis-content').dataset.escopo = escopo
    $('analysis-content').dataset.jaAnalisou = '1'
  } catch (err) {
    mostrarErroTipado(err)
  } finally {
    $('analysis-progress').classList.add('hidden')
  }
}

function renderizarAnalise(report, fromCache) {
  $('analysis-content').innerHTML = renderizarAnaliseHtml(report, fromCache)
}

// ---------- Onde está (whereis) ----------
async function buscarOndeEsta() {
  if (!state.pastaAtual) { mostrarToast('Abra uma pasta para buscar.', 'aviso'); return }
  const input = $('whereis-query')
  const q = (input?.value || '').trim()
  if (q.length < 2) { mostrarToast('Digite ao menos 2 caracteres.', 'aviso'); input?.focus(); return }
  const alvo = $('whereis-result')
  if (alvo) alvo.innerHTML = '<p class="muted">Buscando…</p>'
  try {
    const r = await window.api.invoke('whereis:ask', state.pastaAtual, q)
    if (!r || r.ok === false) {
      if (alvo) alvo.innerHTML = renderizarWhereisErroHtml(dgNormalizarErro(r, 'Falha na busca.'))
      return
    }
    const result = r.result || {}
    if (!alvo) return
    alvo.innerHTML = renderizarWhereisMatchesHtml(result, q)
    alvo.querySelectorAll('.whereis-hit-file').forEach((btn) => {
      btn.addEventListener('click', () => {
        const file = btn.getAttribute('data-file')
        if (file) void abrirArquivoNoEditor(file)
      })
    })
  } catch (err) {
    if (alvo) alvo.innerHTML = renderizarWhereisErroHtml(dgNormalizarErro(err, 'Busca falhou.'))
  }
}

// ---------- Chat ----------
const usoChatSessao = { entrada: 0, saida: 0, custoUSD: null, turnos: 0 }

function recontarUsoChat(msgs) {
  usoChatSessao.entrada = 0
  usoChatSessao.saida = 0
  usoChatSessao.custoUSD = null
  usoChatSessao.turnos = 0
  for (const m of Array.isArray(msgs) ? msgs : []) {
    const u = m?.usage
    if (!u) continue
    usoChatSessao.entrada += Number(u.entrada) || 0
    usoChatSessao.saida += Number(u.saida) || 0
    usoChatSessao.turnos++
    if (typeof u.custoUSD === 'number' && Number.isFinite(u.custoUSD)) {
      usoChatSessao.custoUSD = (usoChatSessao.custoUSD || 0) + u.custoUSD
    }
  }
  atualizarUsoChatUi()
}

function registrarUsoTurno(usage) {
  if (!usage || typeof usage !== 'object') return
  usoChatSessao.entrada += Number(usage.entrada) || 0
  usoChatSessao.saida += Number(usage.saida) || 0
  usoChatSessao.turnos++
  if (typeof usage.custoUSD === 'number' && Number.isFinite(usage.custoUSD)) {
    usoChatSessao.custoUSD = (usoChatSessao.custoUSD || 0) + usage.custoUSD
  }
  atualizarUsoChatUi()
}

function formatarTokensChat(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + ' M'
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.', ',') + 'k'
  return String(Math.round(n))
}

function atualizarUsoChatUi() {
  const el = $('chat-usage')
  if (!el) return
  const total = usoChatSessao.entrada + usoChatSessao.saida
  if (!usoChatSessao.turnos) {
    el.textContent = '0 tok'
    el.title = 'Tokens e custo estimados desta conversa'
    return
  }
  const custo = usoChatSessao.custoUSD
  const custoTxt =
    custo == null ? 'custo n/d' : custo === 0 ? 'grátis' : 'US$ ' + custo.toFixed(4).replace('.', ',')
  el.textContent = formatarTokensChat(total) + ' tok · ' + custoTxt
  el.title =
    'Entrada ' +
    formatarTokensChat(usoChatSessao.entrada) +
    ' · saída ' +
    formatarTokensChat(usoChatSessao.saida) +
    ' · ' +
    usoChatSessao.turnos +
    ' turno(s) — estimativa (~4 caracteres/token)'
}

function renderizarChat(msgs) {
  const area = $('chat-messages')
  area.innerHTML = ''
  const lista = normalizarMensagensChat(msgs)
  recontarUsoChat(lista)
  if (!lista.length) {
    area.classList.remove('has-msgs')
    area.innerHTML = markupEmptyStateChat()
    ligarEmptyStateChat()
    return
  }
  for (const m of lista) adicionarBolha(m.role, m.content, m.provider)
  marcarChatComMsgs()
  area.scrollTop = area.scrollHeight
}

function marcarChatComMsgs() {
  const area = $('chat-messages')
  if (!area) return
  const tem = !!area.querySelector('.msg, .bolha, .message, .chat-tool-trace, .dg-loading-bubble, .chat-work-card')
  area.classList.toggle('has-msgs', tem)
  if (tem) $('empty-state')?.classList.add('hidden')
}

function setChatLiveStatus(texto) {
  const el = $('chat-live-status')
  if (el) {
    if (!texto) {
      el.hidden = true
      el.textContent = ''
    } else {
      el.hidden = false
      el.innerHTML = '<span class="cls-dot" aria-hidden="true"></span><span>' + String(texto) + '</span>'
    }
  }
  const limpo = String(texto || '').replace(/\s+/g, ' ').trim()
  if (limpo) anunciar(limpo, { urgencia: /erro|falh|interromp|negad/i.test(limpo) ? 'assertivo' : 'educado' })
}

function ctxReeditarChat() {
  return {
    getArea: () => $('chat-messages'),
    getInput: () => /** @type {HTMLTextAreaElement|null} */ ($('chat-input')),
    emAndamento: () => !!chatEmAndamento,
    parar: () => pararChatOuAgente(),
    hist: histChat,
    limparUi: (opts) => limparUiAgenteChat(opts),
    ativarChat: () => ativarPainelCentro('chat'),
    marcarMsgs: () => marcarChatComMsgs(),
    toast: (msg, tipo) => mostrarToast(msg, tipo)
  }
}

function ligarAcoesBolha(div, role, content) {
  _ligarAcoesBolha(div, role, content, ctxReeditarChat())
}

async function reeditarMensagemUsuario(div) {
  await _reeditarMensagemUsuario(div, ctxReeditarChat())
}

function adicionarBolha(role, content, provider) {
  const area = $('chat-messages')
  const div = document.createElement('div')
  const texto =
    role === 'assistant' ? organizarRespostaCursor(content) : String(content ?? '')
  const b = bolhaHtml(role, texto, provider)
  div.className = b.cls
  div.innerHTML = b.html
  ligarAcoesBolha(div, role, content)
  area.appendChild(div)
  marcarChatComMsgs()
  animarEntradaMsg(div, role)
  area.scrollTop = area.scrollHeight
  return div
}

let chatEmAndamento = false

function setChatSendMode(mode) {
  const btn = $('chat-send')
  if (!btn) return
  const stop = mode === 'stop'
  chatEmAndamento = stop
  btn.classList.toggle('is-stop', stop)
  btn.dataset.mode = stop ? 'stop' : 'send'
  btn.title = stop ? 'Parar' : 'Enviar'
  btn.setAttribute('aria-label', stop ? 'Parar' : 'Enviar')
  const sendIcon = btn.querySelector('.chat-send-icon')
  const stopIcon = btn.querySelector('.chat-stop-icon')
  if (sendIcon) sendIcon.hidden = stop
  if (stopIcon) stopIcon.hidden = !stop
  if (stop) btn.disabled = false
  else if (!state.pastaAtual) btn.disabled = true
}

function limparUiAgenteChat(opts = {}) {
  const area = $('chat-messages')
  setChatSendMode('send')
  setChatLiveStatus('')
  fecharCartaoTrabalho(area, opts.tituloFinal || 'Parado')
  ocultarBannerAgentMode(area)
  const strip = area && area.querySelector ? area.querySelector('.chat-work-stats') : null
  if (strip) {
    strip.textContent = ''
    strip.hidden = true
  }
  const live = document.getElementById('agent-stats-live')
  if (live) {
    live.textContent = ''
    live.hidden = true
  }
  if (opts.limparCards) limparChatParityCards(area)
  void removerLoadingChat({ imediato: true })
  if (state.pastaAtual && $('chat-send')) $('chat-send').disabled = false
}

async function pararChatOuAgente() {
  try {
    const r = await window.api.invoke('agente:cancelar')
    limparUiAgenteChat({ tituloFinal: 'Parado a seu pedido' })
    appendChatToolTrace('■ parado (' + (r?.cancelados || 0) + ')', {
      humano: 'Parado a seu pedido',
      titulo: 'Parado',
      ok: true
    })
    mostrarToast('Geração interrompida', 'aviso')
  } catch (e) {
    limparUiAgenteChat({ tituloFinal: 'Parado' })
    mostrarToast('Falha ao parar: ' + String(e), 'erro')
  }
}

/** Barra Apply/Rejeitar no editor (estilo Cursor inline diff). */
function mostrarEditorDiffBar(pendente, meta) {
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

function ocultarEditorDiffBar() {
  const bar = $('editor-diff-bar')
  if (!bar) return
  bar.hidden = true
  delete bar.dataset.propostaId
}

/** @type {Awaited<ReturnType<typeof iniciarHistoricoChat>> | null} */
let histChat = null


function appendChatToolTrace(line, opts = {}) {
  const area = $('chat-messages')
  if (!area) return
  $('empty-state')?.classList.add('hidden')
  const bruto = String(line || '')
  const humano = opts.humano || humanizarStatus(bruto)
  const titulo = opts.titulo || (opts.erro ? 'Algo não deu certo' : 'Trabalhando no seu pedido…')
  atualizarCartaoTrabalho(area, {
    titulo,
    passo: humano,
    ok: !!opts.ok,
    erro: !!opts.erro
  })
  marcarChatComMsgs()
  area.scrollTop = area.scrollHeight
  appendAgentTraceLive(humano)
  setChatLiveStatus(humano)
}

function skillAtivaChat() {
  try { return localStorage.getItem('dg-chat-skill') || '' } catch { return '' }
}

function definirSkillChat(id, titulo) {
  try {
    if (id) localStorage.setItem('dg-chat-skill', id)
    else localStorage.removeItem('dg-chat-skill')
    if (titulo) localStorage.setItem('dg-chat-skill-titulo', titulo)
    else localStorage.removeItem('dg-chat-skill-titulo')
  } catch {}
  atualizarChipSkillChat()
  if (id) {
    focarPainelIa('chat')
    mostrarToast('Skill ativa: ' + (titulo || id), 'ok')
  }
}

function atualizarChipSkillChat() {
  const meta = $('chat-header-meta')
  if (!meta) return
  let chip = document.getElementById('chat-skill-chip')
  const id = skillAtivaChat()
  let titulo = ''
  try { titulo = localStorage.getItem('dg-chat-skill-titulo') || id } catch { titulo = id }
  if (!id) {
    if (chip) chip.remove()
    return
  }
  if (!chip) {
    chip = document.createElement('button')
    chip.type = 'button'
    chip.id = 'chat-skill-chip'
    chip.className = 'chat-skill-chip'
    chip.title = 'Clique para remover a skill do proximo turno'
    chip.addEventListener('click', () => definirSkillChat('', ''))
    meta.appendChild(chip)
  }
  chip.textContent = 'Skill: ' + titulo + ' ×'
}

window.dgChatUsarSkill = definirSkillChat

async function enviarMensagem() {
  let pastaChat = resolverPastaChatAtiva()
  if (!pastaChat) {
    mostrarToast('Selecione um repositório no Bloco 1 para o chat analisar a pasta.', 'aviso')
    return
  }
  // Stop só se ESTE repositório já está rodando; outros repos podem seguir em paralelo
  if (chatEmAndamento && pastaTemJob(pastaChat)) {
    await pararChatOuAgente()
    return
  }
  if (pastaChat !== state.pastaAtual) {
    await sincronizarContextoPasta(pastaChat, { forceAnalise: true })
    pastaChat = state.pastaAtual || pastaChat
  } else {
    try {
      await window.api.invoke('workspace:definir-raiz', pastaChat)
    } catch {
      /* */
    }
  }
  const input = $('chat-input')
  const texto = input.value.trim()
  if (!texto) return
  ativarPainelCentro('chat')
  input.value = ''
  adicionarBolha('user', texto)
  const chatIdJob = histChat?.obterId?.() || 'default'
  const histDoJob = histChat
  histDoJob?.registrarMensagem('user', texto)
  setChatSendMode('stop')
  setChatLiveStatus('Analisando o repositório…')
  mostrarLoadingChat()
  let falhou = false
  let streamTexto = ''
  let streamBolha = null
  let streamSpan = null
  const modoAnuncio = lerPreferenciasA11y().anuncioStreaming
  let anuncioAte = 0
  let offProg = null
  const jobInicio = Date.now()
  ultimoStatusAgente = ''
  const agentStats = criarStatsVazios()
  registrarJob({
    pasta: pastaChat,
    chatId: chatIdJob,
    titulo: texto.slice(0, 48),
    iniciadoEm: jobInicio,
    passo: 'Iniciando…',
    tituloCard: 'Trabalhando…',
    stats: agentStats
  })
  pintarSidebarJobs(() => state.pastaAtual)
  const pastaDesteJob = pastaChat
  const visivelNesteJob = () =>
    String(state.pastaAtual || '').toLowerCase() === String(pastaDesteJob || '').toLowerCase()
  // Leitor de tela: anuncia frases completas do stream, nunca token a token.
  const anunciarTrechoStream = () => {
    if (modoAnuncio === 'silencioso' || !visivelNesteJob()) return
    const minimo = modoAnuncio === 'completo' ? 15 : 40
    const fallback = modoAnuncio === 'completo' ? 120 : 280
    const novo = streamTexto.slice(anuncioAte)
    if (novo.length < minimo) return
    let corte = -1
    for (const fim of ['. ', '! ', '? ', '… ', '.\n', '!\n', '?\n']) {
      corte = Math.max(corte, novo.lastIndexOf(fim))
    }
    if (corte >= 0) corte += 1
    else if (novo.length >= fallback) corte = novo.lastIndexOf(' ', fallback - 20) + 1
    if (corte <= 0) return
    const trecho = novo.slice(0, corte).trim()
    anuncioAte += corte
    if (trecho) anunciar(trecho)
  }
  const offDelta = window.api.on('chat:delta', (_evt, payload) => {
    if (!visivelNesteJob()) return
    const p = payload || {}
    if (p.reset) {
      streamTexto = ''
      anuncioAte = 0
      if (streamSpan) streamSpan.textContent = ''
      return
    }
    if (!p.delta) return
    const area = $('chat-messages')
    if (!streamBolha) {
      void removerLoadingChat({ imediato: true })
      streamBolha = adicionarBolha('assistant', '')
      streamSpan = streamBolha.querySelector('.msg-text')
    }
    streamTexto += p.delta
    if (streamSpan) streamSpan.textContent = streamTexto
    if (area) area.scrollTop = area.scrollHeight
    anunciarTrechoStream()
  })
  try {
    const agenteSel = document.getElementById('chat-agent-select')
    const modoSel = document.getElementById('chat-mode-select')
    const planToggle = document.getElementById('agent-plan-mode')
    let modo = modoSel?.value || 'auto'
    const forcarAgent = pedidoExigeAgentMode(texto) && modo !== 'ask' && modo !== 'plan'
    if (forcarAgent) {
      // UI: option "Agent" = value "code"; main tambem aceita "agent"
      modo = 'code'
      if (modoSel) modoSel.value = 'code'
      if (visivelNesteJob()) {
        mostrarBannerAgentMode(
          $('chat-messages'),
          'Pedido de aplicar/implementar/auditar — sair do Plan/Ask e executar sozinho'
        )
      }
    }
    if (planToggle?.checked && modo !== 'ask' && !forcarAgent) modo = 'plan'
    if (modo === 'plan' && planToggle) planToggle.checked = true
    if (modo === 'plan' && visivelNesteJob()) {
      toggleRight(true)
      ativarAbaDireita('agent')
      setChatLiveStatus('Modo Plan — abrindo o bloco 3 para o plano…')
      appendChatToolTrace('… Planejando os passos no painel Execução')
    }
    const agente = agenteSel?.value || 'auto'
    sincronizarAgenteSelects('chat')
    const autoAprovar = (() => {
      try {
        if (forcarAgent) return true
        return localStorage.getItem('dg-chat-autoapprove') === '1'
      } catch {
        return !!forcarAgent
      }
    })()
    const skill = skillAtivaChat()
    const patchUiProgresso = (passo, titulo, extra) => {
      atualizarJob(pastaDesteJob, chatIdJob, {
        passo,
        tituloCard: titulo,
        stats: { ...agentStats },
        log: extra?.log
      })
      pintarSidebarJobs(() => state.pastaAtual)
      if (!visivelNesteJob()) return
      atualizarCartaoTrabalho($('chat-messages'), {
        titulo: titulo || (forcarAgent ? 'Modo Agent…' : 'Trabalhando no seu pedido…'),
        passo,
        elapsedSec: (Date.now() - jobInicio) / 1000,
        modelo: extra?.modelo,
        log: extra?.log,
        ok: extra?.ok,
        erro: extra?.erro
      })
      pintarStatsNoCartao($('chat-messages'), agentStats)
    }
    offProg = window.api.on?.('agente:progresso', (_e, ev) => {
      if (!ev || typeof ev !== 'object') return
      if (ev.raiz && String(ev.raiz).toLowerCase() !== String(pastaDesteJob).toLowerCase()) return
      aplicarEventoStats(agentStats, ev)
      if (ev.tipo === 'heartbeat') {
        const h =
          'Passo ' +
          ev.passo +
          ' de ' +
          ev.max +
          ' — aguardando modelo (' +
          (ev.modelo || '') +
          ')…'
        patchUiProgresso(h, forcarAgent ? 'Modo Agent…' : 'Trabalhando…', {
          modelo: ev.modelo
        })
        if (visivelNesteJob()) setChatLiveStatus(humanizarStatus(h))
        return
      }
      if (ev.tipo === 'stats' || ev.tipo === 'tool' || ev.tipo === 'proposta') {
        if (visivelNesteJob()) pintarStatsNoCartao($('chat-messages'), agentStats)
        atualizarJob(pastaDesteJob, chatIdJob, { stats: { ...agentStats } })
        pintarSidebarJobs(() => state.pastaAtual)
      }
      if (ev.tipo === 'status') {
        const h = humanizarStatus(ev.texto)
        patchUiProgresso(h, forcarAgent ? 'Modo Agent…' : 'Trabalhando no seu pedido…', {
          modelo: ev.modelo,
          log: h
        })
        if (visivelNesteJob()) {
          appendChatToolTrace(ev.texto, {
            humano: h,
            titulo: forcarAgent ? 'Modo Agent…' : 'Trabalhando no seu pedido…'
          })
        }
      } else if (ev.tipo === 'tool' && ev.fase === 'inicio') {
        const h = humanizarToolInicio(ev.nome) + '…'
        patchUiProgresso(h, forcarAgent ? 'Modo Agent — explorando…' : 'Explorando o projeto…', {
          log: h
        })
        if (visivelNesteJob()) {
          appendChatToolTrace(String(ev.nome), {
            humano: h,
            titulo: forcarAgent ? 'Modo Agent — explorando…' : 'Explorando o projeto…'
          })
        }
      } else if (ev.tipo === 'tool' && ev.fase === 'fim') {
        const h = humanizarToolFim(ev.nome, ev.detalhe)
        const erro = /falt|erro|falha|não encont|nao encont/i.test(String(ev.detalhe || ''))
        patchUiProgresso(h, erro ? 'Ajuste no caminho…' : 'Trabalhando no seu pedido…', {
          log: h,
          ok: !erro,
          erro
        })
        if (visivelNesteJob()) {
          appendChatToolTrace(String(ev.nome), {
            humano: h,
            ok: !erro,
            erro,
            titulo: erro ? 'Ajuste no caminho…' : 'Trabalhando no seu pedido…'
          })
        }
      } else if (ev.tipo === 'proposta') {
        if (visivelNesteJob()) {
          appendChatToolTrace('proposta', {
            humano: 'Sugestão de mudança pronta — veja no Bloco 3 (Execução)',
            titulo: 'Revisão necessária',
            ok: true
          })
          toggleRight(true)
          ativarAbaDireita('agent')
          if (ev.id) void previewDiffNoEditor({ id: ev.id, path: ev.path })
        }
      }
    })
    if (visivelNesteJob()) {
      setChatLiveStatus(
        modo === 'plan'
          ? 'Montando o plano…'
          : forcarAgent
            ? 'Modo Agent — explorando, editando e validando…'
            : 'Pesquisando no repositório…'
      )
      atualizarCartaoTrabalho($('chat-messages'), {
        titulo: modo === 'plan' ? 'Montando o plano…' : forcarAgent ? 'Modo Agent' : 'Trabalhando no repositório…',
        passo:
          modo === 'plan'
            ? 'Vou listar o que podemos fazer'
            : 'Analisando a pasta ' + nomePastaUi(pastaChat) + '…',
        elapsedSec: 0
      })
    }
    const r = await window.api.invoke('chat:send', pastaChat, texto, {
      agente,
      modo,
      autoAprovar,
      anexos: chatAnexos,
      arquivo: state.abaAtiva || '',
      skill,
      verificarApos:
        modo !== 'plan' &&
        modo !== 'ask' &&
        (document.getElementById('agent-verify-loop')?.checked !== false)
    })
    chatAnexos = []
    renderizarAnexosChat()
    const ok = r && r.ok !== false && r.message && r.message.content
    let conteudo = organizarRespostaCursor(
      ok ? r.message.content : r?.message?.content || 'Não consegui responder.'
    )
    falhou = !ok || (r.message && r.message.provider === 'erro')
    if (visivelNesteJob()) {
      if (!streamBolha) await removerLoadingChat({ erro: falhou })
      else await removerLoadingChat({ imediato: true })
      fecharCartaoTrabalho($('chat-messages'), falhou ? 'Não concluído' : 'Pronto')
      pintarStatsNoCartao($('chat-messages'), agentStats)
      if (!falhou) ocultarBannerAgentMode($('chat-messages'))
    }
    let bolha = streamBolha
    const prov = r?.message?.provider
    const provLimpo = prov && !/:free\b/i.test(prov) ? prov : (prov && /ollama/i.test(prov) ? prov : '')
    if (visivelNesteJob()) {
      if (bolha && streamSpan) {
        const b = bolhaHtml('assistant', conteudo, provLimpo || undefined)
        bolha.innerHTML = b.html
        bolha.className = b.cls
        ligarAcoesBolha(bolha, 'assistant', conteudo)
      } else {
        bolha = adicionarBolha('assistant', conteudo, provLimpo || undefined)
      }
      const areaChat = $('chat-messages')
      if (areaChat) areaChat.scrollTop = areaChat.scrollHeight
    }
    // Sempre persiste no histórico do job (mesmo se o usuário mudou de repo)
    if (!falhou) {
      histDoJob?.registrarMensagem('assistant', conteudo, r.message.provider)
      registrarUsoTurno(r.usage || r.message?.usage)
      if (visivelNesteJob() && Array.isArray(r.tentativas) && r.tentativas.length > 1) {
        appendChatToolTrace('Fallback de provedor: ' + r.tentativas.join(' → '))
      }
      if (visivelNesteJob() && r.message.provider) atualizarBadgeProvedor(r.message.provider)
      if (visivelNesteJob() && (r.plano || modo === 'plan')) {
        const plano = r.plano || (await window.api.invoke('agente:plano-ler'))?.plano
        if (plano?.passos?.length) {
          renderPlanoChecklist(plano)
          atualizarChatPlanoCard(plano)
        }
      }
      if (visivelNesteJob() && Array.isArray(r.propostas) && r.propostas.length) {
        mostrarPropostasAgent(r.propostas)
        atualizarChatApplyCard(r.propostas)
        appendChatToolTrace(r.propostas.length + ' proposta(s) — Apply no chat ou na aba Agente')
      }
      if (visivelNesteJob() && r.autoAprovacao?.aplicada) {
        appendChatToolTrace('aprovação automática: ' + (r.autoAprovacao.motivo || 'ok'))
        mostrarChatRestoreAposApply([])
      }
      if (visivelNesteJob()) {
        atualizarStatusAgent(
          r.message?.provider || r.modelo || null,
          r.duracaoMs ?? r.ms ?? null,
          r.fila || null
        )
      }
    }
    void bolha
  } catch (err) {
    falhou = true
    if (visivelNesteJob()) {
      await removerLoadingChat({ erro: !streamBolha, imediato: !!streamBolha })
      if (!streamBolha) adicionarBolha('assistant', 'Não consegui responder.')
      else if (streamSpan && !streamTexto) streamSpan.textContent = 'Não consegui responder.'
    }
    console.info('[chat] erro invoke:', err)
  } finally {
    if (typeof offDelta === 'function') offDelta()
    if (typeof offProg === 'function') offProg()
    removerJob(pastaDesteJob, chatIdJob)
    pintarSidebarJobs(() => state.pastaAtual)
    if (visivelNesteJob()) {
      if (falhou) {
        limparUiAgenteChat({ tituloFinal: 'Não concluí — veja a mensagem acima' })
      } else {
        setChatSendMode('send')
        fecharCartaoTrabalho($('chat-messages'), 'Pronto')
        setChatLiveStatus('Pronto')
        setTimeout(() => setChatLiveStatus(''), 1800)
        ocultarBannerAgentMode($('chat-messages'))
      }
      if (state.pastaAtual) $('chat-send').disabled = false
      marcarChatComMsgs()
      input.focus()
    } else {
      // Outro repo na tela: só ajusta o botão se o repo atual não tem job
      if (!pastaTemJob(state.pastaAtual)) setChatSendMode('send')
    }
    void histDoJob?.flushSalvar?.()
    agendarSalvarWorkspace()
  }
}

async function ligarHistoricoChat(raiz) {
  let preferido = ''
  try {
    preferido = localStorage.getItem('dg-chat-ativo') || ''
  } catch {
    preferido = ''
  }
  histChat = await iniciarHistoricoChat(raiz, {
    chatIdPreferido: preferido,
    listarPastas: () => (state.pastasRecentes || []).slice(),
    nomePasta: (p) => nomePastaUi(p),
    onRemoverPasta: (pasta) => removerPasta(pasta),
    onTrocarPasta: async (pasta, chatId) => {
      if (chatId) {
        try {
          localStorage.setItem('dg-chat-ativo', chatId)
        } catch {
          /* */
        }
      }
      if (pasta && pasta !== state.pastaAtual) {
        await sincronizarContextoPasta(pasta, { chatId, forceAnalise: true })
        ativarAbaCentro('chat')
        return
      }
      if (chatId && histChat?.carregar) await histChat.carregar(chatId)
    },
    onRender: (msgs) => {
      const empty = $('empty-state')
      if (empty) empty.classList.add('hidden')
      renderizarChat(msgs || [])
    },
    onNova: () => {
      const empty = $('empty-state')
      if (empty) empty.classList.add('hidden')
      renderizarChat([])
      agendarSalvarWorkspace()
    }
  })
  agendarSalvarWorkspace()
}

/** Nova conversa: limpa UI e reseta estado do histórico (chat.js). */
function novaConversaUi() {
  ativarPainelCentro('chat')
  if (histChat && typeof histChat.nova === 'function') {
    histChat.nova()
    return
  }
  $('empty-state')?.classList.add('hidden')
  renderizarChat([])
}

function abrirOrientadorPrompt() {
  const modal = $('modal-prompt-orientador')
  const input = $('prompt-orientador-input')
  const output = $('prompt-orientador-output')
  if (!modal || !input || !output) return
  input.value = $('chat-input')?.value?.trim() || ''
  output.value = ''
  modal.classList.remove('hidden')
  setTimeout(() => input.focus(), 0)
}

function fecharOrientadorPrompt(restaurarFoco = true) {
  const modal = $('modal-prompt-orientador')
  if (modal) modal.classList.add('hidden')
  if (restaurarFoco) $('btn-prompt-orientador')?.focus()
}

async function melhorarPromptLocal() {
  const input = $('prompt-orientador-input')
  const output = $('prompt-orientador-output')
  const btn = $('btn-prompt-melhorar')
  if (!input || !output || !btn) return
  const valor = input.value.trim()
  if (!valor) {
    output.value = 'Digite um prompt para melhorar.'
    return
  }
  btn.disabled = true
  btn.textContent = 'Melhorando...'
  let timeoutId
  try {
    const raiz = state.pastaAtual || state.pastasRecentes[0] || '.'
    const resposta = window.api.invoke('orientar:prompt', raiz, valor)
    const r = await Promise.race([
      resposta,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('timeout')), 32_000)
      })
    ])
    if (!r || r.ok !== true || typeof r.resultado !== 'string' || !r.resultado.trim()) {
      const erro = r?.erro === 'timeout' ? 'Tempo limite excedido nas duas tentativas.' : (r?.erro || 'Não foi possível melhorar o prompt.')
      output.value = erro
      mostrarToast(erro, 'erro')
      return
    }
    output.value = r.resultado
    const tokens = Number.isFinite(r.tokensGenerated) ? r.tokensGenerated + ' tokens' : 'tokens não informados'
    mostrarToast('Prompt refinado por ' + r.modelo + ' em ' + r.elapsedMs + ' ms (' + tokens + ').', 'ok')
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    const erro = /timeout/i.test(mensagem) ? 'Tempo limite excedido nas duas tentativas.' : 'Falha ao melhorar o prompt: ' + mensagem
    output.value = erro
    mostrarToast(erro, 'erro')
  } finally {
    clearTimeout(timeoutId)
    btn.disabled = false
    btn.textContent = 'Melhorar prompt'
  }
}

function usarPromptNoChat() {
  const output = $('prompt-orientador-output')
  const input = $('chat-input')
  if (!output || !input) return
  const valor = output.value.trim()
  if (!valor) return
  input.value = valor
  fecharOrientadorPrompt(false)
  input.focus()
  input.setSelectionRange(input.value.length, input.value.length)
}

async function copiarPromptOrientador() {
  const output = $('prompt-orientador-output')
  if (!output) return
  const valor = output.value.trim()
  if (!valor) return
  let copiado = false
  try {
    await navigator.clipboard.writeText(valor)
    copiado = true
  } catch {
    const campo = document.createElement('textarea')
    campo.value = valor
    document.body.appendChild(campo)
    campo.select()
    copiado = document.execCommand('copy')
    campo.remove()
  }
  mostrarToast(copiado ? 'Prompt copiado.' : 'Não foi possível copiar o prompt.', copiado ? 'ok' : 'erro')
}

function enviarMensagemUi() { void enviarMensagem() }
$('chat-send')?.addEventListener('click', enviarMensagemUi)
iniciarComposer($('chat-input'), { onEnviar: enviarMensagemUi })
$('btn-prompt-fechar')?.addEventListener('click', () => fecharOrientadorPrompt())
$('btn-prompt-melhorar')?.addEventListener('click', () => void melhorarPromptLocal())
$('btn-prompt-usar')?.addEventListener('click', () => usarPromptNoChat())
$('btn-prompt-copiar')?.addEventListener('click', () => void copiarPromptOrientador())

/** Popover de contexto dos ícones do chat (clique → contexto → ação). */
function initChatIconContext() {
  const pop = document.getElementById('chat-ctx-popover')
  if (!pop || pop.dataset.wired === '1') return
  pop.dataset.wired = '1'
  let ativo = null

  const fechar = () => {
    pop.hidden = true
    pop.replaceChildren()
    if (ativo) {
      ativo.setAttribute('aria-expanded', 'false')
      ativo = null
    }
  }

  const posicionar = (btn) => {
    const host = btn.closest('#chat-panel') || document.body
    if (pop.parentElement !== host) host.appendChild(pop)
    pop.hidden = false
    pop.style.maxHeight = ''
    pop.classList.remove('chat-ctx-popover--up', 'chat-ctx-popover--down')
    const br = btn.getBoundingClientRect()
    const hr = host.getBoundingClientRect()
    const gap = 6
    const pw = Math.min(pop.offsetWidth || 240, hr.width - 16)
    const ph = pop.offsetHeight || 160
    const spaceAbove = br.top - hr.top
    const spaceBelow = hr.bottom - br.bottom
    // Preferir abrir para cima (composer fica na base)
    const abrirCima = spaceAbove >= Math.min(ph + gap, 120) || spaceAbove >= spaceBelow
    pop.classList.add(abrirCima ? 'chat-ctx-popover--up' : 'chat-ctx-popover--down')
    const maxH = Math.max(120, (abrirCima ? spaceAbove : spaceBelow) - gap - 8)
    pop.style.maxHeight = maxH + 'px'
    let top
    if (abrirCima) {
      top = br.top - hr.top - Math.min(ph, maxH) - gap
      if (top < 8) top = 8
    } else {
      top = br.bottom - hr.top + gap
    }
    let left = br.left - hr.left
    const maxLeft = Math.max(8, hr.width - pw - 8)
    if (left > maxLeft) left = maxLeft
    if (left < 8) left = 8
    pop.style.top = top + 'px'
    pop.style.left = left + 'px'
    pop.style.width = pw + 'px'
  }

  const mkBtn = (label, primary, onClick) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = primary ? 'btn-small btn-primary' : 'btn-small'
    b.textContent = label
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      fechar()
      onClick()
    })
    return b
  }

  const mkOption = (label, selected, onClick) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'chat-ctx-option chat-ctx-option--row'
    b.textContent = label
    if (selected) b.setAttribute('aria-selected', 'true')
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      fechar()
      onClick()
    })
    return b
  }

  const abrir = (btn) => {
    const id = btn.getAttribute('data-chat-ctx')
    if (!id) return
    if (ativo === btn && !pop.hidden) {
      fechar()
      return
    }
    // "Mais" já tem menu próprio
    if (id === 'mais') return

    fechar()
    ativo = btn
    btn.setAttribute('aria-expanded', 'true')

    const title = document.createElement('p')
    title.className = 'chat-ctx-popover-title'
    const desc = document.createElement('p')
    desc.className = 'chat-ctx-popover-desc'
    const meta = document.createElement('p')
    meta.className = 'chat-ctx-popover-meta'
    const actions = document.createElement('div')
    actions.className = 'chat-ctx-popover-actions'

    if (id === 'nova') {
      title.textContent = 'Nova conversa'
      desc.textContent = 'Limpa o chat atual e começa outra sessão.'
      actions.appendChild(mkBtn('Criar nova', true, () => novaConversaUi()))
    } else if (id === 'anexar') {
      title.textContent = 'Anexar arquivos'
      desc.textContent = 'Os anexos entram no próximo envio do composer.'
      actions.appendChild(mkBtn('Escolher arquivos', true, () => {
        document.getElementById('chat-anexos-input')?.click()
      }))
    } else if (id === 'prompt') {
      title.textContent = 'Melhorar prompt'
      desc.textContent = 'Abre o assistente para refinar o texto do composer com o modelo local.'
      meta.innerHTML = 'Atalho <kbd>Ctrl+Alt+P</kbd>'
      actions.appendChild(mkBtn('Abrir assistente', true, () => abrirOrientadorPrompt()))
    } else if (id === 'mode') {
      const sel = document.getElementById('chat-mode-select')
      title.textContent = 'Modo'
      desc.textContent = 'Define como o Agent interpreta o pedido.'
      const modos = [
        ['auto', 'Auto'],
        ['code', 'Agent'],
        ['plan', 'Plan'],
        ['ask', 'Ask'],
        ['debug', 'Debug']
      ]
      actions.classList.add('chat-ctx-popover-actions--list')
      for (const [val, label] of modos) {
        actions.appendChild(mkOption(label, sel?.value === val, () => {
          if (!sel) return
          sel.value = val
          sel.dispatchEvent(new Event('change', { bubbles: true }))
          const modeBtn = document.getElementById('btn-chat-mode')
          if (modeBtn) modeBtn.title = 'Modo: ' + label
        }))
      }
    } else if (id === 'agent') {
      const sel = document.getElementById('chat-agent-select')
      title.textContent = 'Agente'
      desc.textContent = 'Escolha um agente (lista). Auto escolhe sozinho.'
      actions.classList.add('chat-ctx-popover-actions--list')
      const opts = sel ? Array.from(sel.options) : []
      const vistos = new Set()
      for (const o of opts) {
        if (!o.value) continue
        const key = String(o.value).toLowerCase()
        if (vistos.has(key)) continue
        vistos.add(key)
        actions.appendChild(mkOption(o.textContent || o.value, sel.value === o.value, () => {
          sel.value = o.value
          sel.dispatchEvent(new Event('change', { bubbles: true }))
          const agentBtn = document.getElementById('btn-chat-agent')
          if (agentBtn) agentBtn.title = 'Agente: ' + (o.textContent || o.value)
        }))
      }
    } else {
      return
    }

    pop.replaceChildren(title, desc)
    if (meta.innerHTML) pop.appendChild(meta)
    pop.appendChild(actions)
    posicionar(btn)
  }

  document.querySelectorAll('.chat-ctx-btn[data-chat-ctx]').forEach((btn) => {
    if (btn.dataset.ctxWired === '1') return
    btn.dataset.ctxWired = '1'
    btn.setAttribute('aria-expanded', 'false')
    btn.addEventListener('click', (e) => {
      const id = btn.getAttribute('data-chat-ctx')
      if (id === 'mais') return
      e.preventDefault()
      e.stopPropagation()
      abrir(btn)
    })
  })

  document.addEventListener('click', (ev) => {
    if (pop.hidden) return
    const t = ev.target
    if (pop.contains(t) || (ativo && ativo.contains(t))) return
    fechar()
  })
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !pop.hidden) {
      fechar()
      ativo?.focus()
    }
  })
  window.dgFecharChatCtx = fechar
}

initChatIconContext()

// ---------- Janelas flutuantes (Config / Contas): arrastar + sempre à frente ----------
let dgFloatZ = 20000

function trazerJanelaFrente(modalEl) {
  if (!modalEl) return
  dgFloatZ += 1
  modalEl.style.zIndex = String(dgFloatZ)
}

function limparPosicaoFloat(modalEl) {
  const box = modalEl?.querySelector('[data-float-box]')
  if (!box) return
  box.style.left = ''
  box.style.top = ''
}
function abrirJanelaFlutuante(modalEl) {
  if (!modalEl) return
  modalEl.classList.remove('hidden')
  trazerJanelaFrente(modalEl)
}

function ligarJanelaFlutuante(modalEl) {
  if (!modalEl || modalEl.dataset.floatBound) return
  modalEl.dataset.floatBound = '1'
  const box = modalEl.querySelector('[data-float-box]')
  const handle = modalEl.querySelector('[data-float-handle]')
  if (!box || !handle) return

  modalEl.addEventListener('mousedown', () => trazerJanelaFrente(modalEl), true)

  let dragging = false
  let ox = 0
  let oy = 0

  function onMove(e) {
    if (!dragging) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const rect = box.getBoundingClientRect()
    let left = e.clientX - ox
    let top = e.clientY - oy
    const minVisible = 48
    left = Math.min(Math.max(left, -rect.width + minVisible), vw - minVisible)
    top = Math.min(Math.max(top, 0), vh - minVisible)
    box.style.left = left + 'px'
    box.style.top = top + 'px'
  }

  function onUp() {
    if (!dragging) return
    dragging = false
    box.classList.remove('is-dragging')
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    if (e.target.closest('button, a, input, select, textarea')) return
    trazerJanelaFrente(modalEl)
    const rect = box.getBoundingClientRect()
    // Fixa posição absoluta a partir do layout atual
    box.style.left = rect.left + 'px'
    box.style.top = rect.top + 'px'
    ox = e.clientX - rect.left
    oy = e.clientY - rect.top
    dragging = true
    box.classList.add('is-dragging')
    handle.setPointerCapture?.(e.pointerId)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    e.preventDefault()
  })
}

ligarJanelaFlutuante($('modal-config'))
ligarJanelaFlutuante($('modal-contas'))

// ---------- Config / Contas ----------
function formatarForcaPerfil(v) {
  if (v == null) return '—'
  if (typeof v === 'string') {
    if (v === 'strong') return 'forte'
    if (v === 'medium') return 'média'
    if (v === 'light') return 'leve'
    return v
  }
  if (typeof v === 'object') {
    if (typeof v.label === 'string') return v.label
    if (typeof v.forca === 'string') return formatarForcaPerfil(v.forca)
  }
  return String(v)
}

function htmlMaquinaDeProfile(p, forcaRaw) {
  const cores = Array.isArray(p?.cpus) ? p.cpus.length : Number(p?.cpus)
  const total = Number(p?.totalMemory)
  const ram =
    Number.isFinite(total) && total > 0 ? (total / 1024 / 1024 / 1024).toFixed(1) + ' GB' : '? GB'
  return (
    '<h4>Máquina</h4>' +
    escapar(p?.hostname || '—') +
    ' — ' +
    escapar(p?.platform || '') +
    ' ' +
    escapar(p?.arch || '') +
    '<br>' +
    (Number.isFinite(cores) && cores > 0 ? cores : '?') +
    ' núcleos — ' +
    ram +
    ' RAM<br>' +
    'Força: <strong>' +
    escapar(formatarForcaPerfil(forcaRaw)) +
    '</strong>'
  )
}

async function abrirConfig() {
  $('modal-contas')?.classList.add('hidden')
  abrirJanelaFlutuante($('modal-config'))
  try {
    const p = await window.api.invoke('system:get-profile')
    const forca = await window.api.invoke('system:profile-strength')
    $('config-profile').innerHTML = htmlMaquinaDeProfile(p && p.ok === false ? {} : p, forca)
  } catch (e) {
    $('config-profile').innerHTML = '<h4>Máquina</h4>' + escapar(String(e))
  }
  await renderizarConfigOllama()
  await carregarConfigOpenClawUi()
  await atualizarPainelAdapta('adapta-status-cfg')
}

const OLLAMA_SUGERIDOS = [
  { id: 'qwen2.5-coder:1.5b', rotulo: 'qwen2.5-coder:1.5b — leve (~1 GB)' },
  { id: 'qwen2.5-coder:3b', rotulo: 'qwen2.5-coder:3b — equilíbrio (~2 GB)' },
  { id: 'qwen2.5-coder:7b', rotulo: 'qwen2.5-coder:7b — melhor qualidade (~4,7 GB)' }
]

/** @type {any} */
let ollamaPullCache = null

function desenharProgressoOllama(p) {
  const box = $('cfg-ollama-progresso')
  if (!box) return
  if (!p) {
    box.hidden = true
    box.innerHTML = ''
    return
  }
  const pct = typeof p.percentual === 'number' ? p.percentual : null
  box.hidden = false
  box.innerHTML =
    '<div class="cfg-pull-linha"><span>' +
    escapar(p.modelo || '') +
    '</span><span>' +
    (pct == null ? '' : pct + '%') +
    '</span></div>' +
    '<div class="cfg-pull-barra"><span style="width:' +
    (pct == null ? 12 : pct) +
    '%"></span></div>' +
    '<div class="cfg-pull-status">' +
    escapar(p.status || '') +
    (p.erro ? ' — ' + escapar(p.erro) : '') +
    '</div>'
}

function atualizarProgressoOllama(p) {
  if (!p || typeof p !== 'object') return
  ollamaPullCache = p
  desenharProgressoOllama(p)
  const btn = $('cfg-ollama-baixar')
  if (btn) btn.disabled = p.fase !== 'sucesso' && p.fase !== 'erro'
  if (p.fase === 'sucesso') {
    mostrarToast('Modelo pronto: ' + p.modelo, 'ok')
    setTimeout(() => void renderizarConfigOllama(), 400)
  } else if (p.fase === 'erro') {
    mostrarToast('Falha ao baixar ' + (p.modelo || 'modelo') + ': ' + (p.erro || 'erro'), 'erro')
    if (btn) btn.disabled = false
  }
}

async function renderizarConfigOllama() {
  const el = $('config-ollama')
  if (!el) return
  let o = null
  let st = null
  try { o = await window.api.invoke('brain:ollama-status') } catch { /* offline */ }
  try { st = await window.api.invoke('ollama:pull-status') } catch { /* offline */ }
  const locais = (st && Array.isArray(st.modelos) && st.modelos.length
    ? st.modelos
    : ((o && Array.isArray(o.models) ? o.models : []).map((m) => m && m.name).filter(Boolean))
  ).filter(Boolean)
  const locaisSet = new Set(locais)
  const emBaixa = st && st.estado && (st.estado.fase === 'baixando' || st.estado.fase === 'iniciando' || st.estado.fase === 'verificando')
  const opcoes = OLLAMA_SUGERIDOS.filter((s) => !locaisSet.has(s.id))
  let status
  if (!o || o.installed === false) {
    status = 'Não instalado. Baixe em <code>ollama.com</code> e rode <code>ollama serve</code>.'
  } else if (!o.reachable) {
    status = 'Instalado, mas parado. Use "Iniciar Ollama" na barra de status ou rode <code>ollama serve</code>.'
  } else {
    status = 'Rodando — ' + locais.length + ' modelo(s) local(is).'
  }
  el.innerHTML =
    '<h4>Ollama (IA local)</h4>' +
    '<div class="cfg-ollama-status">' + status + '</div>' +
    '<div class="cfg-ollama-locais"><strong>Instalados:</strong> ' +
    escapar(locais.join(', ') || 'nenhum') +
    '</div>' +
    (locais.length === 0 && o && o.reachable
      ? '<div class="cfg-ollama-aviso">Nenhum modelo baixado ainda — a IA local precisa de pelo menos um.</div>'
      : '') +
    (opcoes.length
      ? '<div class="config-actions"><select id="cfg-ollama-modelo" class="cfg-ollama-select">' +
        opcoes.map((s) => '<option value="' + escapar(s.id) + '">' + escapar(s.rotulo) + '</option>').join('') +
        '</select><button id="cfg-ollama-baixar" class="btn-small">Baixar modelo</button></div>'
      : '') +
    '<div id="cfg-ollama-progresso" class="cfg-ollama-progresso" hidden></div>'
  const btn = $('cfg-ollama-baixar')
  if (btn) {
    btn.disabled = !!emBaixa
    btn.addEventListener('click', async () => {
      const sel = $('cfg-ollama-modelo')
      const modelo = sel && sel.value
      if (!modelo) return
      btn.disabled = true
      desenharProgressoOllama({ modelo, percentual: null, status: 'iniciando download…' })
      const r = await window.api.invoke('ollama:pull', modelo)
      if (!r || !r.ok) {
        btn.disabled = false
        desenharProgressoOllama(null)
        mostrarToast((r && r.erro) || 'Não foi possível iniciar o download', 'erro')
      }
    })
  }
  desenharProgressoOllama(emBaixa ? st.estado : null)
}

window.api.on('ollama:pull-progresso', (_e, p) => atualizarProgressoOllama(p))

/** @type {object | null} */
let adaptaStatusCache = null

async function atualizarPainelAdapta(elId) {
  const el = $(elId)
  if (!el) return
  try {
    const st = await window.api.invoke('adapta:status', state.pastaAtual || undefined)
    adaptaStatusCache = st
    el.innerHTML =
      'Conta: <strong>digo85cs@gmail.com</strong><br>' +
      'Dossiê: ' +
      (st.dossieExiste ? 'ok' : 'ausente') +
      ' · Continuidade: ' +
      (st.continuidadeExiste ? 'ok' : 'ausente') +
      ' · MCP: ' +
      (st.mcpExiste ? 'compilado' : 'rode npm run build:mcp') +
      '<br><code style="font-size:11px">' +
      escapar(st.caminhoContinuidade || '') +
      '</code>'
  } catch (e) {
    el.textContent = 'Falha ao ler status Adapta: ' + String(e)
  }
}

async function copiarContinuidadeAdapta(regenerar) {
  const r = await window.api.invoke('adapta:ler-continuidade', !!regenerar)
  if (!r?.ok || !r.texto) {
    if (!regenerar) {
      const g = await window.api.invoke('adapta:gerar')
      if (!g?.ok) {
        alert('Continuidade indisponível: ' + (g?.erro || r?.erro || 'sem dossiê — use o chat primeiro'))
        return
      }
      return copiarContinuidadeAdapta(false)
    }
    alert('Continuidade indisponível: ' + (r?.erro || 'erro'))
    return
  }
  try {
    await navigator.clipboard.writeText(r.texto)
    alert('Continuidade copiada. No Adapta ONE: + → Contextos → cole.')
  } catch (e) {
    alert('Não foi possível copiar: ' + String(e))
  }
  await atualizarPainelAdapta('adapta-status')
  await atualizarPainelAdapta('adapta-status-cfg')
}

async function copiarMcpAdapta() {
  const st =
    adaptaStatusCache || (await window.api.invoke('adapta:status', state.pastaAtual || undefined))
  adaptaStatusCache = st
  if (!st?.mcpComando) {
    alert('Comando MCP indisponível')
    return
  }
  if (!st.mcpExiste) {
    alert('MCP ainda não compilado. Rode: npm run build:mcp\n\nO JSON será copiado mesmo assim.')
  }
  try {
    await navigator.clipboard.writeText(st.mcpComando)
    alert('JSON MCP copiado. Cole no conector MCP do Maestro (ver docs/adapta.md).')
  } catch (e) {
    alert('Não foi possível copiar: ' + String(e))
  }
}

async function pintarConectoresContas() {
  // Contas OAuth (Google/MS/Apple/GitHub) pintadas por contas-ui.js em #contas-conectores
  if (typeof window.dgPintarContasVinculadas === 'function') {
    try { await window.dgPintarContasVinculadas() } catch {}
  }
}

async function pintarFtpDeploy() {
  const el = $('contas-ftp')
  if (!el) return
  el.innerHTML = '<h4>Deploy FTP</h4>Carregando...'
  try {
    const r = await window.api.invoke('deploy:ftp-listar')
    const sites = (r && r.sites) || []
    let html =
      '<h4>Deploy FTP</h4>' +
      '<p class="muted">Senha fica no cofre local. Use Dry-run antes do deploy.</p>' +
      '<div class="ftp-form-grid">' +
      '<input id="ftp-id" class="whereis-input" placeholder="id (ex: producao)" />' +
      '<input id="ftp-nome" class="whereis-input" placeholder="nome" />' +
      '<input id="ftp-host" class="whereis-input" placeholder="host" />' +
      '<input id="ftp-user" class="whereis-input" placeholder="usuário" />' +
      '<input id="ftp-pass" class="whereis-input ftp-span-2" type="password" placeholder="senha" />' +
      '<input id="ftp-remote" class="whereis-input" placeholder="remotePath (/public_html)" />' +
      '<input id="ftp-local" class="whereis-input" placeholder="localPath (pasta do projeto)" />' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">' +
      '<button type="button" class="btn-small" id="btn-ftp-salvar">Salvar</button>' +
      '<button type="button" class="btn-small" id="btn-ftp-testar">Testar</button>' +
      '<button type="button" class="btn-small" id="btn-ftp-dry">Dry-run</button>' +
      '<button type="button" class="btn-small btn-primary" id="btn-ftp-deploy">Deploy</button>' +
      '</div>'
    if (sites.length) {
      html += '<div class="muted" style="font-size:12px;margin-bottom:6px">Sites salvos</div><div class="ftp-sites">'
      for (const s of sites) {
        html +=
          '<button type="button" class="ftp-chip btn-ftp-pick" data-id="' + escapar(s.id) + '" title="' + escapar(s.host || '') + '">' +
          escapar(s.nome || s.id) + (s.temSenha ? ' · ✓' : '') +
          '</button>'
      }
      html += '</div>'
    }
    el.innerHTML = html
    const val = (id) => /** @type {HTMLInputElement|null} */ (document.getElementById(id))?.value?.trim() || ''
    el.querySelector('#btn-ftp-salvar')?.addEventListener('click', async () => {
      const id = val('ftp-id') || 'site-1'
      const r2 = await window.api.invoke('deploy:ftp-salvar', {
        id,
        nome: val('ftp-nome') || id,
        host: val('ftp-host'),
        user: val('ftp-user'),
        password: val('ftp-pass'),
        remotePath: val('ftp-remote') || '/',
        localPath: val('ftp-local') || state.pastaAtual || ''
      })
      if (window.dgToast) window.dgToast(r2?.ok ? 'Site FTP salvo' : (r2?.erro || 'Falha'), r2?.ok ? 'ok' : 'erro')
      void pintarFtpDeploy()
    })
    el.querySelector('#btn-ftp-testar')?.addEventListener('click', async () => {
      const id = val('ftp-id')
      if (!id) { if (window.dgToast) window.dgToast('Informe o id do site', 'erro'); return }
      const r2 = await window.api.invoke('deploy:ftp-testar', id)
      if (window.dgToast) window.dgToast(r2?.ok ? ('FTP OK · ' + (r2.pwd || '')) : (r2?.erro || 'Falha'), r2?.ok ? 'ok' : 'erro')
    })
    el.querySelector('#btn-ftp-dry')?.addEventListener('click', async () => {
      const id = val('ftp-id')
      if (!id) { if (window.dgToast) window.dgToast('Informe o id do site', 'erro'); return }
      const localPath = val('ftp-local') || state.pastaAtual || ''
      const r2 = await window.api.invoke('deploy:ftp-deploy', { id, localPath, remotePath: val('ftp-remote') || undefined, dryRun: true })
      if (window.dgToast) window.dgToast(r2?.ok ? ('Dry-run: ' + (r2.previstos || 0) + ' arquivos') : (r2?.erro || 'Falha'), r2?.ok ? 'ok' : 'erro')
    })
    el.querySelector('#btn-ftp-deploy')?.addEventListener('click', async () => {
      const id = val('ftp-id')
      if (!id) { if (window.dgToast) window.dgToast('Informe o id do site', 'erro'); return }
      const localPath = val('ftp-local') || state.pastaAtual || ''
      const r2 = await window.api.invoke('deploy:ftp-deploy', { id, localPath, remotePath: val('ftp-remote') || undefined })
      if (window.dgToast) {
        window.dgToast(
          r2?.ok ? ('Deploy OK · ' + (r2.enviados || 0) + ' arquivos') : (r2?.erro || 'Deploy falhou'),
          r2?.ok ? 'ok' : 'erro'
        )
      }
    })
    el.querySelectorAll('.btn-ftp-pick').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-id')
        const s = sites.find((x) => x.id === id)
        if (!s) return
        const set = (i, v) => { const eln = document.getElementById(i); if (eln) eln.value = v || '' }
        set('ftp-id', s.id)
        set('ftp-nome', s.nome)
        set('ftp-host', s.host)
        set('ftp-user', s.user)
        set('ftp-remote', s.remotePath || '/')
        set('ftp-local', s.localPath || state.pastaAtual || '')
      })
    })
  } catch (err) {
    el.innerHTML = '<h4>Deploy FTP</h4><span style="color:#f85149">' + escapar(String(err)) + '</span>'
  }
}

function ativarAbaContas(tab) {
  const id = tab === 'ftp' || tab === 'saude' ? tab : 'contas'
  document.querySelectorAll('#modal-contas [data-contas-tab]').forEach((btn) => {
    const on = btn.getAttribute('data-contas-tab') === id
    btn.setAttribute('aria-selected', on ? 'true' : 'false')
  })
  document.querySelectorAll('#modal-contas [data-contas-panel]').forEach((panel) => {
    const on = panel.getAttribute('data-contas-panel') === id
    panel.hidden = !on
  })
}

function initContasTabs() {
  const modal = $('modal-contas')
  if (!modal || modal.dataset.tabsWired === '1') return
  modal.dataset.tabsWired = '1'
  modal.querySelectorAll('[data-contas-tab]').forEach((btn) => {
    btn.addEventListener('click', () => ativarAbaContas(btn.getAttribute('data-contas-tab')))
  })
}

async function abrirContas() {
  $('modal-config')?.classList.add('hidden')
  initContasTabs()
  ativarAbaContas('contas')
  abrirJanelaFlutuante($('modal-contas'))
  $('contas-identidade').innerHTML = '<h4>Identidade</h4>Carregando...'
  $('contas-maquina').innerHTML = '<h4>Máquina</h4>Carregando...'
  $('contas-ia').innerHTML = '<h4>IA</h4>Carregando...'
  $('contas-guardian').innerHTML = '<h4>Guardião de recursos</h4>Carregando...'
  void atualizarPainelAdapta('adapta-status')
  void pintarConectoresContas()
  try {
    if (typeof window.dgPintarContasVinculadas === 'function') void window.dgPintarContasVinculadas()
  } catch {}
  void pintarFtpDeploy()
  try {
    const s = await window.api.invoke('accounts:get-state')
    const id = (s && s.identidade) || {}
    const maq = (s && s.maquina) || {}
    const ia = (s && s.ia) || {}
    $('contas-identidade').innerHTML =
      '<h4>Identidade</h4>' +
      'Usuário: <strong>' +
      escapar(id.username || 'digo85cs') +
      '</strong><br>' +
      'E-mail: <strong>' +
      escapar(id.email || 'digo85cs@gmail.com') +
      '</strong><br>' +
      (id.tokenPrefix ? 'Token: <code>' + escapar(id.tokenPrefix) + '...</code><br>' : '') +
      'Desde: ' +
      (id.criadoEm ? new Date(id.criadoEm).toLocaleDateString('pt-BR') : '—')
    const coresM = Number(maq.cpus)
    const ramM = maq.ramGB && String(maq.ramGB) !== 'NaN' ? String(maq.ramGB) : '?'
    $('contas-maquina').innerHTML =
      '<h4>Máquina</h4>' +
      escapar(maq.hostname || '—') +
      ' — ' +
      escapar(maq.plataforma || '') +
      '<br>' +
      (Number.isFinite(coresM) && coresM > 0 ? coresM : '?') +
      ' núcleos — ' +
      escapar(ramM) +
      ' GB RAM<br>' +
      'Força: <strong>' +
      escapar(formatarForcaPerfil(maq.forca)) +
      '</strong>'
    const provs = Array.isArray(ia.provedores)
      ? ia.provedores.map((p) => escapar(p.name) + ': ' + (p.available ? 'OK (' + escapar(String(p.models)) + ')' : 'off')).join('<br>')
      : '—'
    $('contas-ia').innerHTML =
      '<h4>IA</h4>' +
      'Ollama: ' +
      (ia.ollamaInstalado ? (ia.ollamaRodando ? 'rodando' : 'instalado, parado') : 'não instalado') +
      '<br>' +
      'Modelos: ' +
      escapar((ia.modelos || []).join(', ') || 'nenhum') +
      '<br>' +
      'Provedores:<br>' +
      provs
    const g = (s && s.guardian) || {}
    const usedMem = (g.totalMemory || 0) - (g.freeMemory || 0)
    const usedMB = Math.round(usedMem / 1048576)
    const usedPct = g.totalMemory > 0 ? Math.round((usedMem / g.totalMemory) * 100) : 0
    $('contas-guardian').innerHTML =
      '<h4>Guardião de recursos</h4>' +
      'RAM: ' +
      usedMB +
      ' MB usados (' +
      usedPct +
      '% de ' +
      Math.round((g.totalMemory || 0) / 1048576) +
      ' MB)<br>' +
      'CPU: ' +
      (Number.isFinite(g.cpuPercent) ? g.cpuPercent : 0) +
      '%<br>' +
      'Operações pesadas: ' +
      (g.ramOk ? 'liberadas' : 'pausadas (RAM baixa)')
  } catch (err) {
    $('contas-ia').innerHTML = '<h4>Erro</h4>' + escapar(String(err))
  }
}

async function rodarBackupOneDrive() {
  const st = $('backup-onedrive-status')
  const btn = $('btn-backup-onedrive')
  if (btn) btn.disabled = true
  if (st) st.textContent = 'Backup OneDrive em andamento…'
  try {
    const r = await window.api.invoke('backup:onedrive')
    if (st) {
      st.textContent = r?.ok
        ? 'Backup OK — OneDrive\\BACKUP_DG_EDITOR (espelho + ZIP ATUAL).'
        : 'Falha: ' + (r?.erro || 'desconhecida')
    }
    mostrarToast?.(r?.ok ? 'Backup OneDrive OK' : 'Backup OneDrive falhou', r?.ok ? 'ok' : 'erro')
  } catch (e) {
    if (st) st.textContent = 'Erro: ' + String(e)
  } finally {
    if (btn) btn.disabled = false
  }
}

async function rodarDiagnostico() {
  const alvo = $('contas-diagnostico')
  if (!alvo) return
  alvo.innerHTML =
    '<h4>Diagnóstico</h4><p class="muted">Rodando checagens...</p>' +
    '<button type="button" id="btn-diag" class="btn-small">Rodar diagnóstico</button>' +
    '<button type="button" id="btn-backup-onedrive" class="btn-small" style="margin-left:8px">Backup OneDrive</button>' +
    '<p id="backup-onedrive-status" class="muted" style="margin:8px 0 0;font-size:12px"></p>'
  $('btn-diag')?.addEventListener('click', () => { void rodarDiagnostico() })
  $('btn-backup-onedrive')?.addEventListener('click', () => { void rodarBackupOneDrive() })
  const t0 = Date.now()
  try {
    const r = await window.api.invoke('diagnostico:rodar', state.pastaAtual || null)
    const total = Date.now() - t0
    let html =
      '<h4>Diagnóstico — ' +
      (r?.ok ?? 0) +
      '/' +
      (r?.total ?? 0) +
      ' OK (' +
      total +
      ' ms)</h4><button type="button" id="btn-diag" class="btn-small">Rodar de novo</button>' +
      '<button type="button" id="btn-backup-onedrive" class="btn-small" style="margin-left:8px">Backup OneDrive</button>' +
      '<p id="backup-onedrive-status" class="muted" style="margin:8px 0 0;font-size:12px"></p>'
    for (const m of r?.modulos || []) {
      const icone = m.ok ? '\u2713' : '\u2717'
      const cor = m.ok ? '#3fb950' : '#f85149'
      html +=
        '<div style="margin:8px 0 0"><span style="color:' +
        cor +
        ';font-weight:bold">' +
        icone +
        '</span> ' +
        '<strong>' +
        escapar(m.nome) +
        '</strong> <span class="muted">(' +
        m.ms +
        ' ms)</span><br>' +
        '<span style="margin-left:18px;font-size:12px">' +
        escapar(m.detalhe) +
        '</span></div>'
    }
    alvo.innerHTML = html
    $('btn-diag')?.addEventListener('click', () => { void rodarDiagnostico() })
    $('btn-backup-onedrive')?.addEventListener('click', () => { void rodarBackupOneDrive() })
  } catch (err) {
    alvo.innerHTML =
      '<h4>Diagnóstico</h4><span style="color:#f85149">' +
      escapar(String(err)) +
      '</span><div style="margin-top:8px"><button type="button" id="btn-diag" class="btn-small">Tentar de novo</button>' +
      '<button type="button" id="btn-backup-onedrive" class="btn-small" style="margin-left:8px">Backup OneDrive</button></div>'
    $('btn-diag')?.addEventListener('click', () => { void rodarDiagnostico() })
    $('btn-backup-onedrive')?.addEventListener('click', () => { void rodarBackupOneDrive() })
  }
}

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
let paletaItens = []
let paletaSel = 0
let buscaAbortId = null

function bootstrapComandos() {
  const defs = [
    { id: 'abrir-pasta', titulo: 'Abrir pasta de trabalho', atalho: 'Ctrl+O', fn: () => abrirPasta() },
    { id: 'abrir-vault', titulo: 'Abrir vault Markdown', fn: () => abrirVault() },
    { id: 'grafo-vault', titulo: 'Grafo do vault', fn: () => void abrirGrafoVault({ abrirNota: (p) => void abrirArquivoNaAba(p) }) },
    { id: 'mapa-mental', titulo: 'Mapa mental (MindNode)', fn: () => void abrirMapaMental({ raiz: state.pastaAtual || state.vaultRaiz || '' }) },
    { id: 'gravar-tela', titulo: 'Gravar tela (janela ou monitor)', fn: () => void abrirGravador({ raiz: state.pastaAtual || state.vaultRaiz || '' }) },
    { id: 'receber-lan', titulo: 'Receber arquivos do celular (LAN)', fn: () => void abrirCompartilhamento({ raiz: state.pastaAtual || state.vaultRaiz || '' }) },
    { id: 'reversa', titulo: 'Engenharia reversa local (REA)', fn: () => void abrirReversa({ raiz: state.pastaAtual || state.vaultRaiz || '' }) },
    { id: 'colar-markdown', titulo: 'Colar como Markdown', atalho: 'Ctrl+Shift+V', fn: () => void colarComoMarkdown() },
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
      id: 'estudio-midia',
      titulo: 'Estúdio de mídia (imagem, vídeo, áudio)',
      fn: () => window.dgEstudioMidia?.()
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

let ultimoAjusteZoom = 0

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

function ajustarZoomUi(delta) {
  // Debounce: menu nativo e keydown do renderer podem disparar o mesmo atalho.
  const agora = Date.now()
  if (agora - ultimoAjusteZoom < 150) return
  ultimoAjusteZoom = agora
  const p = ajustarEscalaInterface(delta)
  const sel = $('a11y-escala')
  if (sel) sel.value = String(p.escalaInterface)
  mostrarToast('Escala da interface: ' + Math.round(p.escalaInterface * 100) + '%', 'ok')
}

function ajustarFontePainelUi(alvo, delta) {
  const p = ajustarTamanhoFonte(alvo, delta)
  const px = alvo === 'terminal' ? p.tamanhoTerminal : p.tamanhoEditor
  const sel = $(alvo === 'terminal' ? 'a11y-fonte-terminal' : 'a11y-fonte-editor')
  if (sel) sel.value = String(px)
  mostrarToast('Fonte do ' + (alvo === 'terminal' ? 'terminal' : 'editor') + ': ' + px + ' px', 'ok')
}

function acaoEditar(cmd) {
  try {
    document.execCommand(cmd)
  } catch (e) {
    console.warn('[menubar] editar:', cmd, e)
  }
}

function abrirPaletaComandos() {
  modoPaleta = 'comandos'
  fecharBuscaGlobal()
  $('palette').classList.remove('hidden')
  $('palette-input').value = ''
  $('palette-input').placeholder = 'Digite um comando...'
  renderizarPaleta('')
  $('palette-input').focus()
}

function abrirPaletaArquivos() {
  modoPaleta = 'arquivos'
  fecharBuscaGlobal()
  $('palette').classList.remove('hidden')
  $('palette-input').value = ''
  $('palette-input').placeholder = 'Abrir arquivo — digite o nome…'
  renderizarPaleta('')
  $('palette-input').focus()
}


function fecharPaleta() {
  $('palette').classList.add('hidden')
}

function abrirBuscaGlobal() {
  fecharPaleta()
  $('busca-global')?.classList.remove('hidden')
  const inp = $('busca-input')
  if (inp) {
    inp.value = ''
    inp.focus()
  }
  const box = $('busca-resultados')
  if (box) box.innerHTML = '<div class="palette-item muted">Digite para buscar no projeto</div>'
}

function fecharBuscaGlobal() {
  $('busca-global')?.classList.add('hidden')
  if (buscaAbortId) {
    window.api.invoke('busca:cancelar', buscaAbortId).catch(() => {})
    buscaAbortId = null
  }
}

async function renderizarPaleta(filtro) {
  const lista = $('palette-list')
  lista.innerHTML = ''
  paletaSel = 0
  const f = (filtro || '').trim()
  paletaItens = []

  if (modoPaleta === 'comandos') {
    let cmds = listarComandosLocais()
    try {
      const remoto = await window.api.invoke('comandos:listar')
      if (remoto?.ok && Array.isArray(remoto.comandos)) {
        for (const c of remoto.comandos) {
          const existente = cmds.find((x) => x.id === c.id)
          if (existente) {
            existente.hint = existente.hint || c.descricao || c.atalho || ''
          } else {
            cmds.push({ id: c.id, titulo: c.titulo, atalho: c.atalho, hint: c.descricao })
          }
        }
      }
    } catch {
      /* offline meta */
    }
    const fl = f.toLowerCase()
    cmds = cmds.filter((c) => !fl || (c.titulo || '').toLowerCase().includes(fl) || c.id.includes(fl))
    for (const c of cmds) {
        paletaItens.push({ tipo: 'cmd', id: c.id, label: c.titulo, hint: c.hint || c.atalho || '' })
      }
  } else {
    const raiz = state.pastaAtual || state.pastasRecentes[0]
    if (raiz) {
      try {
        const r = await window.api.invoke('busca:arquivos', raiz, f, 80)
        if (r?.ok && Array.isArray(r.itens)) {
          for (const e of r.itens) {
            const nome = e.nome || ''
            const rel = e.rel || nome
            const pasta = String(rel).replace(/[\\/][^\\/]+$/, '') || '.'
            paletaItens.push({
              tipo: 'file',
              caminho: e.caminho,
              label: nomeAmigavelArquivo(nome, rel),
              hint: pasta === '.' ? rel : pasta
            })
          }
        }
      } catch {
        /* fallback vazio */
      }
    }
  }

  if (paletaItens.length === 0) {
    lista.innerHTML = '<div class="palette-item muted">Nenhum resultado</div>'
    return
  }
  for (let i = 0; i < paletaItens.length; i++) {
    const c = paletaItens[i]
    const div = document.createElement('div')
    div.className = 'palette-item' + (i === 0 ? ' selecionado' : '')
    div.innerHTML =
      '<span class="palette-label">' +
      escapar(c.label) +
      '</span>' +
      (c.hint ? '<span class="palette-hint">' + escapar(c.hint) + '</span>' : '')
    div.addEventListener('click', () => {
      fecharPaleta()
      executarItemPaleta(c)
    })
    lista.appendChild(div)
  }
}

function executarItemPaleta(c) {
  if (c.tipo === 'file') abrirArquivoNaAba(c.caminho)
  else executarComando(c.id)
}

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
async function rodarBuscaGlobal() {
  const raiz = state.pastaAtual || state.pastasRecentes[0]
  const q = ($('busca-input')?.value || '').trim()
  const box = $('busca-resultados')
  if (!box) return
  if (!raiz) {
    box.innerHTML = '<div class="palette-item muted">Abra uma pasta primeiro</div>'
    return
  }
  if (!q) {
    box.innerHTML = '<div class="palette-item muted">Digite para buscar</div>'
    return
  }
  if (buscaAbortId) await window.api.invoke('busca:cancelar', buscaAbortId).catch(() => {})
  buscaAbortId = 'ui-' + Date.now()
  box.innerHTML = '<div class="palette-item muted">Buscando...</div>'
  const regex = !!$('busca-regex')?.checked
  try {
    const r = await window.api.invoke('busca:conteudo', raiz, q, {
      regex,
      limite: 50,
      id: buscaAbortId
    })
    box.innerHTML = ''
    if (!r?.ok) {
      box.innerHTML = '<div class="palette-item muted">' + escapar(r?.erro || 'falha') + '</div>'
      return
    }
    if (r.cancelado) {
      box.innerHTML = '<div class="palette-item muted">Cancelado</div>'
      return
    }
    const itens = Array.isArray(r.itens) ? r.itens : []
    if (!itens.length) {
      box.innerHTML = '<div class="palette-item muted">Nenhum resultado</div>'
      return
    }
    const grupos = new Map()
    for (const it of itens) {
      const rel = it.rel || it.caminho || ''
      if (!grupos.has(rel)) grupos.set(rel, { rel, arquivo: it.caminho || rel, hits: [] })
      grupos.get(rel).hits.push({ linha: Number(it.linha) || 1, texto: it.trecho || '' })
    }
    for (const g of grupos.values()) {
      const head = document.createElement('div')
      head.className = 'palette-item'
      head.innerHTML =
        '<span class="palette-label">' +
        escapar(g.rel) +
        '</span><span class="palette-hint">' +
        g.hits.length +
        '</span>'
      head.addEventListener('click', () => {
        fecharBuscaGlobal()
        abrirArquivoNaAba(g.arquivo, g.hits[0]?.linha)
      })
      box.appendChild(head)
      for (const h of g.hits) {
        const hit = document.createElement('div')
        hit.className = 'busca-hit'
        hit.textContent = h.linha + ': ' + h.texto
        hit.title = h.texto
        hit.addEventListener('click', () => {
          fecharBuscaGlobal()
          abrirArquivoNaAba(g.arquivo, h.linha)
        })
        box.appendChild(hit)
      }
    }
  } catch (e) {
    box.innerHTML = '<div class="palette-item muted">' + escapar(String(e)) + '</div>'
  }
}

function destacarPaleta(itens) {
  itens.forEach((el, i) => el.classList.toggle('selecionado', i === paletaSel))
  itens[paletaSel]?.scrollIntoView({ block: 'nearest' })
}

// ---------- Guardião ----------
window.__dgAtualizarAba = window.__dgAtualizarAba || function () {}

let depStatusCache = null
function atualizarIndicadorDeps(st) {
  depStatusCache = st || depStatusCache
  const d = depStatusCache
  const btn = document.getElementById('btn-ollama-start')
  if (d && btn) {
    const mostrar = d.ollama === 'offline' && d.instalado && !d.llmApiKey
    btn.style.display = mostrar ? '' : 'none'
  }
  const sb = document.getElementById('sb-ia')
  if (!d) return
  let dep = 'IA: —'
  if (d.llmApiKey) dep = 'IA: API online'
  else if (d.ollama === 'ativo') dep = 'IA: Ollama ativo'
  else if (d.ollama === 'offline') dep = 'IA: Ollama offline'
  else dep = 'IA: local indisponível'
  if (sb) {
    sb.textContent = dep
    sb.title = dep + (d.modelo && d.modelo !== 'desconhecido' ? ' · ' + d.modelo : '')
  }
  const alvo = document.getElementById('chat-provider')
  if (alvo) {
    alvo.dataset.iaBase = dep
    alvo.textContent = dep
  }
}

function atualizarBadgeProvedor(nome) {
  const sb = document.getElementById('sb-ia')
  const curto = String(nome || '').split('/')[0] || nome
  if (sb) {
    sb.textContent = 'IA: ' + curto
    sb.title = 'Provedor: ' + nome
  }
  const alvo = document.getElementById('chat-provider')
  if (alvo) {
    alvo.dataset.iaBase = 'IA: ' + nome
    alvo.textContent = 'IA: ' + nome
  }
}

/** Toast DOM simples (acima do composer, auto-dismiss 5s). */
function mostrarToast(mensagem, tipo = 'aviso') {
  let host = document.getElementById('dg-toast-host')
  if (!host) {
    host = document.createElement('div')
    host.id = 'dg-toast-host'
    host.setAttribute('aria-live', 'polite')
    document.body.appendChild(host)
  }
  const el = document.createElement('div')
  el.className = 'dg-toast ' + (tipo === 'erro' ? 'erro' : tipo === 'ok' ? 'ok' : 'aviso')
  el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status')
  el.textContent = String(mensagem || '')
  host.appendChild(el)
  requestAnimationFrame(() => {
    el.classList.add('is-show')
  })
  setTimeout(() => {
    el.classList.remove('is-show')
    setTimeout(() => el.remove(), 250)
  }, 5000)
  return el
}
window.dgToast = mostrarToast

async function atualizarChipMemoria() {
  try {
    const raiz = (pastasPermitidas() || [])[0] || (state.pastasRecentes || [])[0]
    if (!raiz) return
    const fatos = await window.api.invoke('memoria:listar', raiz)
    const itens = (fatos && fatos.itens) || []
    const n = itens.filter((i) => i.status === 'aceita').length
    let chip = document.getElementById('chat-memoria-chip')
    const host = document.getElementById('chat-header') || document.getElementById('chat-provider')?.parentElement
    if (!host) return
    if (!chip) {
      chip = document.createElement('span')
      chip.id = 'chat-memoria-chip'
      chip.className = 'provider-badge'
      chip.style.marginLeft = '6px'
      const prov = document.getElementById('chat-provider')
      if (prov && prov.parentElement) prov.parentElement.appendChild(chip)
      else host.appendChild(chip)
    }
    if (n > 0) {
      chip.hidden = false
      chip.textContent = 'Memória:' + n
      chip.title = n + ' fato(s) aceito(s) no contexto automático'
    } else {
      chip.hidden = true
      chip.textContent = ''
    }
  } catch {
    /* opcional */
  }
}
window.dgAtualizarChipMemoria = atualizarChipMemoria

async function atualizarBadgeProvedorReal(modeloForcado) {
  try {
    const ps = await window.api.invoke('brain:providers')
    const ativo = Array.isArray(ps) ? ps.find((p) => p.available) : null
    const nomeProv = ativo
      ? ativo.name === 'ollama'
        ? 'Ollama'
        : String(ativo.name || 'IA')
      : '—'
    let modelo = modeloForcado || ''
    let flagUpdate = false
    let motivoTarefa = ''
    if (!modelo) {
      try {
        const tarefaSel = document.getElementById('chat-mode-select')?.value || 'codigo'
        const tarefa =
          tarefaSel === 'plan' || tarefaSel === 'ask' ? 'chat' : tarefaSel === 'agent' ? 'codigo' : 'codigo'
        const mt = await window.api.invoke('modelos:para-tarefa', tarefa)
        if (mt?.modelo) {
          modelo = mt.modelo
          motivoTarefa = mt.motivo || ''
        }
      } catch {
        /* */
      }
      if (!modelo) {
        try {
          const r = await window.api.invoke('modelos:listar')
          modelo = (r && r.catalogo && r.catalogo.ativo) || ''
          const m = (r?.catalogo?.modelos || []).find((x) => x.id === modelo)
          flagUpdate = !!(m && m.atualizadoDisponivel)
        } catch {
          /* ignora */
        }
      } else {
        try {
          const r = await window.api.invoke('modelos:listar')
          const m = (r?.catalogo?.modelos || []).find((x) => x.id === modelo)
          flagUpdate = !!(m && m.atualizadoDisponivel)
        } catch {
          /* */
        }
      }
    } else {
      try {
        const r = await window.api.invoke('modelos:listar')
        const m = (r?.catalogo?.modelos || []).find((x) => x.id === modelo)
        flagUpdate = !!(m && m.atualizadoDisponivel)
      } catch {
        /* */
      }
    }
    let texto = modelo ? 'IA: ' + nomeProv + ' — ' + modelo : 'IA: ' + nomeProv
    if (flagUpdate) texto += ' ⚠ atualização disponível'
    let titleExtra = motivoTarefa || ''
    try {
      const cotas = await window.api.invoke('providers:cotas')
      const lista = cotas?.cotas || cotas?.itens || []
      const esgotados = Array.isArray(lista) ? lista.filter((c) => c.esgotado || c.remaining === 0).length : 0
      if (esgotados) {
        texto += ' · cota:' + esgotados + ' esgot.'
        titleExtra = (titleExtra ? titleExtra + ' · ' : '') + esgotados + ' provedor(es) em cooldown/cota'
      }
    } catch { /* opcional */ }
    try {
      const conn = await window.api.invoke('conectores:listar')
      const conectores = conn?.conectores || []
      const off = conectores.filter((c) => !c.ativo).length
      if (off) titleExtra = (titleExtra ? titleExtra + ' · ' : '') + off + ' conector(es) inativos'
    } catch { /* opcional */ }
    const alvo = document.getElementById('chat-provider')
    if (alvo) {
      alvo.dataset.iaBase = texto
      alvo.textContent = texto
      if (titleExtra) alvo.title = titleExtra
      if (depStatusCache) atualizarIndicadorDeps(depStatusCache)
    }
    void atualizarChipMemoria()
  } catch {
    /* ignora */
  }
}

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
  histChat?.nova?.()
  focarPainelIa('chat')
})
$('btn-desktop-use')?.addEventListener('click', () => pedirPermissaoDesktop())
$('btn-open-vault')?.addEventListener('click', () => void abrirVault())
$('btn-vault-grafo')?.addEventListener('click', () =>
  void abrirGrafoVault({ abrirNota: (p) => void abrirArquivoNaAba(p) })
)
$('btn-mapa-mental')?.addEventListener('click', () =>
  void abrirMapaMental({ raiz: state.pastaAtual || state.vaultRaiz || '' })
)
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
  const p = ocPendentes.find((x) => x.id === ocPendenteAtivoId)
  if (p) void previewDiffNoEditor(p)
})
$('btn-oc-aplicar')?.addEventListener('click', () => void aplicarPendenteOc())
$('btn-oc-aplicar-hunks')?.addEventListener('click', () => void aplicarHunksSelecionadosOc())
$('btn-oc-rejeitar')?.addEventListener('click', () => void rejeitarPendenteOc())

// Chat agent/mode selector - respects DG Editor agents and serial queue
const chatModes = [
  { id: 'auto', label: 'Auto' },
  { id: 'code', label: 'Agent' },
  { id: 'plan', label: 'Plan' },
  { id: 'ask', label: 'Ask' },
  { id: 'debug', label: 'Debug' }
]
const agentesGratisPadrao = [
  { id: 'free-auto', nome: 'Auto Free', tipo: 'free' },
  { id: 'free-coder', nome: 'Coder Free', tipo: 'free' },
  { id: 'free-assist', nome: 'Assist Free', tipo: 'free' },
  { id: 'free-reason', nome: 'Reason Free', tipo: 'free' },
  { id: 'free-architect', nome: 'Architect Free', tipo: 'free' },
  { id: 'free-debugger', nome: 'Debugger Free', tipo: 'free' },
  { id: 'free-reviewer', nome: 'Reviewer Free', tipo: 'free' }
]
let chatAgentRequestId = 0

async function carregarOpcoesAgenteChat(raiz = state.pastaAtual) {
  const agentSel = document.getElementById('chat-agent-select')
  if (!agentSel) return
  const requestId = ++chatAgentRequestId
  let list = []
  if (raiz) {
    try {
      const r = await window.api.invoke('agente:listar', raiz)
      list = r?.agentes || []
    } catch {}
  }
  if (requestId !== chatAgentRequestId || !agentSel.isConnected) return

  const preferido = (() => {
    try { return localStorage.getItem('dg-chat-agent') || agentSel.value || 'auto' } catch { return agentSel.value || 'auto' }
  })()
  agentSel.replaceChildren()
  const autoOpt = document.createElement('option')
  autoOpt.value = 'auto'
  autoOpt.textContent = 'Automático'
  agentSel.appendChild(autoOpt)

  const grpFree = document.createElement('optgroup')
  grpFree.label = 'Agentes gratuitos'
  for (const a of agentesGratisPadrao) {
    const o = document.createElement('option')
    o.value = a.id
    o.textContent = a.nome
    grpFree.appendChild(o)
  }
  agentSel.appendChild(grpFree)

  const grpLocal = document.createElement('optgroup')
  grpLocal.label = 'Agentes locais'
  for (const a of list) {
    const o = document.createElement('option')
    o.value = a.id
    o.textContent = a.nome || a.id
    grpLocal.appendChild(o)
  }
  if (grpLocal.children.length) agentSel.appendChild(grpLocal)
  agentSel.value = Array.from(agentSel.options).some((o) => o.value === preferido) ? preferido : 'auto'
  const agentBtn = document.getElementById('btn-chat-agent')
  if (agentBtn) {
    agentBtn.title = 'Agente: ' + (agentSel.selectedOptions?.[0]?.textContent || agentSel.value)
  }
}

function initChatAgentSelector() {
  const agentSel = document.getElementById('chat-agent-select')
  const modeSel = document.getElementById('chat-mode-select')
  const btnMais = document.getElementById('btn-chat-mais')
  const menu = document.getElementById('chat-mais-menu')
  const maisWrap = btnMais?.closest('.chat-more-wrap')
  if (!agentSel || !modeSel) return
  if (agentSel.dataset.wired === '1') {
    void carregarOpcoesAgenteChat()
    return
  }
  agentSel.dataset.wired = '1'
  if (!modeSel.options.length) {
    for (const m of chatModes) {
      const o = document.createElement('option')
      o.value = m.id
      o.textContent = m.label
      modeSel.appendChild(o)
    }
  }
  if (btnMais && menu && maisWrap && menu.dataset.wired !== '1') {
    menu.dataset.wired = '1'
    const setMenuOpen = (open) => {
      menu.hidden = !open
      btnMais.setAttribute('aria-expanded', open ? 'true' : 'false')
    }
    const itemAuto = document.createElement('button')
    itemAuto.type = 'button'
    itemAuto.className = 'chat-more-item'
    itemAuto.setAttribute('role', 'menuitemcheckbox')
    function atualizarItemAuto() {
      try {
        const v = localStorage.getItem('dg-chat-autoapprove') === '1'
        itemAuto.textContent = v ? 'Desativar aprovação automática' : 'Ativar aprovação automática'
        itemAuto.setAttribute('aria-checked', v ? 'true' : 'false')
      } catch {
        itemAuto.textContent = 'Ativar aprovação automática'
        itemAuto.setAttribute('aria-checked', 'false')
      }
    }
    atualizarItemAuto()
    itemAuto.addEventListener('click', (e) => {
      e.stopPropagation()
      try {
        const v = localStorage.getItem('dg-chat-autoapprove') === '1'
        if (v) localStorage.removeItem('dg-chat-autoapprove')
        else localStorage.setItem('dg-chat-autoapprove', '1')
      } catch {}
      atualizarItemAuto()
      setMenuOpen(false)
      btnMais.focus()
    })
    const itemAvaliar = document.createElement('button')
    itemAvaliar.type = 'button'
    itemAvaliar.className = 'chat-more-item'
    itemAvaliar.setAttribute('role', 'menuitem')
    itemAvaliar.textContent = 'Avaliar modelo'
    itemAvaliar.addEventListener('click', (e) => {
      e.stopPropagation()
      setMenuOpen(false)
      document.getElementById('btn-brain-avaliar')?.click()
    })
    const itemAuditar = document.createElement('button')
    itemAuditar.type = 'button'
    itemAuditar.className = 'chat-more-item'
    itemAuditar.setAttribute('role', 'menuitem')
    itemAuditar.textContent = 'Auto auditoria'
    itemAuditar.addEventListener('click', (e) => {
      e.stopPropagation()
      setMenuOpen(false)
      document.getElementById('btn-auditar')?.click()
    })
    const itemLimparSkill = document.createElement('button')
    itemLimparSkill.type = 'button'
    itemLimparSkill.className = 'chat-more-item'
    itemLimparSkill.setAttribute('role', 'menuitem')
    itemLimparSkill.textContent = 'Remover skill ativa'
    itemLimparSkill.addEventListener('click', (e) => {
      e.stopPropagation()
      setMenuOpen(false)
      definirSkillChat('', '')
    })
    // Sem Melhorar prompt / Parar (já têm ícone dedicado no composer)
    menu.replaceChildren(itemAuto, itemAvaliar, itemAuditar, itemLimparSkill)
    const mk = (label, fn) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'chat-more-item'
      b.setAttribute('role', 'menuitem')
      b.textContent = label
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        setMenuOpen(false)
        fn()
      })
      return b
    }
    menu.appendChild(mk('Orquestrar', () => {
      const ai = $('agent-input')
      const ci = $('chat-input')
      if (ai && ci && !ai.value.trim() && ci.value.trim()) ai.value = ci.value
      focarPainelIa('agent')
      void executarAgentUi(true)
    }))
    menu.appendChild(mk('Verificar após turno', () => {
      const v = document.getElementById('agent-verify-loop')
      if (v) {
        v.checked = !v.checked
        if (window.dgToast) window.dgToast(v.checked ? 'Verificar ligado' : 'Verificar desligado', 'ok')
      }
    }))
    menu.appendChild(mk('Desfazer apply', () => document.getElementById('btn-agent-undo')?.click()))
    btnMais.addEventListener('click', (e) => {
      e.stopPropagation()
      const open = btnMais.getAttribute('aria-expanded') !== 'true'
      if (open) atualizarItemAuto()
      setMenuOpen(open)
      if (open) itemAuto.focus()
    })
    document.addEventListener('click', (ev) => {
      if (!maisWrap.contains(ev.target)) setMenuOpen(false)
    })
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || menu.hidden) return
      setMenuOpen(false)
      btnMais.focus()
      ev.stopPropagation()
    })
  }
  void carregarOpcoesAgenteChat()
  try {
    const vm = localStorage.getItem('dg-chat-mode')
    if (vm && Array.from(modeSel.options).some((o) => o.value === vm)) modeSel.value = vm
  } catch {}
  const planToggle = document.getElementById('agent-plan-mode')
  const syncPlanFromMode = () => {
    if (!planToggle) return
    planToggle.checked = modeSel.value === 'plan'
  }
  syncPlanFromMode()
  const syncCtxTitles = () => {
    const modeBtn = document.getElementById('btn-chat-mode')
    const agentBtn = document.getElementById('btn-chat-agent')
    if (modeBtn) modeBtn.title = 'Modo: ' + (modeSel.selectedOptions?.[0]?.textContent || modeSel.value)
    if (agentBtn) agentBtn.title = 'Agente: ' + (agentSel.selectedOptions?.[0]?.textContent || agentSel.value)
  }
  agentSel.addEventListener('change', () => {
    try { localStorage.setItem('dg-chat-agent', agentSel.value) } catch {}
    sincronizarAgenteSelects('chat')
    syncCtxTitles()
  })
  modeSel.addEventListener('change', () => {
    try { localStorage.setItem('dg-chat-mode', modeSel.value) } catch {}
    syncPlanFromMode()
    syncCtxTitles()
    agendarSalvarWorkspace()
  })
  syncCtxTitles()
  planToggle?.addEventListener('change', () => {
    if (planToggle.checked) {
      modeSel.value = 'plan'
      try { localStorage.setItem('dg-chat-mode', 'plan') } catch {}
    } else if (modeSel.value === 'plan') {
      modeSel.value = 'code'
      try { localStorage.setItem('dg-chat-mode', 'code') } catch {}
    }
  })
}
function atualizarStatusAgent(modelo, ms, fila) {
  const el = $('sb-agent')
  if (!el) return
  const partes = []
  if (modelo) partes.push(modelo)
  if (ms != null) partes.push(ms + 'ms')
  if (fila) {
    if (fila.ocupado) partes.push('fila\u25CF')
    else if (fila.tamanho) partes.push('fila:' + fila.tamanho)
  }
  el.textContent = partes.length ? 'Agent: ' + partes.join(' · ') : 'Agent: —'
  el.title = partes.length ? 'Agente: ' + partes.join(' · ') : 'Agente: ocioso'
}

async function carregarAgentesUi() {
  const sel = $('agent-select')
  if (!sel || !state.pastaAtual) return
  const r = await window.api.invoke('agente:listar', state.pastaAtual)
  const cur = sel.value || document.getElementById('chat-agent-select')?.value
  sel.innerHTML = ''
  for (const a of r?.agentes || []) {
    const o = document.createElement('option')
    o.value = a.id
    o.textContent = a.nome || a.id
    sel.appendChild(o)
  }
  if (cur && Array.from(sel.options).some((o) => o.value === cur)) sel.value = cur
  sincronizarAgenteSelects('agent')
  void carregarOpcoesAgenteChat()
  const st = await window.api.invoke('agente:fila-status')
  const fs = $('agent-fila-status')
  if (fs && st) {
    fs.textContent = st.ocupado
      ? 'fila: ocupado (' + st.tamanho + ')'
      : st.tamanho
        ? 'fila: ' + st.tamanho
        : 'pronto'
  }
  atualizarStatusAgent(null, null, st)
}

function renderAgentTrace(passos) {
  const box = $('agent-trace')
  if (!box) return
  box.innerHTML = ''
  if (!passos || !passos.length) {
    box.innerHTML = '<span class="muted">Sem tool calls neste turno.</span>'
    return
  }
  for (const p of passos) {
    const div = document.createElement('div')
    div.className = 'step'
    if (p.tipo === 'tool') {
      div.textContent =
        '⚙️ ' +
        (p.nome || 'tool') +
        (p.resultado ? ' → ' + String(p.resultado).slice(0, 160) : '')
    } else {
      div.textContent = '💬 ' + String(p.texto || '').slice(0, 200)
    }
    box.appendChild(div)
  }
  box.scrollTop = box.scrollHeight
}

function appendAgentTraceLive(line) {
  const box = $('agent-trace')
  if (!box) return
  if (box.querySelector('.muted')) box.innerHTML = ''
  const div = document.createElement('div')
  div.className = 'step'
  div.textContent = line
  box.appendChild(div)
  box.scrollTop = box.scrollHeight
}

function atualizarChatPlanoCard(plano) {
  const area = $('chat-messages')
  renderChatPlanoCard(area, plano, {
    onImplementar: (soProximo) => void executarPlanoDoChat(!!soProximo),
    onMarcar: async (id, feito) => {
      await window.api.invoke('agente:plano-marcar-passo', id, feito)
      const r = await window.api.invoke('agente:plano-ler')
      renderPlanoChecklist(r?.plano)
      atualizarChatPlanoCard(r?.plano)
    }
  })
}

function atualizarChatApplyCard(propostas) {
  const area = $('chat-messages')
  renderChatApplyCard(area, propostas || agentPropostas, {
    onAplicarTodas: () => void aplicarTodasPropostasAgent(),
    onRevisar: () => {
      toggleRight(true)
      ativarAbaDireita('agent')
      abrirFilaPropostasAgent()
    },
    onAplicarUma: (id) => void aplicarUmaPropostaAgent(id)
  })
}

function mostrarChatRestoreAposApply(arquivos) {
  renderChatRestoreStrip($('chat-messages'), {
    arquivos: arquivos || [],
    onDesfazer: () => void desfazerCheckpointDoChat()
  })
  atualizarChatApplyCard(agentPropostas)
}

async function desfazerCheckpointDoChat() {
  const r = await window.api.invoke('agente:checkpoint-desfazer', pastasPermitidas())
  if (r?.ok) {
    if (window.dgToast) window.dgToast('Checkpoint restaurado (' + (r.restaurados || 0) + ' arquivo(s)).', 'ok')
    else alert('Checkpoint restaurado (' + (r.restaurados || 0) + ' arquivo(s)).')
    ocultarChatRestoreStrip($('chat-messages'))
  } else {
    if (window.dgToast) window.dgToast('Falha: ' + (r?.erro || 'restore'), 'erro')
    else alert('Falha: ' + (r?.erro || 'restore'))
  }
}

async function aplicarUmaPropostaAgent(id) {
  if (!id) return
  if (!(await dgConfirm('Aplicar este arquivo no disco?', 'Aplicar'))) return
  window.__dgApplyViaAgente = true
  const r = await window.api.invoke('agente:aplicar-proposta', id, pastasPermitidas())
  if (!r?.ok) {
    if (window.dgToast) window.dgToast('Falha em apply: ' + (r?.erro || 'erro'), 'erro')
    else alert('Falha em apply: ' + (r?.erro || ''))
    return
  }
  agentPropostas = agentPropostas.filter((p) => p.id !== id)
  const rest = await window.api.invoke('agente:propostas')
  mostrarPropostasAgent(rest?.pendentes || [])
  atualizarChatApplyCard(rest?.pendentes || [])
  mostrarChatRestoreAposApply([r.path || r.absPath].filter(Boolean))
  await oferecerCommitAposApply([r.path || r.absPath].filter(Boolean))
}

async function executarPlanoDoChat(soProximo) {
  if (!state.pastaAtual) {
    alert('Abra uma pasta primeiro.')
    return
  }
  const area = $('chat-messages')
  const modoSel = document.getElementById('chat-mode-select')
  if (modoSel) modoSel.value = 'code'
  const planToggle = document.getElementById('agent-plan-mode')
  if (planToggle) planToggle.checked = false
  mostrarBannerAgentMode(
    area,
    soProximo
      ? 'Proximo passo do plano — Modo Agent'
      : 'Implementar plano — sair do Plan e executar'
  )
  ligarProgressoAgent()
  atualizarCartaoTrabalho(area, {
    titulo: 'Modo Agent',
    passo: soProximo ? 'Executando proximo passo…' : 'Implementando o plano…'
  })
  setChatLiveStatus('Modo Agent — executando plano…')
  setChatSendMode('stop')
  const agentStats = criarStatsVazios()
  const offProg = window.api.on?.('agente:progresso', (_e, ev) => {
    if (!ev || typeof ev !== 'object') return
    aplicarEventoStats(agentStats, ev)
    if (ev.tipo === 'stats' || ev.tipo === 'tool' || ev.tipo === 'proposta') {
      pintarStatsNoCartao(area, agentStats)
    }
    if (ev.tipo === 'status') {
      atualizarCartaoTrabalho(area, { titulo: 'Modo Agent', passo: humanizarStatus(ev.texto) })
    }
  })
  try {
    const r = await window.api.invoke('agente:executar-plano', {
      raiz: state.pastaAtual,
      pastas: pastasPermitidas(),
      soProximo: !!soProximo
    })
    if (!r?.ok) {
      alert(r?.erro || 'Falha ao executar plano')
      return
    }
    if (r.texto) adicionarBolha('assistant', organizarRespostaCursor(r.texto), r.modelo || 'agente')
    renderAgentTrace(r.passos || [])
    mostrarPropostasAgent(r.propostas || [])
    atualizarChatApplyCard(r.propostas || [])
    renderPlanoChecklist(r.plano)
    atualizarChatPlanoCard(r.plano)
    atualizarStatusAgent(r.modelo, r.duracaoMs, r.fila)
    toggleRight(true)
    ativarAbaDireita('agent')
  } finally {
    if (typeof offProg === 'function') offProg()
    fecharCartaoTrabalho(area, 'Pronto')
    setChatSendMode('send')
    setChatLiveStatus('')
    ocultarBannerAgentMode(area)
  }
}

function mostrarPropostasAgent(propostas) {
  agentPropostas = propostas || []
  atualizarChatApplyCard(agentPropostas)
  const box = $('agent-propostas-resumo')
  if (!box) return
  const tinhaFoco = box.contains(document.activeElement)
  if (!agentPropostas.length) {
    box.hidden = true
    box.innerHTML = ''
    box.removeAttribute('aria-label')
    if (tinhaFoco) $('chat-input')?.focus()
    return
  }
  box.hidden = false
  const n = agentPropostas.length
  const linhas = agentPropostas
    .map((p) => {
      const add = (String(p.unifiedDiff || '').match(/^\+/gm) || []).length
      const del = (String(p.unifiedDiff || '').match(/^-/gm) || []).length
      return (
        '<li><code>' +
        String(p.path || '').replace(/</g, '&lt;') +
        '</code> <span class="muted">+' +
        Math.max(0, add - 1) +
        '/-' +
        Math.max(0, del - 1) +
        '</span></li>'
      )
    })
    .join('')
  box.setAttribute('aria-label', n + ' proposta(s) de edição pendentes')
  box.innerHTML =
    '<div class="agent-propostas-titulo"><strong>' +
    n +
    ' proposta(s)</strong></div><ul class="agent-propostas-lista">' +
    linhas +
    '</ul>'
  const acoes = document.createElement('div')
  acoes.className = 'agent-propostas-acoes'
  const btnVer = document.createElement('button')
  btnVer.type = 'button'
  btnVer.className = 'btn-small'
  btnVer.textContent = 'Revisar diffs'
  btnVer.addEventListener('click', () => abrirFilaPropostasAgent())
  const btnAll = document.createElement('button')
  btnAll.type = 'button'
  btnAll.className = 'btn-small'
  btnAll.textContent = 'Aplicar todas'
  btnAll.addEventListener('click', () => void aplicarTodasPropostasAgent())
  acoes.appendChild(btnVer)
  acoes.appendChild(btnAll)
  box.appendChild(acoes)
  if (tinhaFoco) btnVer.focus()
}

function abrirFilaPropostasAgent() {
  if (!agentPropostas.length) return
  ocPendentes = agentPropostas.map((p) => ({
    id: p.id,
    path: p.path,
    absPath: p.absPath || p.path,
    unifiedDiff: p.unifiedDiff
  }))
  // reutilizar painel OpenClaw mas apply via agente:aplicar-proposta
  renderListaPendentesOc()
  mostrarDiffOpenClaw(ocPendentes[0])
  window.__dgApplyViaAgente = true
}

async function aplicarTodasPropostasAgent() {
  if (!agentPropostas.length) return
  const total = agentPropostas.length
  if (
    !(await dgConfirm(
      'Aplicar ' + total + ' arquivo(s)? Um checkpoint será criado por arquivo.',
      'Aplicar propostas'
    ))
  )
    return
  const aplicados = []
  const checkpoints = []
  const falhas = []
  window.__dgApplyViaAgente = true
  for (const p of [...agentPropostas]) {
    const r = await window.api.invoke('agente:aplicar-proposta', p.id, pastasPermitidas())
    if (!r?.ok) {
      falhas.push({ path: p.path, erro: r?.erro || 'erro' })
      continue
    }
    aplicados.push(p.path || r.path)
    if (r.checkpointId) checkpoints.push({ id: r.checkpointId, path: p.path })
  }
  const rest = await window.api.invoke('agente:propostas')
  mostrarPropostasAgent(rest?.pendentes || [])
  atualizarChatApplyCard(rest?.pendentes || [])
  if (aplicados.length) {
    mostrarChatRestoreAposApply(aplicados)
    await oferecerCommitAposApply(aplicados)
  }
  if (falhas.length) {
    const resume = falhas
      .slice(0, 5)
      .map((f) => '· ' + f.path + ': ' + f.erro)
      .join('\n')
    const desfazer = await dgConfirm(
      aplicados.length +
        ' arquivo(s) aplicado(s), ' +
        falhas.length +
        ' falhou(aram):\n' +
        resume +
        '\n\nDeseja desfazer os arquivos já aplicados?',
      'Desfazer aplicados'
    )
    if (desfazer && checkpoints.length) {
      let desfeitos = 0
      for (const ck of [...checkpoints].reverse()) {
        const rr = await window.api.invoke('agente:checkpoint-restaurar', ck.id, pastasPermitidas())
        if (rr?.ok) desfeitos++
      }
      ocultarChatRestoreStrip($('chat-messages'))
      if (window.dgToast) window.dgToast('Apply parcial: ' + desfeitos + ' arquivo(s) revertido(s).', 'aviso')
    } else if (window.dgToast) {
      window.dgToast('Apply parcial: ' + aplicados.length + ' ok, ' + falhas.length + ' com falha.', 'aviso')
    }
    return
  }
  if (window.dgToast) window.dgToast('Apply concluído (' + aplicados.length + ' arquivo(s)).', 'ok')
  else alert('Apply concluído.')
}

function ligarProgressoAgent() {
  if (agentProgressUnsub) agentProgressUnsub()
  const painelStats = criarStatsVazios()
  agentProgressUnsub = window.api.on('agente:progresso', (_e, ev) => {
    if (!ev || typeof ev !== 'object') return
    aplicarEventoStats(painelStats, ev)
    if (ev.tipo === 'stats' || ev.tipo === 'tool' || ev.tipo === 'proposta') {
      let strip = document.getElementById('agent-stats-live')
      if (!strip) {
        const out = $('agent-output')
        if (out && out.parentElement) {
          strip = document.createElement('p')
          strip.id = 'agent-stats-live'
          strip.className = 'chat-work-stats agent-stats-live'
          out.parentElement.insertBefore(strip, out)
        }
      }
      if (strip) {
        const parts = []
        if (painelStats.edits) parts.push('Editing ' + painelStats.edits)
        if (painelStats.explored) parts.push('explored ' + painelStats.explored)
        if (painelStats.searches) parts.push(painelStats.searches + ' searches')
        if (painelStats.tools) parts.push(painelStats.tools + ' tools')
        if (painelStats.commands) parts.push('ran ' + painelStats.commands + ' commands')
        strip.textContent = parts.join(' · ')
        strip.hidden = !parts.length
      }
      pintarStatsNoCartao($('chat-messages'), painelStats)
    }
    if (ev.tipo === 'status') {
      const etapa = humanizarStatus(ev.texto)
      appendAgentTraceLive(etapa)
      anunciarEtapaAgente(etapa)
    }
    else if (ev.tipo === 'tool' && ev.fase === 'inicio') appendAgentTraceLive(humanizarToolInicio(ev.nome) + '…')
    else if (ev.tipo === 'tool' && ev.fase === 'fim')
      appendAgentTraceLive(humanizarToolFim(ev.nome, ev.detalhe))
    else if (ev.tipo === 'proposta') { appendAgentTraceLive('Sugestão: ' + (ev.path || 'arquivo')); if (ev.id) void previewDiffNoEditor({ id: ev.id, path: ev.path }) }
    else if (ev.tipo === 'texto-delta') {
      const out = $('agent-output')
      if (out) {
        if (out.dataset.stream !== '1') out.textContent = ''
        out.dataset.stream = '1'
        out.textContent += String(ev.texto || '')
      }
    }
    else if (ev.tipo === 'texto') {
      const out = $('agent-output')
      if (out) {
        out.textContent = String(ev.texto || '')
        delete out.dataset.stream
      }
    }
  })
}

/** Anuncia etapas e resultado do turno mesmo fora do painel Agent (ex.: chat). */
function ligarAnuncioEtapasAgente() {
  window.api.on?.('agente:progresso', (_e, ev) => {
    if (!ev || typeof ev !== 'object') return
    if (ev.tipo === 'fim') {
      if (lerPreferenciasA11y().anuncioStreaming === 'silencioso') return
      if (ev.cancelado) anunciar('Geração interrompida.')
      else if (ev.ok) anunciar('Resposta concluída.')
      else anunciar('Não foi possível concluir a resposta.', { urgencia: 'assertivo' })
      return
    }
    if (ev.tipo !== 'status') return
    anunciarEtapaAgente(humanizarStatus(ev.texto))
  })
}

function coletarAbasCtx() {
  const out = []
  for (const a of state.abas) {
    const item = { path: a.caminho, ativa: a.caminho === state.abaAtiva }
    if (a.caminho === state.abaAtiva && editor && editor.getConteudo) {
      try {
        item.conteudo = editor.getConteudo()
      } catch {
        /* */
      }
    }
    out.push(item)
  }
  return out
}

/** Erros/diagnostics recentes do agent (typecheck/test/manual) para o contexto. */
async function coletarErrosEditor() {
  try {
    const r = await window.api.invoke('agente:diagnosticos')
    const lista = (r?.recentes || r?.diagnosticos || []).filter((d) => d && d.ok === false && d.saida)
    if (!lista.length) return ''
    return lista
      .slice(0, 5)
      .map((d) => '[' + d.origem + '] ' + (d.resumo || '') + '\n' + String(d.saida || '').slice(0, 3000))
      .join('\n\n')
      .slice(0, 8000)
  } catch {
    return ''
  }
}

function renderPlanoChecklist(plano) {
  const box = $('agent-plano-checklist')
  if (!box) return
  const passos = plano?.passos || []
  if (!passos.length) {
    box.hidden = true
    box.innerHTML = ''
    return
  }
  box.hidden = false
  box.innerHTML = ''
  const titulo = document.createElement('div')
  titulo.innerHTML =
    '<strong>Plano</strong> <span class="muted">' +
    passos.filter((p) => p.feito).length +
    '/' +
    passos.length +
    '</span>'
  box.appendChild(titulo)
  for (const p of passos) {
    const lab = document.createElement('label')
    if (p.feito) lab.classList.add('feito')
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = !!p.feito
    cb.addEventListener('change', async () => {
      await window.api.invoke('agente:plano-marcar-passo', p.id, cb.checked)
      const r = await window.api.invoke('agente:plano-ler')
      renderPlanoChecklist(r?.plano)
      atualizarChatPlanoCard(r?.plano)
    })
    const span = document.createElement('span')
    span.textContent = p.texto
    lab.appendChild(cb)
    lab.appendChild(span)
    box.appendChild(lab)
  }
  // Espelho vivo no transcript do chat
  atualizarChatPlanoCard(plano)
}

async function refrescarPlanoUi() {
  const r = await window.api.invoke('agente:plano-ler')
  renderPlanoChecklist(r?.plano)
}

function agenteSelecionadoUi() {
  const chat = document.getElementById('chat-agent-select')?.value
  const adv = document.getElementById('agent-select')?.value
  const v = chat && chat !== 'auto' ? chat : adv
  return v && v !== 'auto' ? v : undefined
}

function sincronizarAgenteSelects(origem) {
  const chat = document.getElementById('chat-agent-select')
  const adv = document.getElementById('agent-select')
  if (!chat || !adv) return
  if (origem === 'chat' && chat.value) {
    if (Array.from(adv.options).some((o) => o.value === chat.value)) adv.value = chat.value
  } else if (origem === 'agent' && adv.value) {
    if (Array.from(chat.options).some((o) => o.value === adv.value)) chat.value = adv.value
  }
}

async function executarAgentUi(orquestrar) {
  if (!state.pastaAtual) {
    alert('Abra uma pasta primeiro.')
    return
  }
  const input = $('agent-input')
  const texto = input?.value?.trim()
  if (!texto) return
  const plan =
    $('agent-plan-mode')?.checked ||
    document.getElementById('chat-mode-select')?.value === 'plan'
  const verify = $('agent-verify-loop')?.checked
  const agente = agenteSelecionadoUi()
  const out = $('agent-output')
  const send = $('agent-send')
  if (send) send.disabled = true
  if (out) out.textContent = plan ? 'Gerando plano…' : 'Executando…'
  renderAgentTrace([])
  mostrarPropostasAgent([])
  ligarProgressoAgent()
  let selecao = ''
  try {
    if (editor && editor.getSelecao) selecao = editor.getSelecao() || ''
  } catch {
    /* */
  }
  try {
    let r
    if (orquestrar) {
      r = await window.api.invoke('agente:orquestrar', state.pastaAtual, texto)
      if (out) {
        out.textContent = (r?.passos || [])
          .map((p) => '## ' + p.agente + (p.ok ? '' : ' (erro)') + '\n' + (p.texto || p.erro || ''))
          .join('\n\n')
      }
      const todos = []
      for (const p of r?.passos || []) {
        if (p.passos) todos.push(...p.passos)
      }
      renderAgentTrace(todos)
    } else {
      const errosEditor = await coletarErrosEditor()
      r = await window.api.invoke('agente:pedir', {
        raiz: state.pastaAtual,
        pergunta: texto,
        modo: plan ? 'plan' : 'agent',
        agente,
        pastas: pastasPermitidas(),
        selecao,
        arquivoAtivo: state.abaAtiva || undefined,
        proposeWrites: true,
        verificarApos: !!verify && !plan,
        abas: coletarAbasCtx(),
        incluirGit: true,
        errosEditor: errosEditor || undefined
      })
      if (!r?.ok) {
        if (out) out.textContent = 'Erro: ' + (r?.erro || 'falha')
        return
      }
      if (out) {
        out.textContent =
          (plan ? '[PLAN]\n\n' : '') +
          (r.texto || '') +
          (r.duracaoMs ? '\n\n— ' + r.duracaoMs + ' ms · ' + (r.modelo || '') : '')
      }
      renderAgentTrace(r.passos || [])
      mostrarPropostasAgent(r.propostas || [])
      atualizarStatusAgent(r.modelo, r.duracaoMs, r.fila)
      if (plan || r.plano) renderPlanoChecklist(r.plano)
      else await refrescarPlanoUi()
    }
    await carregarAgentesUi()
  } catch (e) {
    if (out) out.textContent = 'Erro: ' + String(e)
  } finally {
    if (send) send.disabled = false
  }
}

$('agent-send')?.addEventListener('click', () => void executarAgentUi(false))
$('btn-agent-orquestrar')?.addEventListener('click', () => void executarAgentUi(true))
$('btn-agent-stop')?.addEventListener('click', async () => {
  const r = await window.api.invoke('agente:cancelar')
  appendAgentTraceLive('■ cancelado (' + (r?.cancelados || 0) + ')')
  limparUiAgenteChat({ tituloFinal: 'Parado a seu pedido' })
  await carregarAgentesUi()
})
;(function initAgentMoreMenu() {
  const btn = $('btn-agent-mais')
  const menu = $('agent-mais-menu')
  const header = $('agent-header')
  if (!btn || !menu) return
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    const open = menu.hidden
    menu.hidden = !open
    btn.setAttribute('aria-expanded', open ? 'true' : 'false')
    header?.classList.toggle('is-expanded', open)
  })
  menu.querySelectorAll('[data-agent-more]').forEach((item) => {
    item.addEventListener('click', () => {
      const a = item.getAttribute('data-agent-more')
      menu.hidden = true
      btn.setAttribute('aria-expanded', 'false')
      header?.classList.remove('is-expanded')
      if (a === 'passo') $('btn-agent-exec-passo')?.click()
      else if (a === 'verificar') $('btn-agent-verificar')?.click()
      else if (a === 'undo') $('btn-agent-undo')?.click()
    })
  })
  document.addEventListener('click', () => {
    if (!menu.hidden) {
      menu.hidden = true
      btn.setAttribute('aria-expanded', 'false')
      header?.classList.remove('is-expanded')
    }
  })
})()
$('btn-agent-exec-plano')?.addEventListener('click', async () => {
  if (!state.pastaAtual) return
  ligarProgressoAgent()
  const out = $('agent-output')
  if (out) out.textContent = 'Executando plano salvo…'
  const r = await window.api.invoke('agente:executar-plano', {
    raiz: state.pastaAtual,
    pastas: pastasPermitidas(),
    soProximo: false
  })
  if (!r?.ok) {
    alert(r?.erro || 'falha')
    return
  }
  if (out) out.textContent = r.texto || ''
  renderAgentTrace(r.passos || [])
  mostrarPropostasAgent(r.propostas || [])
  atualizarChatApplyCard(r.propostas || [])
  atualizarStatusAgent(r.modelo, r.duracaoMs, null)
  renderPlanoChecklist(r.plano)
  mostrarBannerAgentMode($('chat-messages'), 'Plano executado pelo painel Agente')
})
$('btn-agent-exec-passo')?.addEventListener('click', async () => {
  if (!state.pastaAtual) return
  ligarProgressoAgent()
  const out = $('agent-output')
  if (out) out.textContent = 'Executando próximo passo…'
  const r = await window.api.invoke('agente:executar-plano', {
    raiz: state.pastaAtual,
    pastas: pastasPermitidas(),
    soProximo: true
  })
  if (!r?.ok) {
    alert(r?.erro || 'falha')
    return
  }
  if (out) {
    out.textContent =
      (r.passoExecutado ? '[Passo] ' + r.passoExecutado.texto + '\n\n' : '') + (r.texto || '')
  }
  renderAgentTrace(r.passos || [])
  mostrarPropostasAgent(r.propostas || [])
  atualizarChatApplyCard(r.propostas || [])
  renderPlanoChecklist(r.plano)
})
$('btn-agent-verificar')?.addEventListener('click', async () => {
  if (!state.pastaAtual) return
  appendAgentTraceLive('… typecheck')
  const r = await window.api.invoke('agente:verificar', {
    raiz: state.pastaAtual,
    pastas: pastasPermitidas(),
    modo: 'typecheck'
  })
  const d = r?.diagnostico
  appendAgentTraceLive(d?.ok ? 'âœ“ typecheck ok' : 'âœ— ' + (d?.resumo || 'falha'))
  const out = $('agent-output')
  if (out && d && !d.ok) out.textContent = (out.textContent || '') + '\n\n[typecheck]\n' + (d.saida || '')
})
$('btn-agent-undo')?.addEventListener('click', async () => {
  const r = await window.api.invoke('agente:checkpoint-desfazer', pastasPermitidas())
  alert(r?.ok ? 'Checkpoint restaurado (' + r.restaurados + ' arquivo(s)).' : 'Falha: ' + (r?.erro || ''))
})
$('agent-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void executarAgentUi(false)
  }
})
void refrescarPlanoUi()

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
let chatAnexos = []
function renderizarAnexosChat() {
  const bar = document.getElementById('chat-anexos-preview')
  if (!bar) return
  if (!chatAnexos.length) {
    bar.style.display = 'none'
    bar.innerHTML = ''
    return
  }
  bar.style.display = 'flex'
  bar.innerHTML = ''
  for (let i = 0; i < chatAnexos.length; i++) {
    const a = chatAnexos[i]
    const el = document.createElement('div')
    el.style.cssText = 'display:flex;align-items:center;gap:6px;background:var(--panel);border:1px solid var(--border);padding:4px 6px;border-radius:6px'
    const txt = document.createElement('span')
    txt.textContent = a.nome + (a.tamanho ? ' (' + Math.round(a.tamanho / 1024) + 'KB)' : '')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'btn-ghost'
    btn.textContent = '×'
    btn.onclick = () => {
      chatAnexos.splice(i, 1)
      renderizarAnexosChat()
    }
    el.appendChild(txt)
    el.appendChild(btn)
    bar.appendChild(el)
  }
}
// Anexar: abre via popover de contexto (initChatIconContext)
document.getElementById('chat-anexos-input')?.addEventListener('change', async (e) => {
  const input = e.target
  const files = Array.from(input.files || [])
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer()
      const bytes = new Uint8Array(buf)
      let bin = ''
      const passo = 8192
      for (let i = 0; i < bytes.length; i += passo) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + passo))
      }
      const base64 = btoa(bin)
      chatAnexos.push({
        nome: f.name,
        tipo: f.type || '',
        tamanho: f.size,
        data: base64
      })
    } catch {}
  }
  input.value = ''
  renderizarAnexosChat()
})
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

// Ctrl+Shift+V em captura: no editor vira "colar como Markdown";
// fora de campos de texto abre a prévia. Terminal e inputs mantêm o padrão.
document.addEventListener(
  'keydown',
  (e) => {
    const mod = e.ctrlKey || e.metaKey
    if (!mod || !e.shiftKey || e.altKey || e.key.toLowerCase() !== 'v') return
    const el = document.activeElement
    if (el instanceof Element && !el.closest('.cm-editor')) {
      const tag = el.tagName
      if (el.closest('.xterm') || tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable) return
    }
    e.preventDefault()
    e.stopPropagation()
    void colarComoMarkdown()
  },
  true
)

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

function abrirModalReinicio(motivo) {
  var m = document.getElementById('modal-reinicio')
  if (!m) return
  var p = document.getElementById('reinicio-motivo')
  if (p)
    p.textContent =
      (motivo || 'Algumas alteracoes precisam de reinicio para serem aplicadas') +
      '. Deseja reiniciar agora?'
  m.classList.remove('hidden')
}
function fecharModalReinicio() {
  var m = document.getElementById('modal-reinicio')
  if (m) m.classList.add('hidden')
}

function perguntarEscolha(titulo, opcoes, config) {
  const multiplo = !!(config && config.multiplo)
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'escolha-overlay'
    const caixa = document.createElement('div')
    caixa.className = 'escolha-caixa'
    const h = document.createElement('h3')
    h.textContent = titulo
    h.style.cssText = 'margin:0 0 12px;font-size:15px;'
    caixa.appendChild(h)
    const selecionadas = new Set()
    opcoes.forEach((op) => {
      const btn = document.createElement('button')
      btn.textContent = op
      btn.className = 'btn-ghost'
      btn.style.cssText = 'display:block;width:100%;margin:6px 0;'
      if (multiplo) {
        btn.addEventListener('click', () => {
          if (selecionadas.has(op)) selecionadas.delete(op)
          else selecionadas.add(op)
          btn.style.background = selecionadas.has(op) ? 'var(--dg-active)' : ''
        })
      } else {
        btn.addEventListener('click', () => {
          overlay.remove()
          resolve([op])
        })
      }
      caixa.appendChild(btn)
    })
    if (multiplo) {
      const ok = document.createElement('button')
      ok.textContent = 'Confirmar'
      ok.className = 'btn-primary'
      ok.style.width = '100%'
      ok.style.marginTop = '12px'
      ok.addEventListener('click', () => {
        overlay.remove()
        resolve(Array.from(selecionadas))
      })
      caixa.appendChild(ok)
    }
    const cancelar = document.createElement('button')
    cancelar.textContent = 'Cancelar'
    cancelar.className = 'btn-ghost'
    cancelar.style.width = '100%'
    cancelar.addEventListener('click', () => {
      overlay.remove()
      resolve(null)
    })
    caixa.appendChild(cancelar)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove()
        resolve(null)
      }
    })
    overlay.appendChild(caixa)
    document.body.appendChild(overlay)
  })
}
window.perguntarEscolha = perguntarEscolha

/** Diretório pai de um caminho (arquivo → pasta). */
function dirPaiDe(caminho) {
  const n = String(caminho || '').replace(/[/\\]+$/, '')
  const i = Math.max(n.lastIndexOf('\\'), n.lastIndexOf('/'))
  return i > 0 ? n.slice(0, i) : n
}

let menuCtxArvore = null
let menuCtxFocoAnterior = null

/**
 * @param {boolean} [restaurarFoco] devolve o foco à linha que abriu o menu
 */
function fecharMenuCtxArvore(restaurarFoco = false) {
  const menu = menuCtxArvore
  const foco = menuCtxFocoAnterior
  menuCtxArvore = null
  menuCtxFocoAnterior = null
  if (menu) menu.remove()
  if (restaurarFoco && foco && foco.isConnected) {
    try {
      foco.focus()
    } catch {
      /* */
    }
  }
}

function juntarCaminho(base, nome) {
  const b = String(base || '').replace(/[/\\]+$/, '')
  const sep = b.includes('\\') ? '\\' : '/'
  return b + sep + String(nome || '').replace(/^[/\\]+/, '')
}

async function recarregarArvoreExplorer() {
  await renderizarPastas()
  await atualizarGitStatusArvore()
}

function erroOperacao(titulo, r) {
  alert(titulo + ': ' + ((r && r.erro) || 'erro desconhecido'))
}

async function criarNoExplorer(baseDir, tipo) {
  const nome = window.prompt(tipo === 'dir' ? 'Nome da nova pasta:' : 'Nome do novo arquivo:')
  if (nome == null) return
  const limpo = String(nome).trim()
  if (!limpo) return
  const r = await window.api.invoke(
    'arquivo:criar',
    juntarCaminho(baseDir, limpo),
    tipo,
    pastasPermitidas()
  )
  if (!r || !r.ok) return erroOperacao('Falha ao criar', r)
  await recarregarArvoreExplorer()
}

async function renomearExplorer(alvoPath) {
  const linha = Array.from(document.querySelectorAll('.tree-item[data-path]')).find(
    (el) => el.dataset.path === alvoPath
  )
  if (linha) return renomearInlineNaArvore(linha)
  await dgAlert('Abra a árvore de arquivos e use F2 sobre o item para renomear.', 'Renomear')
}

function renomearInlineNaArvore(linha) {
  const alvoPath = linha.dataset.path || ''
  if (!alvoPath || (linha.dataset.tipo !== 'file' && linha.dataset.tipo !== 'dir')) return
  const atual = alvoPath.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || ''
  const htmlOriginal = linha.innerHTML
  linha.innerHTML = ''
  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'tree-rename-input'
  input.value = atual
  input.setAttribute('aria-label', 'Novo nome para ' + atual)
  linha.appendChild(input)
  input.focus()
  input.select()
  let concluido = false
  const finalizar = async (salvar) => {
    if (concluido) return
    concluido = true
    const limpo = input.value.trim()
    linha.innerHTML = htmlOriginal
    if (!salvar || !limpo || limpo === atual) return
    const r = await window.api.invoke('arquivo:renomear', alvoPath, limpo, pastasPermitidas())
    if (!r || !r.ok) return erroOperacao('Falha ao renomear', r)
    await recarregarArvoreExplorer()
  }
  input.addEventListener('keydown', (ev) => {
    ev.stopPropagation()
    if (ev.key === 'Enter') {
      ev.preventDefault()
      void finalizar(true)
    } else if (ev.key === 'Escape') {
      ev.preventDefault()
      void finalizar(false)
    }
  })
  input.addEventListener('blur', () => void finalizar(true))
}

const SELETOR_LINHA_ARVORE = '.tree-root-header[data-path], .tree-item[data-path]'

function linhasArvore(lista) {
  return Array.from(lista.querySelectorAll(SELETOR_LINHA_ARVORE)).filter((el) => el.getClientRects().length > 0)
}

function garantirLinhaFocavel(lista) {
  if (!lista) return
  const linhas = lista.querySelectorAll(SELETOR_LINHA_ARVORE)
  if (!linhas.length) return
  if (Array.from(linhas).some((l) => l.tabIndex === 0)) return
  linhas[0].tabIndex = 0
}

function focarLinhaArvore(lista, linha) {
  if (!linha || !lista.contains(linha)) return
  for (const l of lista.querySelectorAll(SELETOR_LINHA_ARVORE)) l.tabIndex = -1
  linha.tabIndex = 0
  try {
    linha.focus()
  } catch {
    /* */
  }
}

function linhaAncestralArvore(linhas, indice) {
  const alvo = (linhas[indice]?.dataset.path || '').toLowerCase()
  for (let i = indice - 1; i >= 0; i--) {
    const l = linhas[i]
    if (l.dataset.tipo !== 'dir') continue
    const base = (l.dataset.path || '').toLowerCase()
    if (alvo.startsWith(base + '\\') || alvo.startsWith(base + '/')) return l
  }
  return null
}

function nomeBaseArvore(linha) {
  return String(linha.dataset.path || '')
    .replace(/[/\\]+$/, '')
    .split(/[/\\]/)
    .pop()
    .toLowerCase()
}

/** Próxima linha (com wrap) cujo nome começa pelo termo digitado. */
function indiceTypeaheadArvore(linhas, inicio, termo) {
  const t = String(termo || '').toLowerCase()
  if (!t) return -1
  for (let k = 1; k <= linhas.length; k++) {
    const idx = (inicio + k) % linhas.length
    if (nomeBaseArvore(linhas[idx]).startsWith(t)) return idx
  }
  return -1
}

function ligarTecladoArvore(lista) {
  if (!lista || lista.dataset.tecladoPronto) return
  lista.dataset.tecladoPronto = '1'
  lista.setAttribute('role', 'tree')
  lista.setAttribute('aria-label', 'Arquivos do repositório')
  lista.tabIndex = -1
  let bufferTypeahead = ''
  let timerTypeahead = null
  lista.addEventListener('focus', () => {
    if (document.activeElement !== lista) return
    const linhas = linhasArvore(lista)
    const alvo = linhas.find((l) => l.tabIndex === 0) || linhas[0]
    if (alvo) focarLinhaArvore(lista, alvo)
  })
  lista.addEventListener(
    'click',
    (e) => {
      const linha = e.target.closest?.(SELETOR_LINHA_ARVORE)
      if (linha && !e.target.closest('.pasta-remover')) focarLinhaArvore(lista, linha)
    },
    true
  )
  lista.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const atual = e.target.closest?.(SELETOR_LINHA_ARVORE)
    if (!atual) return
    const linhas = linhasArvore(lista)
    const i = linhas.indexOf(atual)
    if (i < 0) return
    const dir = atual.dataset.tipo === 'dir'
    const chevron = atual.querySelector('.chevron')
    const aberto = !!chevron?.classList.contains('open')
    if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
      e.preventDefault()
      const r = atual.getBoundingClientRect()
      const tipo = atual.dataset.tipo || (atual.classList.contains('tree-root-header') ? 'dir' : 'file')
      abrirMenuCtxArvore(r.left + 24, r.bottom, { path: atual.dataset.path || '', tipo }, atual)
      return
    }
    if (e.key.length === 1 && !/[\u0000-\u001f]/.test(e.key)) {
      e.preventDefault()
      bufferTypeahead += e.key.toLowerCase()
      clearTimeout(timerTypeahead)
      timerTypeahead = setTimeout(() => {
        bufferTypeahead = ''
      }, 800)
      const alvoIdx = indiceTypeaheadArvore(linhas, i, bufferTypeahead)
      if (alvoIdx >= 0) focarLinhaArvore(lista, linhas[alvoIdx])
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focarLinhaArvore(lista, linhas[Math.min(i + 1, linhas.length - 1)])
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focarLinhaArvore(lista, linhas[Math.max(i - 1, 0)])
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (dir && chevron && !aberto) chevron.click()
      else focarLinhaArvore(lista, linhas[Math.min(i + 1, linhas.length - 1)])
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (dir && chevron && aberto) chevron.click()
      else focarLinhaArvore(lista, linhaAncestralArvore(linhas, i) || atual)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focarLinhaArvore(lista, linhas[0])
    } else if (e.key === 'End') {
      e.preventDefault()
      focarLinhaArvore(lista, linhas[linhas.length - 1])
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (dir && chevron) chevron.click()
      else atual.click()
    } else if (e.key === 'F2') {
      e.preventDefault()
      if (atual.classList.contains('tree-item')) void renomearInlineNaArvore(atual)
      else mostrarToast('A raiz não pode ser renomeada aqui', 'aviso')
    }
  })
}

async function excluirExplorer(alvoPath) {
  const nome = String(alvoPath).replace(/[/\\]+$/, '').split(/[/\\]/).pop() || alvoPath
  if (!window.confirm('Excluir "' + nome + '"? O item vai para a lixeira do sistema.')) return
  const r = await window.api.invoke('arquivo:excluir', alvoPath, pastasPermitidas())
  if (!r || !r.ok) return erroOperacao('Falha ao excluir', r)
  await recarregarArvoreExplorer()
}

function abrirMenuCtxArvore(x, y, alvo, focoRetorno = null) {
  fecharMenuCtxArvore()
  const alvoPath = String(alvo.path || '')
  const tipo = alvo.tipo === 'file' ? 'file' : 'dir'
  const pastaBase = tipo === 'file' ? dirPaiDe(alvoPath) : alvoPath
  const ehRaiz = (state.pastasRecentes || []).some((p) => String(p) === alvoPath)
  const menu = document.createElement('div')
  menu.className = 'tree-ctx-menu'
  menu.setAttribute('role', 'menu')
  menuCtxFocoAnterior = focoRetorno || document.activeElement
  const add = (label, fn, opts = {}) => {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'tree-ctx-item' + (opts.perigo ? ' is-perigo' : '')
    item.setAttribute('role', 'menuitem')
    item.textContent = label
    item.addEventListener('click', (e) => {
      e.stopPropagation()
      fecharMenuCtxArvore()
      fn()
    })
    menu.appendChild(item)
  }
  const sep = () => {
    const d = document.createElement('div')
    d.className = 'tree-ctx-sep'
    d.setAttribute('role', 'separator')
    menu.appendChild(d)
  }
  add('Novo arquivo…', () => void criarNoExplorer(pastaBase, 'file'))
  add('Nova pasta…', () => void criarNoExplorer(pastaBase, 'dir'))
  if (!ehRaiz) {
    sep()
    add('Renomear…', () => void renomearExplorer(alvoPath))
    add('Excluir…', () => void excluirExplorer(alvoPath), { perigo: true })
  }
  sep()
  add('Abrir terminal nesta pasta', () => {
    void garantirTerminal().then(() => {
      const api = window.dgTerminal
      if (api && typeof api.abrirEm === 'function') {
        void api.abrirEm(pastaBase)
      } else {
        console.warn('[arvore] dgTerminal.abrirEm indisponivel')
      }
    })
  })
  document.body.appendChild(menu)
  const pad = 4
  const rect = menu.getBoundingClientRect()
  let left = x
  let top = y
  if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad
  if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad
  menu.style.left = Math.max(pad, left) + 'px'
  menu.style.top = Math.max(pad, top) + 'px'
  menu.addEventListener('keydown', (e) => {
    const itens = Array.from(menu.querySelectorAll('.tree-ctx-item'))
    if (!itens.length) return
    const i = itens.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      itens[(i + 1) % itens.length].focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      itens[(i - 1 + itens.length) % itens.length].focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      itens[0].focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      itens[itens.length - 1].focus()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      fecharMenuCtxArvore(true)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      fecharMenuCtxArvore(true)
    }
  })
  menuCtxArvore = menu
  const primeiro = menu.querySelector('.tree-ctx-item')
  try {
    primeiro?.focus()
  } catch {
    /* */
  }
}

function limparDropArvore() {
  document.querySelectorAll('.tree-item.drag-over, .tree-root-header.drag-over').forEach((el) =>
    el.classList.remove('drag-over')
  )
  document.querySelectorAll('.tree-item.dragging').forEach((el) => el.classList.remove('dragging'))
}

async function moverArvore(origem, destinoPasta) {
  if (!origem || !destinoPasta) return
  if (String(origem).toLowerCase() === String(destinoPasta).toLowerCase()) return
  const r = await window.api.invoke('arquivo:mover', origem, destinoPasta, pastasPermitidas())
  if (!r || !r.ok) return erroOperacao('Falha ao mover', r)
  await recarregarArvoreExplorer()
}

function initMenuCtxArvore() {
  ligarTecladoArvore($('files-list'))
  for (const id of ['folder-list', 'files-list']) {
    const lista = $(id)
    if (!lista) continue
    lista.addEventListener('contextmenu', (e) => {
      const alvo =
        e.target.closest('.tree-item[data-path]') || e.target.closest('.tree-root-header[data-path]')
      if (!alvo) return
      e.preventDefault()
      e.stopPropagation()
      const path = alvo.dataset.path
      if (!path) return
      const tipo = alvo.dataset.tipo || (alvo.classList.contains('tree-root-header') ? 'dir' : 'file')
      abrirMenuCtxArvore(e.clientX, e.clientY, { path, tipo }, alvo)
    })
  }
  const listas = ['folder-list', 'files-list'].map((id) => $(id)).filter(Boolean)
  for (const lista of listas) {
    lista.addEventListener('dragstart', (e) => {
      const alvo = e.target.closest?.('.tree-item[data-path], .tree-root-header[data-path]')
      if (!alvo) return
      if (alvo.classList.contains('tree-root-header')) return
      e.dataTransfer.setData('text/plain', alvo.dataset.path || '')
      e.dataTransfer.effectAllowed = 'move'
      alvo.classList.add('dragging')
    })
    lista.addEventListener('dragend', limparDropArvore)
    lista.addEventListener('dragover', (e) => {
      const destino = e.target.closest?.('.tree-root-header[data-path], .tree-item[data-tipo="dir"][data-path]')
      if (!destino) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (!destino.classList.contains('drag-over')) {
        document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))
        destino.classList.add('drag-over')
      }
    })
    lista.addEventListener('dragleave', (e) => {
      const destino = e.target.closest?.('.drag-over')
      if (destino && !destino.contains(e.relatedTarget)) destino.classList.remove('drag-over')
    })
    lista.addEventListener('drop', (e) => {
      const destino = e.target.closest?.('.tree-root-header[data-path], .tree-item[data-tipo="dir"][data-path]')
      if (!destino) return
      e.preventDefault()
      const origem = e.dataTransfer.getData('text/plain')
      const pastaDestino = destino.dataset.path || ''
      limparDropArvore()
      void moverArvore(origem, pastaDestino)
    })
  }
  document.addEventListener('click', (e) => {
    if (menuCtxArvore && !menuCtxArvore.contains(e.target)) fecharMenuCtxArvore()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharMenuCtxArvore()
  })
  window.addEventListener('blur', () => fecharMenuCtxArvore())
}

async function atualizarIconeMax() {
  try {
    const st = await window.api.invoke('janela:estado')
    const b = document.getElementById('tb-max')
    if (!b) return
    b.title = st && st.maximizado ? 'Restaurar' : 'Maximizar'
  } catch {}
}

// ---------- Menubar (titlebar frameless) ----------
const MENUS_BARRA = {
  arquivo: [
    { id: 'assistente-novo', label: 'Novo…', accel: 'Ctrl+N' },
    { id: 'abrir-pasta', label: 'Abrir pasta de trabalho…', accel: 'Ctrl+O' },
    { id: 'abrir-vault', label: 'Abrir vault Markdown…' },
    { sep: true },
    { id: 'salvar', label: 'Salvar', accel: 'Ctrl+S' },
    { id: 'fechar-aba', label: 'Fechar aba', accel: 'Ctrl+W' },
    { sep: true },
    { id: 'navegador', label: 'Navegador…', accel: 'Ctrl+Shift+N' },
    { sep: true },
    { id: 'sair', label: 'Sair', accel: 'Alt+F4' }
  ],
  editar: [
    { id: 'edit-undo', label: 'Desfazer', accel: 'Ctrl+Z', edit: 'undo' },
    { id: 'edit-redo', label: 'Refazer', accel: 'Ctrl+Y', edit: 'redo' },
    { sep: true },
    { id: 'edit-cut', label: 'Recortar', accel: 'Ctrl+X', edit: 'cut' },
    { id: 'edit-copy', label: 'Copiar', accel: 'Ctrl+C', edit: 'copy' },
    { id: 'edit-paste', label: 'Colar', accel: 'Ctrl+V', edit: 'paste' },
    { id: 'edit-selectAll', label: 'Selecionar tudo', accel: 'Ctrl+A', edit: 'selectAll' },
    { sep: true },
    { id: 'formatar', label: 'Formatar documento', accel: 'Shift+Alt+F' }
  ],
  ver: [
    { id: 'recarregar', label: 'Recarregar', accel: 'Ctrl+R' },
    { id: 'forcar-recarregar', label: 'Forçar recarregamento', accel: 'Ctrl+Shift+R' },
    { sep: true },
    { id: 'zoom-in', label: 'Zoom: aumentar', accel: 'Ctrl+=' },
    { id: 'zoom-out', label: 'Zoom: diminuir', accel: 'Ctrl+-' },
    { id: 'zoom-reset', label: 'Zoom: padrão', accel: 'Ctrl+0' },
    { sep: true },
    { id: 'toggle-sidebar', label: 'Alternar Explorer', accel: 'Ctrl+B' },
    { id: 'toggle-right', label: 'Alternar painel direito', accel: 'Ctrl+Alt+B' },
    { id: 'toggle-terminal', label: 'Alternar terminal', accel: 'Ctrl+`' },
    { id: 'tema', label: 'Alternar tema' },
    { id: 'tema-escuro', label: 'Tema escuro' },
    { id: 'tema-claro', label: 'Tema claro' },
    { sep: true },
    { id: 'tela-cheia', label: 'Tela cheia', accel: 'F11' },
    { sep: true },
    { id: 'orientar-prompt', label: 'Assistente de prompt', accel: 'Ctrl+Alt+P' },
    { id: 'agent-panel', label: 'Painel Agente' }
  ],
  sistemas: [
    { id: 'paleta-comandos', label: 'Paleta de comandos', accel: 'Ctrl+Shift+P' },
    { id: 'quick-open', label: 'Quick Open', accel: 'Ctrl+P' },
    { sep: true },
    { id: 'contas', label: 'Contas e saúde' },
    { id: 'config', label: 'Configurações' },
    { id: 'analisar', label: 'Análise do sistema' },
    { id: 'auditar', label: 'Auto auditoria' },
    { id: 'regras-projeto', label: 'Regras do projeto (.dgrules)' },
    { sep: true },
    { id: 'estudio-midia', label: 'Estúdio de mídia' },
    { id: 'navegador', label: 'Navegador embutido', accel: 'Ctrl+Shift+N' }
  ],
  ajuda: [{ id: 'sobre', label: 'Sobre o DG Editor' }]
}

function fecharMenubar() {
  const bar = document.getElementById('menubar')
  if (!bar) return
  bar.dataset.open = ''
  bar.querySelectorAll('.mb-btn').forEach((b) => b.setAttribute('aria-expanded', 'false'))
  bar.querySelectorAll('.mb-dropdown').forEach((p) => {
    p.hidden = true
  })
}

function abrirMenuPainel(nome) {
  const bar = document.getElementById('menubar')
  if (!bar) return
  bar.dataset.open = nome
  bar.querySelectorAll('.mb-btn').forEach((b) => {
    const on = b.getAttribute('data-menu') === nome
    b.setAttribute('aria-expanded', on ? 'true' : 'false')
  })
  bar.querySelectorAll('.mb-dropdown').forEach((p) => {
    p.hidden = p.getAttribute('data-menu-panel') !== nome
  })
}

function executarAcaoMenu(id, editCmd) {
  if (editCmd) {
    acaoEditar(editCmd)
    return
  }
  if (executarComandoLocal(id)) return
  executarComando(id)
}

function popularPainelMenu(panel, itens) {
  panel.textContent = ''
  for (const it of itens) {
    if (it.sep) {
      const hr = document.createElement('div')
      hr.className = 'mb-sep'
      hr.setAttribute('role', 'separator')
      panel.appendChild(hr)
      continue
    }
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'mb-option'
    btn.setAttribute('role', 'menuitem')
    btn.dataset.acao = it.id
    if (it.edit) btn.dataset.edit = it.edit
    const lab = document.createElement('span')
    lab.textContent = it.label
    btn.appendChild(lab)
    if (it.accel) {
      const acc = document.createElement('span')
      acc.className = 'mb-accel'
      acc.textContent = it.accel
      btn.appendChild(acc)
    }
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      fecharMenubar()
      executarAcaoMenu(it.id, it.edit)
    })
    panel.appendChild(btn)
  }
}

function initMenubar() {
  const bar = document.getElementById('menubar')
  if (!bar || bar.dataset.ready === '1') return
  bar.dataset.ready = '1'

  for (const [nome, itens] of Object.entries(MENUS_BARRA)) {
    const panel = bar.querySelector('[data-menu-panel="' + nome + '"]')
    if (panel) popularPainelMenu(panel, itens)
  }

  bar.querySelectorAll('.mb-btn').forEach((btn) => {
    const nome = btn.getAttribute('data-menu')
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (bar.dataset.open === nome) fecharMenubar()
      else abrirMenuPainel(nome)
    })
    btn.addEventListener('mouseenter', () => {
      if (bar.dataset.open && bar.dataset.open !== nome) abrirMenuPainel(nome)
    })
  })

  document.addEventListener('mousedown', (e) => {
    if (!bar.dataset.open) return
    if (bar.contains(e.target)) return
    fecharMenubar()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && bar.dataset.open) {
      fecharMenubar()
      e.stopPropagation()
    }
  })

  try {
    window.api.on('menu:acao', (_ev, id) => {
      if (!id) return
      executarAcaoMenu(String(id))
    })
  } catch (e) {
    console.warn('[menubar] menu:acao:', e)
  }
}

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
      if ((e.key === '0' || e.code === 'Digit0') && !e.shiftKey) {
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
    if (histChat?.obterId) doc.chat = { ...(doc.chat || {}), ativoId: histChat.obterId() || doc.chat?.ativoId }
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




