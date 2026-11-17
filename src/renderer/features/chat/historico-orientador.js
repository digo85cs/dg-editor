// Histórico de conversas do chat + modal de aprimoramento de prompt.
import { state } from '../../state/app-state.js'
import { mostrarToast } from '../ui/toast.js'
import { agendarSalvarWorkspace } from '../../workspace-ui.js'
import { iniciarHistoricoChat } from '../../chat.js'
import { obterHistChat, definirHistChat, renderizarChat } from './chat-core.js'
import { ativarPainelCentro, ativarAbaCentro } from '../layout/panes.js'

const $ = (id) => document.getElementById(id)

let deps = {
  sincronizarContextoPasta: async () => {},
  removerPasta: async () => {},
  nomePastaUi: (p) => p
}

export function configurarHistoricoOrientador(d) {
  deps = { ...deps, ...d }
}

export async function ligarHistoricoChat(raiz) {
  let preferido = ''
  try {
    preferido = localStorage.getItem('dg-chat-ativo') || ''
  } catch {
    preferido = ''
  }
  definirHistChat(await iniciarHistoricoChat(raiz, {
    chatIdPreferido: preferido,
    listarPastas: () => (state.pastasRecentes || []).slice(),
    nomePasta: (p) => deps.nomePastaUi(p),
    onRemoverPasta: (pasta) => deps.removerPasta(pasta),
    onTrocarPasta: async (pasta, chatId) => {
      if (chatId) {
        try {
          localStorage.setItem('dg-chat-ativo', chatId)
        } catch {
          /* */
        }
      }
      if (pasta && pasta !== state.pastaAtual) {
        await deps.sincronizarContextoPasta(pasta, { chatId, forceAnalise: true })
        ativarAbaCentro('chat')
        return
      }
      const hist = obterHistChat()
      if (chatId && hist?.carregar) await hist.carregar(chatId)
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
  }))
  agendarSalvarWorkspace()
}

/** Nova conversa: limpa UI e reseta estado do histórico (chat.js). */
export function novaConversaUi() {
  ativarPainelCentro('chat')
  const hist = obterHistChat()
  if (hist && typeof hist.nova === 'function') {
    hist.nova()
    return
  }
  $('empty-state')?.classList.add('hidden')
  renderizarChat([])
}

export function abrirOrientadorPrompt() {
  const modal = $('modal-prompt-orientador')
  const input = $('prompt-orientador-input')
  const output = $('prompt-orientador-output')
  if (!modal || !input || !output) return
  input.value = $('chat-input')?.value?.trim() || ''
  output.value = ''
  modal.classList.remove('hidden')
  setTimeout(() => input.focus(), 0)
}

export function fecharOrientadorPrompt(restaurarFoco = true) {
  const modal = $('modal-prompt-orientador')
  if (modal) modal.classList.add('hidden')
  if (restaurarFoco) $('btn-prompt-orientador')?.focus()
}

export async function melhorarPromptLocal() {
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

export function usarPromptNoChat() {
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

export async function copiarPromptOrientador() {
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

export function ligarPainelOrientador() {
  $('btn-prompt-melhorar')?.addEventListener('click', () => void melhorarPromptLocal())
  $('btn-prompt-usar')?.addEventListener('click', () => usarPromptNoChat())
  $('btn-prompt-copiar')?.addEventListener('click', () => void copiarPromptOrientador())
}
