// Atalhos globais de teclado (captura): ajuda, zoom, foco de regiões, terminal, navegador.
import {
  abrirAtalhosTeclado,
  fecharAtalhosTeclado,
  atalhosTecladoAbertos
} from './comandos.js'
import { ajustarZoomUi, ajustarFontePainelUi } from './acessibilidade.js'
import { focarRegiao, focarPainelIa } from '../layout/panes.js'
import { alternarTerminalNoBloco3 } from '../layout/paineis.js'
import { desktopPermitido, pedirPermissaoDesktop } from '../arquivos/desktop-vault.js'
import { abrirNavegadorNoBloco3 } from './activity-browser.js'

export function ligarAtalhosTeclado() {
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && atalhosTecladoAbertos()) {
        e.preventDefault()
        fecharAtalhosTeclado()
        return
      }
      const alvoTecla = e.target
      const digitando =
        alvoTecla instanceof HTMLElement &&
        (alvoTecla.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvoTecla.tagName))
      const naArvore = alvoTecla instanceof HTMLElement && !!alvoTecla.closest?.('#files-list')
      if (!digitando && !naArvore && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === '?') {
        e.preventDefault()
        abrirAtalhosTeclado()
        return
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === '/') {
        e.preventDefault()
        if (atalhosTecladoAbertos()) fecharAtalhosTeclado()
        else abrirAtalhosTeclado()
        return
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault()
          if (e.shiftKey) ajustarFontePainelUi('editor', 1)
          else ajustarZoomUi(1)
          return
        }
        if (e.key === '-' || e.key === '_') {
          e.preventDefault()
          if (e.shiftKey) ajustarFontePainelUi('editor', -1)
          else ajustarZoomUi(-1)
          return
        }
        if ((e.key === '0' || e.code === 'Digit0') && e.shiftKey) {
          e.preventDefault()
          ajustarFontePainelUi('editor', 0)
          ajustarFontePainelUi('terminal', 0)
          return
        }
        if (e.key === '0' && !e.shiftKey) {
          e.preventDefault()
          ajustarZoomUi(0)
          return
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.altKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault()
          ajustarFontePainelUi('terminal', 1)
          return
        }
        if (e.key === '-' || e.key === '_') {
          e.preventDefault()
          ajustarFontePainelUi('terminal', -1)
          return
        }
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === '1' || e.key === '2' || e.key === '3')) {
        e.preventDefault()
        if (e.key === '1') focarRegiao('sidebar', 'Barra lateral')
        else if (e.key === '2') focarRegiao('center-panel', 'Conteúdo principal')
        else focarRegiao('exec-panel', 'Painel direito')
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault()
        alternarTerminalNoBloco3()
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        if (!desktopPermitido()) {
          pedirPermissaoDesktop()
          return
        }
        abrirNavegadorNoBloco3()
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault()
        focarPainelIa('chat')
      }
    },
    true
  )

  document.getElementById('dg-skip-link')?.addEventListener('click', (e) => {
    e.preventDefault()
    focarRegiao('center-panel', 'Conteúdo principal')
  })
  document.getElementById('btn-atalhos-fechar')?.addEventListener('click', fecharAtalhosTeclado)
  document.getElementById('modal-atalhos')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-atalhos')) fecharAtalhosTeclado()
  })
}
