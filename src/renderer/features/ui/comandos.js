// Registro e execução de comandos (paleta/menubar/atalhos) + tema + a11y prefs.
import { state } from '../../state/app-state.js'
import { registrarComando, executarComandoLocal } from '../../comandos.js'
import { mostrarRegrasUI } from '../../regras-ui.js'
import { aplicarTema, alternarTema as _alternarTema, carregarTema as _carregarTema } from './tema.js'
import { abrirSobreDgEditor } from './sobre.js'
import {
  abrirPaletaArquivos,
  abrirBuscaGlobal,
  abrirPaletaComandos,
  fecharPaleta,
  fecharBuscaGlobal
} from './paleta.js'
import { escolherEscopoAnalise, analisarCompleta } from '../analise/acoes.js'
import {
  abrirContas,
  abrirConfig,
  copiarContinuidadeAdapta,
  copiarMcpAdapta
} from './config-contas.js'
import { abrirAssistenteNovo } from '../chat/assistente-novo.js'
import {
  toggleSidebar,
  toggleRight,
  abrirTerminalNoBloco3
} from '../layout/paineis.js'
import { focarPainelIa, ativarAbaDireita } from '../layout/panes.js'
import {
  ajustarZoomUi,
  lerPreferenciasA11y,
  salvarPreferenciasA11y,
  aplicarPreferenciasA11y
} from './acessibilidade.js'
import { abrirPasta } from '../arquivos/pastas-crud.js'
import { abrirVault, fecharVault } from '../arquivos/desktop-vault.js'
import { pastasPermitidas } from '../arquivos/index.js'
import { salvarArquivoAtivo, fecharAba, abrirArquivoNaAba } from '../editor/abas-core.js'
import { formatarDocumentoAtivo } from '../editor/abas-ui.js'
import { pedirOpenClawUi } from '../editor/diff-pendentes.js'
import { abrirOrientadorPrompt } from '../chat/historico-orientador.js'
import { renderizarChat } from '../chat/chat-core.js'
import { mostrarToast } from './toast.js'
import { anunciar } from './live-region.js'

const $ = (id) => document.getElementById(id)

let deps = {
  verificarEReiniciarDg: async () => {},
  rodarAutoAuditoria: async () => {},
  abrirNavegadorNoBloco3: () => {},
  getEditor: () => null
}

export function configurarComandos(d) {
  deps = { ...deps, ...d }
}

// ---------- Tema ----------
export async function alternarTema() {
  return _alternarTema(deps.getEditor())
}

export function trocarTemaEditor(_tema) {
  deps.getEditor()?.aplicarTema()
}

export function aplicarTemaLocal(tema) {
  return aplicarTema(tema, deps.getEditor())
}

export async function carregarTema() {
  return _carregarTema(deps.getEditor())
}

async function colarComoMarkdown() {
  try {
    const r = await window.api.invoke('clipboard:colar-markdown')
    if (!r?.ok) {
      mostrarToast(r?.erro || 'Área de transferência vazia', 'erro')
      return
    }
    const editorAtivo = $('center-pane-editor')?.classList.contains('active')
    const ed = deps.getEditor?.()
    if (editorAtivo && ed?.inserirTexto && state.abaAtiva) {
      ed.inserirTexto(r.markdown)
      mostrarToast('Markdown colado · ' + r.caracteres + ' caracteres', 'ok')
      anunciar('Conteúdo colado como Markdown no editor')
      return
    }
    const { abrirColarMarkdown } = await import('../../colar-markdown.js')
    abrirColarMarkdown(r.markdown, r.origem)
  } catch (e) {
    mostrarToast('Falha ao colar Markdown: ' + String(e), 'erro')
  }
}

