// Boot dos painéis rights: rail de panes + assistente "novo".
import { desktopPermitido } from '../arquivos/desktop-vault.js'
import { abrirNavegadorUi } from './activity-browser.js'
import { garantirTerminal } from './terminal-lazy.js'
import { toggleRight } from '../layout/paineis.js'
import { ativarAbaDireita, focarPainelIa } from '../layout/panes.js'
import { ligarAssistenteNovo, ligarRightRail } from '../chat/assistente-novo.js'
import { mostrarToast } from './toast.js'

const $ = (id) => document.getElementById(id)

export function ligarPaineisBoot(deps = {}) {
  if (desktopPermitido()) $('btn-desktop-use')?.classList.add('active')
  ligarRightRail({
    toggleRight,
    ativarAba: ativarAbaDireita,
    abrirBrowser: () => void abrirNavegadorUi(),
    garantirTerminal: () => {
      try { garantirTerminal() } catch { /* */ }
    }
  })
  ligarAssistenteNovo({
    focarChat: () => focarPainelIa('chat'),
    setChatText: (t) => {
      const input = $('chat-input')
      if (input) input.value = t || ''
    },
    enviarChat: () => deps.enviarMensagemUi?.(),
    toggleRight,
    ativarAba: ativarAbaDireita,
    abrirFerramentas: (id) => {
      try {
        document.querySelector('.tool-nav-btn[data-tool="' + id + '"]')?.click()
      } catch { /* */ }
    },
    toast: (m, t) => mostrarToast(m, t || 'ok')
  })
}
