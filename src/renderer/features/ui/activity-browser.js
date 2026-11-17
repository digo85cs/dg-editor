// Activity bar, abas do centro/direita e todo o wiring do navegador Bloco 3.
import { criarBrowserBloco3 } from '../layout/browser-bloco3.js'
import {
  toggleSidebar,
  toggleRight,
  setActivityActive
} from '../layout/paineis.js'
import {
  ativarAbaDireita,
  ativarPainelCentro,
  focarPainelIa
} from '../layout/panes.js'
import { abrirPaletaArquivos } from './paleta.js'
import { alternarTema } from './comandos.js'
import { atualizarDownloadUi } from './download-status.js'
import { mostrarToast } from './toast.js'

const $ = (id) => document.getElementById(id)

/** Navegador Bloco 3 — módulo dedicado (bounds/status/IPC). */
export const browserBloco3 = criarBrowserBloco3({
  $,
  toggleRight: (f) => toggleRight(f),
  ativarAbaDireita: (p) => ativarAbaDireita(p)
})
let browserMountObserver = null
export const setBrowserStatus = (aberto) => browserBloco3.setStatus(aberto)
export const enviarBoundsBrowser = () => browserBloco3.enviarBounds()
export const setBrowserVisivel = (mostrar) => browserBloco3.setVisivel(mostrar)
export const abrirNavegadorUi = (url) => browserBloco3.abrir(url)
export const abrirNavegadorNoBloco3 = (url) => browserBloco3.abrirNoBloco3(url)

export function initActivityBar() {
  document.querySelectorAll('#activity-bar .ab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.action
      if (a === 'explorer') {
        toggleSidebar()
        setActivityActive('explorer', !$('app').classList.contains('sidebar-collapsed'))
      } else if (a === 'busca') {
        abrirPaletaArquivos()
      } else if (a === 'chat') {
        focarPainelIa('chat')
      } else if (a === 'tema') {
        void alternarTema()
      }
    })
  })
  // Tema também no rodapé da sidebar (statusbar)
  $('btn-tema')?.addEventListener('click', () => void alternarTema())
}

export function ligarNavegadorBloco3() {
  $('browser-abrir')?.addEventListener('click', () => {
    toggleRight(true)
    ativarAbaDireita('browser')
    const url = /** @type {HTMLInputElement|null} */ ($('browser-url'))?.value
    void abrirNavegadorUi(url)
  })
  $('browser-abrir-inline')?.addEventListener('click', () => {
    const url = /** @type {HTMLInputElement|null} */ ($('browser-url'))?.value
    void abrirNavegadorUi(url || undefined)
  })
  $('browser-url')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      $('browser-abrir')?.click()
    }
  })
  $('browser-atualizar')?.addEventListener('click', async () => {
    try {
      const r = await window.api.invoke('navegador:recarregar')
      if (r?.ok) return
    } catch {
      /* fallback abrir */
    }
    const url = /** @type {HTMLInputElement|null} */ ($('browser-url'))?.value
    void abrirNavegadorUi(url || undefined)
  })
  $('browser-voltar')?.addEventListener('click', async () => {
    try {
      await window.api.invoke('navegador:voltar')
    } catch {
      /* canal opcional */
    }
  })
  try {
    window.api.on?.('navegador:aberto', () => {
      setBrowserStatus(true)
      setBrowserVisivel($('pane-browser')?.classList.contains('active'))
    })
    window.api.on?.('navegador:fechado', () => {
      setBrowserStatus(false)
      setBrowserVisivel(false)
    })
    window.api.on?.('navegador:download', (_e, info) => {
      const i = info && typeof info === 'object' ? info : {}
      if (i.ok) mostrarToast('Download salvo: ' + (i.nomeSalvo || 'arquivo'), 'ok')
      else mostrarToast('Download falhou: ' + (i.estado || 'erro'), 'erro')
    })
    window.api.on?.('navegador:download-progresso', (_e, p) => {
      atualizarDownloadUi(p)
    })
  } catch {
    /* preload antigo */
  }

  window.addEventListener('resize', () => {
    if ($('pane-browser')?.classList.contains('active') && browserBloco3.isAberto()) {
      enviarBoundsBrowser()
    }
  })
  const m = $('browser-mount')
  if (m && typeof ResizeObserver !== 'undefined') {
    browserMountObserver = new ResizeObserver(() => {
      if ($('pane-browser')?.classList.contains('active') && browserBloco3.isAberto()) {
        enviarBoundsBrowser()
      }
    })
    browserMountObserver.observe(m)
  }
}

export function ligarAbasPaineis() {
  document.querySelectorAll('.right-tab').forEach((t) => {
    t.addEventListener('click', () => ativarAbaDireita(t.dataset.pane))
  })
  document.querySelectorAll('.center-tab').forEach((t) => {
    t.addEventListener('click', () => {
      ativarPainelCentro(t.dataset.center === 'editor' ? 'editor' : 'chat')
      if (t.dataset.center === 'chat') setTimeout(() => $('chat-input')?.focus(), 0)
    })
  })
}
