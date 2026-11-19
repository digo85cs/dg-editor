import { anunciar } from '../ui/live-region.js'
import { toggleRight, setActivityActive } from './paineis.js'
import { initChatAgentSelector, carregarAgentesUi } from '../chat/agente-seletor.js'

const $ = (id) => document.getElementById(id)

let deps = {
  browserBloco3: { isAberto: () => false },
  setBrowserVisivel: () => {},
  abrirNavegadorUi: () => {},
  garantirTerminal: async () => {},
  getFilesListaSuja: () => false,
  setFilesListaSuja: () => {},
  renderizarArvoreEm: () => {}
}

export function configurarPanes(d) {
  deps = { ...deps, ...d }
}

/** Alterna Chat | Editor no bloco central (estilo Cursor Agent). */
export function ativarPainelCentro(pane) {
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

export function focarPainelIa(pane) {
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
export function focarRegiao(id, rotulo) {
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

export function ativarAbaDireita(pane) {
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
  if (p === 'auto') {
    void import('../ui/painel-auto.js').then((m) => m.carregarPainelAuto()).catch(() => {})
  }
  if (p === 'browser') {
    if (deps.browserBloco3.isAberto()) deps.setBrowserVisivel(true)
    else {
      // Aba do navegador ativa = navegador pronto para uso (about:blank se nao houver URL).
      const url = /** @type {HTMLInputElement|null} */ ($('browser-url'))?.value
      void deps.abrirNavegadorUi(url || undefined)
    }
  } else if (eraBrowser || p !== 'browser') {
    deps.setBrowserVisivel(false)
  }
  if (p === 'terminal') {
    void deps.garantirTerminal().then(() => {
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
  } else if (p === 'files' && deps.getFilesListaSuja()) {
    deps.setFilesListaSuja(false)
    void deps.renderizarArvoreEm($('files-list'))
  }
}
export function ativarAbaCentro(pane) {
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
