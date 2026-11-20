// Estado de loading do chat (bolha "Pensando…", rotação de texto, barra de progresso).
// Extraido de chat.js — modulo autocontido, so DOM + timers.

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
