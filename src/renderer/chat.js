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

  function nova() {
    chatAtivoId = novoId()
    mensagensLocais = []
    onNova?.()
    onRender?.([])
    agendarSave()
  }

  return {
    registrarMensagem(role, content, provider) {
      mensagensLocais.push({ role, content, provider, em: new Date().toISOString() })
      if (!chatAtivoId) chatAtivoId = novoId()
      agendarSave()
    },
    refrescarLista,
    agendarSave,
    nova
  }
}

/* ---------- Animações de estado (PRE-A) ---------- */

const LOADING_TEXTOS = [
  'Pensando…',
  'Analisando contexto…',
  'Preparando resposta…',
  'Verificando modelos…'
]

let loadingAtivo = null
let loadingRotTimer = null
let progressTimer = null
let progressEl = null

function chatArea() {
  return document.getElementById('chat-messages')
}

function badgeProvider() {
  return document.getElementById('chat-provider')
}

function chatPanel() {
  return document.getElementById('chat-panel') || document.getElementById('pane-chat')
}

/** Deduplica: no máximo 1 bloco de loading. */
export function mostrarLoadingChat() {
  const area = chatArea()
  if (!area) return null
  if (loadingAtivo && document.body.contains(loadingAtivo)) {
    return loadingAtivo
  }
  limparLoadingOrfao()

  const id = 'load-' + Date.now().toString(36)
  const el = document.createElement('div')
  el.className = 'dg-loading-bubble'
  el.dataset.loadingId = id
  el.setAttribute('aria-live', 'polite')
  el.setAttribute('aria-atomic', 'true')
  el.setAttribute('aria-label', 'DG está processando')
  el.innerHTML =
    '<div class="dg-dots" aria-hidden="true"><span></span><span></span><span></span></div>' +
    '<span class="dg-loading-text" aria-hidden="true">Pensando…</span>' +
    '<span class="dg-loading-rotativo" aria-hidden="true"></span>'

  area.appendChild(el)
  area.scrollTop = area.scrollHeight
  loadingAtivo = el

  let idx = 0
  const textoEl = el.querySelector('.dg-loading-text')
  clearInterval(loadingRotTimer)
  loadingRotTimer = setInterval(() => {
    idx = (idx + 1) % LOADING_TEXTOS.length
    // Rotação só visual (aria-hidden) — aria-live do container NÃO reanuncia
    if (textoEl) textoEl.textContent = LOADING_TEXTOS[idx]
  }, 4000)

  badgeProvider()?.classList.add('dg-provider--thinking')

  clearTimeout(progressTimer)
  progressTimer = setTimeout(() => {
    if (!loadingAtivo || !document.body.contains(loadingAtivo)) return
    const host = chatPanel()
    if (!host || progressEl) return
    progressEl = document.createElement('div')
    progressEl.className = 'dg-chat-progress'
    progressEl.setAttribute('aria-hidden', 'true')
    host.prepend(progressEl)
  }, 1500)

  return el
}

function limparLoadingOrfao() {
  document.querySelectorAll('.dg-loading-bubble').forEach((n) => n.remove())
  loadingAtivo = null
}

/**
 * Remove loading com fade. Se falhou, mostra mensagem antes do fade.
 * @param {{ erro?: boolean }} opts
 */
export function removerLoadingChat(opts = {}) {
  clearInterval(loadingRotTimer)
  loadingRotTimer = null
  clearTimeout(progressTimer)
  progressTimer = null
  if (progressEl) {
    progressEl.remove()
    progressEl = null
  }
  badgeProvider()?.classList.remove('dg-provider--thinking')

  const el = loadingAtivo
  loadingAtivo = null
  if (!el || !document.body.contains(el)) {
    limparLoadingOrfao()
    return Promise.resolve()
  }

  if (opts.erro) {
    const t = el.querySelector('.dg-loading-text')
    if (t) t.textContent = 'Não consegui responder.'
    el.setAttribute('aria-label', 'Não consegui responder.')
  }

  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      el.remove()
      resolve()
    }
    el.classList.add('dg-loading-bubble--out')
    el.addEventListener('transitionend', finish, { once: true })
    setTimeout(finish, 280)
  })
}

export function marcarProviderFallback() {
  const b = badgeProvider()
  if (!b) return
  b.classList.add('dg-provider--fallback')
  setTimeout(() => b.classList.remove('dg-provider--fallback'), 3000)
}

export function animarEntradaMsg(el, role) {
  if (!el) return
  el.classList.add(role === 'user' ? 'dg-msg-enter-user' : 'dg-msg-enter-assistant')
}
