/**
 * Navegador embutido no Bloco 3 — bounds, status e abertura via IPC.
 */

/**
 * @typedef {object} BrowserBloco3Api
 * @property {() => boolean} isAberto
 * @property {(aberto: boolean) => void} setStatus
 * @property {() => void} enviarBounds
 * @property {(mostrar: boolean) => void} setVisivel
 * @property {(url?: string) => Promise<void>} abrir
 * @property {() => void} abrirNoBloco3
 */

/**
 * @param {{
 *   $: (id: string) => HTMLElement | null
 *   toggleRight: (forcar?: boolean) => void
 *   ativarAbaDireita: (pane: string) => void
 * }} deps
 * @returns {BrowserBloco3Api}
 */
export function criarBrowserBloco3(deps) {
  let browserAberto = false
  const $ = deps.$

  function setStatus(aberto) {
    browserAberto = !!aberto
    const st = $('browser-status')
    const overlay = $('browser-overlay')
    if (st) {
      st.textContent = aberto ? 'Navegador ativo nesta aba.' : 'Navegador fechado.'
    }
    if (overlay) overlay.classList.toggle('hidden', !!aberto)
  }

  function enviarBounds() {
    const m = $('browser-mount')
    const pane = $('pane-browser')
    if (!m || !pane || !pane.classList.contains('active')) return
    const r = m.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return
    try {
      window.api.send('navegador:bounds', {
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height)
      })
    } catch (e) {
      console.warn('[navegador] bounds', e)
    }
  }

  function setVisivel(mostrar) {
    try {
      window.api.send('navegador:mostrar', !!mostrar)
    } catch {
      /* preload antigo */
    }
    if (mostrar) {
      requestAnimationFrame(() => {
        enviarBounds()
        requestAnimationFrame(enviarBounds)
      })
    }
  }

  async function abrir(url) {
    try {
      const u = typeof url === 'string' && url.trim() ? url.trim() : undefined
      await window.api.invoke('navegador:abrir', u)
      setStatus(true)
      setVisivel(true)
      enviarBounds()
    } catch (e) {
      console.warn('[navegador]', e)
      setStatus(false)
      setVisivel(false)
    }
  }

  function abrirNoBloco3(url) {
    deps.toggleRight(true)
    deps.ativarAbaDireita('browser')
    void abrir(url)
  }

  return {
    isAberto: () => browserAberto,
    setStatus,
    enviarBounds,
    setVisivel,
    abrir,
    abrirNoBloco3
  }
}
