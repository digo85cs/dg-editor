/**
 * Foco acessível: Tab/Shift+Tab circula dentro do overlay aberto e o foco
 * volta ao elemento anterior quando ele fecha. Só o overlay do topo responde,
 * então diálogos sobre modais não disputam o teclado.
 */

const SELETOR_FOCAVEL = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]'
].join(',')

const SELETOR_OVERLAY = '.modal:not(.hidden), .dg-dialog-overlay'

export function listarFocaveis(raiz) {
  if (!raiz) return []
  return Array.from(raiz.querySelectorAll(SELETOR_FOCAVEL)).filter((el) => {
    if (el.closest('[hidden]')) return false
    if (el.getAttribute('aria-hidden') === 'true') return false
    return el.getClientRects().length > 0
  })
}

function overlayDoTopo() {
  const abertos = Array.from(document.querySelectorAll(SELETOR_OVERLAY))
  return abertos[abertos.length - 1] || null
}

/**
 * @param {HTMLElement} raiz
 * @param {{ anterior?: HTMLElement | null }} [opcoes]
 */
export function criarFocusTrap(raiz, opcoes = {}) {
  const anterior = opcoes.anterior ?? document.activeElement
  let ativo = true

  const fotoDoFoco = () => listarFocaveis(raiz)

  const focar = () => {
    if (!ativo || raiz.contains(document.activeElement)) return
    const campos = fotoDoFoco().filter((el) => /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
    const alvo = raiz.querySelector('[data-autofocus]') || campos[0] || fotoDoFoco()[0] || raiz
    try {
      alvo.focus()
    } catch {
      /* elemento sumiu */
    }
  }

  const onKey = (e) => {
    if (!ativo || e.key !== 'Tab') return
    if (overlayDoTopo() !== raiz) return
    const focaveis = fotoDoFoco()
    if (!focaveis.length) {
      e.preventDefault()
      if (!raiz.hasAttribute('tabindex')) raiz.setAttribute('tabindex', '-1')
      try {
        raiz.focus()
      } catch {
        /* */
      }
      return
    }
    const primeiro = focaveis[0]
    const ultimo = focaveis[focaveis.length - 1]
    const atual = document.activeElement
    if (!raiz.contains(atual)) {
      e.preventDefault()
      try {
        primeiro.focus()
      } catch {
        /* */
      }
      return
    }
    if (e.shiftKey && (atual === primeiro || atual === raiz)) {
      e.preventDefault()
      ultimo.focus()
    } else if (!e.shiftKey && atual === ultimo) {
      e.preventDefault()
      primeiro.focus()
    }
  }

  document.addEventListener('keydown', onKey, true)
  return {
    focar,
    destroy() {
      if (!ativo) return
      ativo = false
      document.removeEventListener('keydown', onKey, true)
      if (anterior && typeof anterior.focus === 'function' && document.contains(anterior)) {
        try {
          anterior.focus()
        } catch {
          /* */
        }
      }
    },
    get ativo() {
      return ativo
    }
  }
}

/**
 * Observa os `.modal` da página e instala/remove o trap conforme ficam visíveis.
 * @param {{ seletor?: string }} [opcoes]
 */
export function instalarTrapFocoModais(opcoes = {}) {
  const seletor = opcoes.seletor || '.modal'
  const visivel = (el) => !el.classList.contains('hidden') && el.getAttribute('aria-hidden') !== 'true'
  let trap = null
  let elAtual = null
  let focoExterno = null

  document.addEventListener(
    'focusin',
    (e) => {
      const alvo = e.target
      if (!(alvo instanceof Element)) return
      const aberto = overlayDoTopo()
      if (!aberto || !aberto.contains(alvo)) focoExterno = alvo
    },
    true
  )

  const sincronizar = () => {
    const abertos = Array.from(document.querySelectorAll(seletor)).filter(visivel)
    const alvo = abertos[abertos.length - 1] || null
    if (alvo === elAtual) return
    trap?.destroy()
    const dentro = alvo && document.activeElement instanceof Element && alvo.contains(document.activeElement)
    trap = alvo ? criarFocusTrap(alvo, { anterior: dentro ? focoExterno : document.activeElement }) : null
    elAtual = alvo
    if (trap) requestAnimationFrame(() => trap?.focar())
  }

  const relevante = (m) => {
    if (m.type === 'attributes') return m.target instanceof Element && m.target.matches(seletor)
    return [...m.addedNodes, ...m.removedNodes].some(
      (n) => n instanceof Element && (n.matches(seletor) || !!n.querySelector?.(seletor))
    )
  }

  const mo = new MutationObserver((mutacoes) => {
    if (mutacoes.some(relevante)) sincronizar()
  })
  mo.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'aria-hidden']
  })
  sincronizar()
  return {
    sincronizar,
    destroy() {
      mo.disconnect()
      trap?.destroy()
      trap = null
      elAtual = null
    }
  }
}
