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

function lembrarChatAtivo(id) {
  try {
    if (id) localStorage.setItem('dg-chat-ativo', id)
  } catch {
    /* */
  }
}

function tempoRelativo(iso) {
  const t = Date.parse(String(iso || ''))
  if (!Number.isFinite(t)) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return Math.max(1, Math.floor(s)) + 's'
  if (s < 3600) return Math.floor(s / 60) + 'm'
  if (s < 86400) return Math.floor(s / 3600) + 'h'
  return Math.floor(s / 86400) + 'd'
}

export async function iniciarHistoricoChat(
  raiz,
  { onRender, onNova, chatIdPreferido, listarPastas, nomePasta, onTrocarPasta, onRemoverPasta }
) {
  raizChats = raiz || null
  const bar = document.getElementById('chat-history-bar')
  if (!bar) return
  const rotuloPasta = (p) => (typeof nomePasta === 'function' ? nomePasta(p) : String(p || '').split(/[/\\]/).pop() || p)

  function fecharMenusChat() {
    document.querySelectorAll('.agent-chat-menu').forEach((m) => {
      m.hidden = true
      m.style.top = ''
      m.style.left = ''
      m.style.right = ''
    })
    document.querySelectorAll('.agent-chat-more[aria-expanded="true"]').forEach((b) => {
      b.setAttribute('aria-expanded', 'false')
    })
  }

  function posicionarMenuChat(more, menu) {
    const r = more.getBoundingClientRect()
    const mw = Math.max(148, menu.offsetWidth || 148)
    const mh = Math.max(110, menu.offsetHeight || 110)
    let left = Math.min(r.right - mw, window.innerWidth - mw - 8)
    left = Math.max(8, left)
    let top = r.bottom + 4
    if (top + mh > window.innerHeight - 8) {
      top = Math.max(8, r.top - mh - 4)
    }
    menu.style.top = top + 'px'
    menu.style.left = left + 'px'
    menu.style.right = 'auto'
  }

  async function renomearChat(id, tituloAtual, raizOverride) {
    const raiz = raizOverride || raizChats
    if (!raiz || !id) return
    const novo = window.prompt('Novo nome da conversa:', tituloAtual || '')
    if (novo == null) return
    const titulo = String(novo).trim().slice(0, 120)
    if (!titulo) return
    try {
      const r = await window.api.invoke('chat:carregar', raiz, id)
      if (!r?.ok || !r.chat) return
      await window.api.invoke('chat:salvar', raiz, {
        id: r.chat.id,
        titulo,
        mensagens: Array.isArray(r.chat.mensagens) ? r.chat.mensagens : [],
        criadoEm: r.chat.criadoEm
      })
      await refrescarLista()
    } catch {
      /* */
    }
  }

  async function excluirChat(id, raizOverride) {
    const raiz = raizOverride || raizChats
    if (!raiz || !id) return
    const ok = window.dgConfirm
      ? await window.dgConfirm('Excluir esta conversa? Essa ação não pode ser desfeita.', 'Excluir conversa')
      : window.confirm('Excluir esta conversa? Essa ação não pode ser desfeita.')
    if (!ok) return
    try {
      await window.api.invoke('chat:apagar', raiz, id)
      if (chatAtivoId === id && raiz === raizChats) {
        chatAtivoId = novoId()
        mensagensLocais = []
        onNova?.()
        onRender?.([])
      }
      await refrescarLista()
    } catch {
      /* */
    }
  }

  async function duplicarChat(id, raizOverride) {
    const raiz = raizOverride || raizChats
    if (!raiz || !id) return
    try {
      const r = await window.api.invoke('chat:carregar', raiz, id)
      if (!r?.ok || !r.chat) return
      const nid = novoId()
      const tituloBase = (r.chat.titulo || 'Conversa').slice(0, 100)
      await window.api.invoke('chat:salvar', raiz, {
        id: nid,
        titulo: tituloBase + ' (cópia)',
        mensagens: Array.isArray(r.chat.mensagens) ? r.chat.mensagens : []
      })
      if (raiz === raizChats) await carregar(nid)
      else if (typeof onTrocarPasta === 'function') await onTrocarPasta(raiz, nid)
      else await refrescarLista()
    } catch {
      /* */
    }
  }

  function montarLinhaChat(c, pastaDoChat) {
    const cur = chatAtivoId
    const ativo = pastaDoChat === raizChats && c.id === cur
    const row = document.createElement('div')
    row.className = 'agent-chat-row' + (ativo ? ' active' : '')
    row.setAttribute('role', 'listitem')
    row.dataset.chatId = c.id
    row.dataset.raiz = pastaDoChat

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'agent-chat-item'
    btn.dataset.chatId = c.id
    btn.title = c.titulo || c.id
    const label = document.createElement('span')
    label.className = 'agent-chat-label'
    label.textContent = c.titulo || c.id
    const meta = document.createElement('span')
    meta.className = 'agent-chat-time'
    meta.textContent = tempoRelativo(c.atualizadoEm)
    btn.appendChild(label)
    if (meta.textContent) btn.appendChild(meta)
    btn.addEventListener('click', () => {
      fecharMenusChat()
      void (async () => {
        if (pastaDoChat !== raizChats && typeof onTrocarPasta === 'function') {
          await onTrocarPasta(pastaDoChat, c.id)
        } else {
          await carregar(c.id)
        }
        if (typeof window.dgUi?.focarPainelIa === 'function') window.dgUi.focarPainelIa('chat')
      })()
    })

    const more = document.createElement('button')
    more.type = 'button'
    more.className = 'agent-chat-more'
    more.title = 'Mais ações'
    more.setAttribute('aria-label', 'Mais ações da conversa')
    more.setAttribute('aria-haspopup', 'menu')
    more.setAttribute('aria-expanded', 'false')
    more.textContent = '⋮'

    const menu = document.createElement('div')
    menu.className = 'agent-chat-menu'
    menu.setAttribute('role', 'menu')
    menu.hidden = true
    menu.innerHTML =
      '<button type="button" role="menuitem" data-chat-act="rename">Renomear</button>' +
      '<button type="button" role="menuitem" data-chat-act="dup">Duplicar</button>' +
      '<button type="button" role="menuitem" data-chat-act="delete" class="danger">Excluir</button>'

    more.addEventListener('click', (e) => {
      e.stopPropagation()
      const aberto = !menu.hidden
      fecharMenusChat()
      if (!aberto) {
        menu.hidden = false
        more.setAttribute('aria-expanded', 'true')
        posicionarMenuChat(more, menu)
        requestAnimationFrame(() => posicionarMenuChat(more, menu))
      }
    })
    menu.addEventListener('click', (e) => {
      e.stopPropagation()
      const act = e.target?.closest?.('[data-chat-act]')?.getAttribute('data-chat-act')
      if (!act) return
      fecharMenusChat()
      if (act === 'rename') void renomearChat(c.id, c.titulo || '', pastaDoChat)
      else if (act === 'dup') void duplicarChat(c.id, pastaDoChat)
      else if (act === 'delete') void excluirChat(c.id, pastaDoChat)
    })

    row.appendChild(btn)
    row.appendChild(more)
    row.appendChild(menu)
    return row
  }

  function alvoListaRepos() {
    return (
      document.getElementById('folder-list') ||
      document.getElementById('agent-chats-list')
    )
  }

  function pintarListaSidebarAgrupada(grupos) {
    const side = alvoListaRepos()
    if (!side) return
    side.innerHTML = ''
    if (!grupos.length) {
      side.innerHTML =
        '<p class="agent-chats-empty">Nenhum repositório. Clique em + para adicionar.</p>'
      return
    }
    for (const g of grupos) {
      const group = document.createElement('div')
      group.className = 'agent-chat-group' + (g.pasta === raizChats ? ' active' : '')
      group.dataset.raiz = g.pasta

      const headRow = document.createElement('div')
      headRow.className = 'agent-chat-group-head-row'

      const head = document.createElement('button')
      head.type = 'button'
      head.className = 'agent-chat-group-head'
      head.title = g.pasta
      head.innerHTML =
        '<span class="agent-chat-folder-ico" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M3 7h6l2 2h10v10H3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>' +
        '</span><span class="agent-chat-group-name"></span>'
      head.querySelector('.agent-chat-group-name').textContent = rotuloPasta(g.pasta)
      head.addEventListener('click', () => {
        fecharMenusChat()
        if (typeof onTrocarPasta === 'function') void onTrocarPasta(g.pasta, null)
      })
      headRow.appendChild(head)

      if (typeof onRemoverPasta === 'function') {
        const rm = document.createElement('button')
        rm.type = 'button'
        rm.className = 'btn-icon pasta-remover agent-chat-repo-rm'
        rm.title = 'Remover repositório da lista'
        rm.setAttribute('aria-label', 'Remover repositório')
        rm.textContent = '×'
        rm.addEventListener('click', (e) => {
          e.stopPropagation()
          fecharMenusChat()
          void onRemoverPasta(g.pasta)
        })
        headRow.appendChild(rm)
      }
      group.appendChild(headRow)

      const body = document.createElement('div')
      body.className = 'agent-chat-group-body'
      const chats = Array.isArray(g.chats) ? g.chats : []
      if (!chats.length) {
        const vazio = document.createElement('p')
        vazio.className = 'agent-chats-empty agent-chats-empty-sm'
        vazio.textContent = 'Sem conversas'
        body.appendChild(vazio)
      } else {
        for (const c of chats) body.appendChild(montarLinhaChat(c, g.pasta))
      }
      group.appendChild(body)
      side.appendChild(group)
    }
  }

  async function refrescarLista() {
    const sel = document.getElementById('chat-history-select')
    if (!raizChats && !(typeof listarPastas === 'function')) return
    try {
      const pastas =
        typeof listarPastas === 'function'
          ? listarPastas().filter(Boolean)
          : raizChats
            ? [raizChats]
            : []
      const unicas = [...new Set(pastas)]
      if (raizChats && !unicas.includes(raizChats)) unicas.unshift(raizChats)

      const resultados = await Promise.all(
        unicas.map(async (pasta) => {
          try {
            const r = await window.api.invoke('chat:listar', pasta)
            return { pasta, chats: r?.ok && Array.isArray(r.chats) ? r.chats : [] }
          } catch {
            return { pasta, chats: [] }
          }
        })
      )

      const listaAtiva = resultados.find((g) => g.pasta === raizChats)?.chats || []
      const cur = chatAtivoId
      if (sel) {
        sel.innerHTML = ''
        const opt0 = document.createElement('option')
        opt0.value = ''
        opt0.textContent = listaAtiva.length ? '— chats —' : 'sem histórico'
        sel.appendChild(opt0)
        for (const c of listaAtiva) {
          const o = document.createElement('option')
          o.value = c.id
          o.textContent = c.titulo || c.id
          if (c.id === cur) o.selected = true
          sel.appendChild(o)
        }
      }
      pintarListaSidebarAgrupada(resultados)
    } catch {
      /* */
    }
  }

  async function carregar(id) {
    if (!raizChats || !id) return
    const r = await window.api.invoke('chat:carregar', raizChats, id)
    if (r?.ok && r.chat) {
      chatAtivoId = r.chat.id
      lembrarChatAtivo(chatAtivoId)
      mensagensLocais = Array.isArray(r.chat.mensagens) ? r.chat.mensagens : []
      onRender?.(mensagensLocais)
      await refrescarLista()
    }
  }

  async function flushSalvar() {
    if (!raizChats || !chatAtivoId) return
    clearTimeout(debounceTimer)
    debounceTimer = null
    try {
      await window.api.invoke('chat:salvar', raizChats, {
        id: chatAtivoId,
        titulo: tituloDeMensagens(mensagensLocais),
        mensagens: mensagensLocais
      })
      lembrarChatAtivo(chatAtivoId)
      await refrescarLista()
    } catch {
      /* */
    }
  }

  function agendarSave() {
    if (!raizChats || !chatAtivoId) return
    lembrarChatAtivo(chatAtivoId)
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      void flushSalvar()
    }, 400)
  }

  const selHist = document.getElementById('chat-history-select')
  if (selHist && !selHist.dataset.dgBound) {
    selHist.dataset.dgBound = '1'
    selHist.addEventListener('change', (e) => {
      const id = e.target.value
      if (id) void carregar(id)
    })
  }

  if (!document.documentElement.dataset.dgChatMenuClose) {
    document.documentElement.dataset.dgChatMenuClose = '1'
    document.addEventListener('click', () => fecharMenusChat())
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') fecharMenusChat()
    })
  }

  if (raizChats) {
    await refrescarLista()
    let preferido = chatIdPreferido
    if (!preferido) {
      try {
        preferido = localStorage.getItem('dg-chat-ativo') || ''
      } catch {
        preferido = ''
      }
    }
    if (preferido) {
      const r = await window.api.invoke('chat:carregar', raizChats, preferido)
      if (r?.ok && r.chat) {
        chatAtivoId = r.chat.id
        mensagensLocais = Array.isArray(r.chat.mensagens) ? r.chat.mensagens : []
        lembrarChatAtivo(chatAtivoId)
        onRender?.(mensagensLocais)
        await refrescarLista()
      }
    }
    if (!chatAtivoId) {
      chatAtivoId = novoId()
      lembrarChatAtivo(chatAtivoId)
    }
  }

  function nova() {
    chatAtivoId = novoId()
    lembrarChatAtivo(chatAtivoId)
    mensagensLocais = []
    onNova?.()
    onRender?.([])
    agendarSave()
  }

  if (!document.documentElement.dataset.dgChatFlush) {
    document.documentElement.dataset.dgChatFlush = '1'
    window.addEventListener('beforeunload', () => {
      void flushSalvar()
    })
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void flushSalvar()
    })
  }

  return {
    registrarMensagem(role, content, provider) {
      mensagensLocais.push({ role, content, provider, em: new Date().toISOString() })
      if (!chatAtivoId) chatAtivoId = novoId()
      lembrarChatAtivo(chatAtivoId)
      agendarSave()
    },
    /** Mantém só as primeiras `n` mensagens (reeditar prompt estilo Cursor). */
    truncarAte(n) {
      const k = Math.max(0, Number(n) || 0)
      mensagensLocais = mensagensLocais.slice(0, k)
      agendarSave()
    },
    refrescarLista,
    agendarSave,
    flushSalvar,
    carregar,
    nova,
    obterId: () => chatAtivoId
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
    '<div class="dg-loading-mark" aria-hidden="true"></div>' +
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

  if (opts.imediato) {
    el.remove()
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