export function bootstrapComandos() {
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
      fn: () => void deps.verificarEReiniciarDg()
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
      fn: () => deps.abrirNavegadorNoBloco3()
    },
    {
      id: 'estudio-midia',
      titulo: 'Estúdio de mídia',
      fn: () => window.dgEstudioMidia?.()
    },
    {
      id: 'gravar-tela',
      titulo: 'Gravar tela (janela ou monitor)',
      fn: () =>
        void import('../../gravador.js').then((m) =>
          m.abrirGravador({ raiz: state.pastaAtual || '' })
        )
    },
    {
      id: 'receber-lan',
      titulo: 'Receber arquivos do celular (LAN)',
      fn: () =>
        void import('../../compartilhar.js').then((m) =>
          m.abrirCompartilhamento({ raiz: state.pastaAtual || '' })
        )
    },
    {
      id: 'reversa',
      titulo: 'Engenharia reversa local',
      fn: () =>
        void import('../../reversa.js').then((m) =>
          m.abrirReversa({ raiz: state.pastaAtual || '' })
        )
    },
    {
      id: 'grafo-vault',
      titulo: 'Grafo do vault',
      fn: () =>
        void import('../../grafo-vault.js').then((m) =>
          m.abrirGrafoVault({
            abrirNota: (p) => void abrirArquivoNaAba(p)
          })
        )
    },
    {
      id: 'mapa-mental',
      titulo: 'Mapa mental',
      fn: () =>
        void import('../../mapa-mental.js').then((m) =>
          m.abrirMapaMental({ raiz: state.pastaAtual || '' })
        )
    },
    {
      id: 'colar-markdown',
      titulo: 'Colar como Markdown',
      atalho: 'Ctrl+Shift+V',
      fn: () => void colarComoMarkdown()
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
      fn: () => void deps.rodarAutoAuditoria()
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

export async function mostrarSobreDgEditor() {
  await abrirSobreDgEditor()
}

export function abrirAtalhosTeclado() {
  const m = $('modal-atalhos')
  if (!m) return
  fecharPaleta()
  fecharBuscaGlobal()
  m.classList.remove('hidden')
  requestAnimationFrame(() => m.querySelector('#btn-atalhos-fechar')?.focus())
}

export function fecharAtalhosTeclado() {
  $('modal-atalhos')?.classList.add('hidden')
}

export function atalhosTecladoAbertos() {
  return !!$('modal-atalhos') && !$('modal-atalhos').classList.contains('hidden')
}

export function ligarPreferenciasA11y() {
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
    deps.getEditor()?.aplicarTema?.()
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

export function acaoEditar(cmd) {
  try {
    document.execCommand(cmd)
  } catch (e) {
    console.warn('[menubar] editar:', cmd, e)
  }
}

export function executarComando(id) {
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
  else if (id === 'verificar-reiniciar') void deps.verificarEReiniciarDg()
  else if (id === 'orientar-prompt') abrirOrientadorPrompt()
  else if (id === 'navegador') {
    toggleRight(true)
    ativarAbaDireita('browser')
    void deps.abrirNavegadorNoBloco3()
  } else if (id === 'regras-projeto') {
    if (state.pastaAtual) void mostrarRegrasUI(state.pastaAtual)
  }
}

export function ligarComandosUi() {
  ligarPreferenciasA11y()
  // A escala altera o zoom nativo do webContents; re-mede editor e terminal
  // para evitar medições antigas (sem aplicar o fator duas vezes).
  window.addEventListener('dg:escala-ui', () => {
    deps.getEditor()?.requestMeasure?.()
    requestAnimationFrame(() => {
      deps.getEditor()?.requestMeasure?.()
      window.dgTerminal?.fit?.()
    })
  })
  // Fonte/tamanho por painel: editor usa CSS var (re-medir), terminal ajusta xterm.
  window.addEventListener('dg:fonte-painel', (ev) => {
    const d = ev && ev.detail ? ev.detail : {}
    deps.getEditor()?.requestMeasure?.()
    requestAnimationFrame(() => {
      deps.getEditor()?.requestMeasure?.()
      window.dgTerminal?.aplicarFonte?.(d.terminal)
    })
  })
}
