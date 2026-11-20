// Fiação de eventos: botões da UI.
import { state } from '../../state/app-state.js'
import { agenteEstado } from '../chat/agente-estado.js'
import { obterHistChat } from '../chat/chat-core.js'
import { focarPainelIa } from '../layout/panes.js'
import { pedirPermissaoDesktop, abrirVault, fecharVault, abrirWikiLink } from '../arquivos/desktop-vault.js'
import { abrirPasta } from '../arquivos/pastas-crud.js'
import {
  rodarAnalise,
  analisarCompleta,
  buscarOndeEsta
} from '../analise/acoes.js'
import {
  abrirConfig,
  abrirContas,
  copiarContinuidadeAdapta,
  copiarMcpAdapta,
  rodarDiagnostico,
  rodarBackupOneDrive,
  atualizarPainelAdapta
} from './config-contas.js'
import {
  salvarConfigOpenClawUi,
  carregarConfigOpenClawUi,
  previewDiffNoEditor,
  aplicarPendenteOc,
  aplicarHunksSelecionadosOc,
  rejeitarPendenteOc
} from '../editor/diff-pendentes.js'
import { salvarArquivoAtivo } from '../editor/abas-core.js'
import { toggleRight } from '../layout/paineis.js'
import { setBrowserVisivel, setBrowserStatus } from './activity-browser.js'
import { enviarMensagem } from '../chat/enviar.js'
import { iniciarComposer } from '../chat/composer.js'
import { atualizarGitStatusArvore } from '../arquivos/arvore-render.js'

const $ = (id) => document.getElementById(id)

export function ligarEventosBotoes() {
  $('btn-add-folder')?.addEventListener('click', abrirPasta)
  $('btn-add-repo')?.addEventListener('click', abrirPasta)
  $('btn-sidebar-nova-chat')?.addEventListener('click', () => {
    obterHistChat()?.nova?.()
    focarPainelIa('chat')
  })
  $('btn-desktop-use')?.addEventListener('click', () => pedirPermissaoDesktop())
  $('btn-open-vault')?.addEventListener('click', () => void abrirVault())
  $('btn-close-vault')?.addEventListener('click', () => void fecharVault())
  $('btn-vault-grafo')?.addEventListener('click', () =>
    void import('../../grafo-vault.js').then((m) =>
      m.abrirGrafoVault({ abrirNota: (p) => void import('../editor/abas-core.js').then((a) => a.abrirArquivoNaAba(p)) })
    )
  )
  $('btn-mapa-mental')?.addEventListener('click', () =>
    void import('../../mapa-mental.js').then((m) =>
      m.abrirMapaMental({ raiz: state.pastaAtual || state.vaultRaiz || '' })
    )
  )
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
}

export function ligarComposerEGitPoll() {
  const $id = (id) => document.getElementById(id)
  setInterval(() => {
    if (document.hidden || !state.pastaAtual) return
    void atualizarGitStatusArvore()
  }, 5000)

  function enviarMensagemUi() { void enviarMensagem() }
  $id('chat-send')?.addEventListener('click', enviarMensagemUi)
  iniciarComposer($id('chat-input'), { onEnviar: enviarMensagemUi })
}

export function ligarBotoesPainelDireito() {
  const $id = (id) => document.getElementById(id)
  $id('btn-right-collapse')?.addEventListener('click', () => toggleRight())
  $id('bloco3-edge')?.addEventListener('click', () => toggleRight(true))
  $id('btn-right-expand')?.addEventListener('click', () => toggleRight(true))
  $id('btn-right-toggle')?.addEventListener('click', () => toggleRight())
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
}
