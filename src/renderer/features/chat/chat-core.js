import { state } from '../../state/app-state.js'
import { escapar } from '../../utils/dom.js'
import { animarEntradaMsg, removerLoadingChat } from '../../chat.js'
import { anunciar } from '../ui/live-region.js'
import { mostrarToast } from '../ui/toast.js'
import { recontarUsoChat } from './uso.js'
import { normalizarMensagensChat, bolhaHtml, organizarRespostaCursor } from './render.js'
import { ligarAcoesBolha as _ligarAcoesBolha, reeditarMensagemUsuario as _reeditarMensagemUsuario } from './reeditar.js'
import { humanizarStatus, atualizarCartaoTrabalho, fecharCartaoTrabalho } from './progresso-humano.js'
import { ocultarBannerAgentMode } from './agent-activity.js'
import { limparChatParityCards } from './chat-parity.js'

const $ = (id) => document.getElementById(id)

let deps = {
  resolverPastaChatAtiva: () => null,
  nomeArquivo: (p) => p,
  abrirPasta: () => {},
  focarPainelIa: () => {},
  ativarPainelCentro: () => {},
  enviarMensagemUi: () => {},
  appendAgentTraceLive: () => {}
}

export function configurarChatCore(d) {
  deps = { ...deps, ...d }
}

const SUGESTOES_CHAT = [
  'Explique a arquitetura deste projeto',
  'Onde fica o ponto de entrada?',
  'Sugira melhorias de UI e UX',
  'Liste riscos e pontos de atenção'
]

let chatEmAndamento = false
/** Histórico de conversas do chat (definido por ligarHistoricoChat no app.js). */
let histChat = null

export function chatOcupado() {
  return chatEmAndamento
}

export function obterHistChat() {
  return histChat
}

export function definirHistChat(h) {
  histChat = h
}

export function markupEmptyStateChat() {
  const raiz = deps.resolverPastaChatAtiva()
  if (!raiz) {
    return (
      '<div class="empty-state" id="empty-state">' +
      '<h2>Vamos começar</h2>' +
      '<p>Abra um repositório para o agente ler o código, analisar e executar tarefas.</p>' +
      '<button id="btn-empty-open" class="btn-primary">Adicionar repositório</button>' +
      '</div>'
    )
  }
  const nome = deps.nomeArquivo(raiz)
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

export function ligarEmptyStateChat() {
  const empty = $('empty-state')
  if (!empty) return
  $('btn-empty-open')?.addEventListener('click', deps.abrirPasta)
  empty.querySelectorAll('[data-sugestao]').forEach((b) => {
    b.addEventListener('click', () => {
      const texto = b.getAttribute('data-sugestao') || ''
      const input = /** @type {HTMLTextAreaElement|null} */ ($('chat-input'))
      if (input) {
        input.value = texto
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
      deps.focarPainelIa('chat')
      deps.enviarMensagemUi()
    })
  })
}

export function garantirEmptyStateChat() {
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

const JANELA_CHAT_INICIAL = 40
const JANELA_CHAT_LOTE = 40
let observerChatTopo = null

function criarBolhaElemento(role, content, provider) {
  const div = document.createElement('div')
  const texto =
    role === 'assistant' ? organizarRespostaCursor(content) : String(content ?? '')
  const b = bolhaHtml(role, texto, provider)
  div.className = b.cls
  div.innerHTML = b.html
  ligarAcoesBolha(div, role, content)
  return div
}

export function renderizarChat(msgs) {
  const area = $('chat-messages')
  if (observerChatTopo) {
    observerChatTopo.disconnect()
    observerChatTopo = null
  }
  area.innerHTML = ''
  const lista = normalizarMensagensChat(msgs)
  recontarUsoChat(lista)
  if (!lista.length) {
    area.classList.remove('has-msgs')
    area.innerHTML = markupEmptyStateChat()
    ligarEmptyStateChat()
    return
  }

  let cursorInicio = Math.max(0, lista.length - JANELA_CHAT_INICIAL)
  const frag = document.createDocumentFragment()

  /** Botão/sentinela no topo para carregar mensagens antigas sob demanda (mantém DOM leve). */
  let btnAntigas = null
  const carregarMaisAntigas = () => {
    if (cursorInicio <= 0 || !btnAntigas) return
    const novoInicio = Math.max(0, cursorInicio - JANELA_CHAT_LOTE)
    const lote = lista.slice(novoInicio, cursorInicio)
    cursorInicio = novoInicio
    const alturaAntes = area.scrollHeight
    const scrollAntes = area.scrollTop
    const loteFrag = document.createDocumentFragment()
    for (const m of lote) loteFrag.appendChild(criarBolhaElemento(m.role, m.content, m.provider))
    btnAntigas.after(loteFrag)
    const delta = area.scrollHeight - alturaAntes
    area.scrollTop = scrollAntes + delta
    if (cursorInicio <= 0) {
      if (observerChatTopo) { observerChatTopo.disconnect(); observerChatTopo = null }
      btnAntigas.remove()
      btnAntigas = null
    } else {
      btnAntigas.textContent = `Carregar mensagens anteriores (${cursorInicio} restante${cursorInicio > 1 ? 's' : ''})`
    }
  }

  if (cursorInicio > 0) {
    btnAntigas = document.createElement('button')
    btnAntigas.type = 'button'
    btnAntigas.className = 'chat-load-older'
    btnAntigas.textContent = `Carregar mensagens anteriores (${cursorInicio} restante${cursorInicio > 1 ? 's' : ''})`
    btnAntigas.addEventListener('click', carregarMaisAntigas)
    frag.appendChild(btnAntigas)
  }

  for (let i = cursorInicio; i < lista.length; i++) {
    const m = lista[i]
    frag.appendChild(criarBolhaElemento(m.role, m.content, m.provider))
  }
  area.appendChild(frag)
  marcarChatComMsgs()
  area.scrollTop = area.scrollHeight

  if (btnAntigas && typeof IntersectionObserver === 'function') {
    observerChatTopo = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && area.scrollTop < 80) {
          carregarMaisAntigas()
        }
      },
      { root: area, threshold: 0.1 }
    )
    observerChatTopo.observe(btnAntigas)
  }
}

export function marcarChatComMsgs() {
  const area = $('chat-messages')
  if (!area) return
  const tem = !!area.querySelector('.msg, .bolha, .message, .chat-tool-trace, .dg-loading-bubble, .chat-work-card')
  area.classList.toggle('has-msgs', tem)
  if (tem) $('empty-state')?.classList.add('hidden')
}

export function setChatLiveStatus(texto) {
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
    ativarChat: () => deps.ativarPainelCentro('chat'),
    marcarMsgs: () => marcarChatComMsgs(),
    toast: (msg, tipo) => mostrarToast(msg, tipo)
  }
}

export function ligarAcoesBolha(div, role, content) {
  _ligarAcoesBolha(div, role, content, ctxReeditarChat())
}

export async function reeditarMensagemUsuario(div) {
  await _reeditarMensagemUsuario(div, ctxReeditarChat())
}

export function adicionarBolha(role, content, provider) {
  const area = $('chat-messages')
  const div = criarBolhaElemento(role, content, provider)
  area.appendChild(div)
  marcarChatComMsgs()
  animarEntradaMsg(div, role)
  area.scrollTop = area.scrollHeight
  return div
}

export function setChatSendMode(mode) {
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

export function limparUiAgenteChat(opts = {}) {
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

export async function pararChatOuAgente() {
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

export function appendChatToolTrace(line, opts = {}) {
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
  deps.appendAgentTraceLive(humano)
  setChatLiveStatus(humano)
}
