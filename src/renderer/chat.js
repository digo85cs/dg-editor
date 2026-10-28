/**
 * UI de histórico de chats (Nova conversa + dropdown + autosave).
 */
let chatAtivoId = null
let mensagensLocais = []
let debounceTimer = null
let raizChats = null

function tituloDeMensagens(msgs) {
  const primeira = (msgs || []).find((m) => m.role === 'user' && m.content)
  const raw = String(primeira?.content || 'Nova conversa').replace(/\s+/g, ' ').trim()
  return raw.slice(0, 40) || 'Nova conversa'
}

function novoId() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function obterMensagensChat() {
  return mensagensLocais.slice()
}

export function definirMensagensChat(msgs) {
  mensagensLocais = Array.isArray(msgs) ? msgs.slice() : []
}

export function obterChatAtivoId() {
  return chatAtivoId
}

export async function iniciarHistoricoChat(raiz, { onRender, onNova }) {
  raizChats = raiz || null
  const bar = document.getElementById('chat-history-bar')
  if (!bar) return

  async function refrescarLista() {
    const sel = document.getElementById('chat-history-select')
    if (!sel || !raizChats) return
    try {
      const r = await window.api.invoke('chat:listar', raizChats)
      const lista = r?.ok && Array.isArray(r.chats) ? r.chats : []
      const cur = chatAtivoId
      sel.innerHTML = ''
      const opt0 = document.createElement('option')
      opt0.value = ''
      opt0.textContent = lista.length ? '— chats —' : 'sem histórico'
      sel.appendChild(opt0)
      for (const c of lista) {
        const o = document.createElement('option')
        o.value = c.id
        o.textContent = c.titulo || c.id
        if (c.id === cur) o.selected = true
        sel.appendChild(o)
      }
    } catch {
      /* */
    }
  }

  async function carregar(id) {
    if (!raizChats || !id) return
    const r = await window.api.invoke('chat:carregar', raizChats, id)
    if (r?.ok && r.chat) {
      chatAtivoId = r.chat.id
      mensagensLocais = Array.isArray(r.chat.mensagens) ? r.chat.mensagens : []
      onRender?.(mensagensLocais)
      await refrescarLista()
    }
  }

  function agendarSave() {
    if (!raizChats || !chatAtivoId) return
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(async () => {
      try {
        await window.api.invoke('chat:salvar', raizChats, {
          id: chatAtivoId,
          titulo: tituloDeMensagens(mensagensLocais),
          mensagens: mensagensLocais
        })
        await refrescarLista()
      } catch {
        /* */
      }
    }, 500)
  }

  document.getElementById('btn-chat-nova')?.addEventListener('click', () => {
    chatAtivoId = novoId()
    mensagensLocais = []
    onNova?.()
    onRender?.([])
    agendarSave()
  })

  document.getElementById('chat-history-select')?.addEventListener('change', (e) => {
    const id = e.target.value
    if (id) void carregar(id)
  })

  if (raizChats) {
    await refrescarLista()
    if (!chatAtivoId) {
      chatAtivoId = novoId()
    }
  }

  return {
    registrarMensagem(role, content, provider) {
      mensagensLocais.push({ role, content, provider, em: new Date().toISOString() })
      if (!chatAtivoId) chatAtivoId = novoId()
      agendarSave()
    },
    refrescarLista,
    agendarSave
  }
}
