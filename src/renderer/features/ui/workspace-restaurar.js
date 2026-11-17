// Autosave e restauração da área de trabalho (layout, chats, panes, draft, raiz).
import { state } from '../../state/app-state.js'
import {
  ligarWorkspaceAutosave,
  coletarWorkspacePadrao,
  restaurarWorkspaceNoBoot
} from '../../workspace-ui.js'
import { obterHistChat } from '../chat/chat-core.js'
import { clamparLayout, toggleRight, sincronizarBotoesPainelDireito } from '../layout/paineis.js'
import { ativarPainelCentro, ativarAbaDireita } from '../layout/panes.js'
import { aplicarTemaLocal } from './comandos.js'
import { setSidebarMode } from '../arquivos/arvore-render.js'
import { selecionarPasta } from '../arquivos/contexto-pasta.js'

const $ = (id) => document.getElementById(id)

export function ligarRestauracaoWorkspace() {
  ligarWorkspaceAutosave({
    coletar: () => {
      const doc = coletarWorkspacePadrao(() => state)
      const histChatAtivo = obterHistChat()
      if (histChatAtivo?.obterId) doc.chat = { ...(doc.chat || {}), ativoId: histChatAtivo.obterId() || doc.chat?.ativoId }
      return doc
    },
    aplicar: async (doc) => {
      if (!doc) return
      if (doc.layout) {
        const app = $('app')
        if (doc.layout.sidebarWidth) {
          app.style.setProperty('--dg-sidebar-w', doc.layout.sidebarWidth + 'px')
          app.style.setProperty('--dg-sidebar-width', doc.layout.sidebarWidth + 'px')
        }
        if (doc.layout.rightWidth) {
          app.style.setProperty('--dg-panel-w', doc.layout.rightWidth + 'px')
          app.style.setProperty('--dg-right-panel-width', doc.layout.rightWidth + 'px')
        }
        app.classList.toggle('sidebar-collapsed', !!doc.layout.sidebarCollapsed)
        app.classList.toggle('right-collapsed', !!doc.layout.rightCollapsed)
        clamparLayout()
      }
      if (doc.tema) aplicarTemaLocal(doc.tema)
      if (doc.ui?.centerPane) ativarPainelCentro(doc.ui.centerPane)
      else ativarPainelCentro('chat')
      if (doc.ui?.rightPane) ativarAbaDireita(doc.ui.rightPane)
      else ativarAbaDireita('agent')
      if (doc.ui?.sidebarMode) setSidebarMode(doc.ui.sidebarMode)
      if (doc.ui?.browserUrl && $('browser-url')) $('browser-url').value = doc.ui.browserUrl
      if (doc.chat?.draft && $('chat-input') && !$('chat-input').value) {
        $('chat-input').value = doc.chat.draft
      }
      // Restaura a pasta ativa no main/renderer: sem isso a analise e o agente
      // acordam sem raiz e o painel de analise fica vazio.
      const alvoRaiz = typeof doc.pastaAtual === 'string' ? doc.pastaAtual.trim() : ''
      if (alvoRaiz) {
        try {
          const r = await window.api.invoke('workspace:definir-raiz', alvoRaiz)
          const valida = !!(r?.ok && r?.raiz && String(r.raiz).toLowerCase() === alvoRaiz.toLowerCase())
          if (valida) await selecionarPasta(r.raiz)
        } catch (e) {
          console.warn('[boot] restaurar raiz:', e)
        }
      }
      sincronizarBotoesPainelDireito()
    }
  })
  void (async () => {
    const doc = await restaurarWorkspaceNoBoot()
    if (!doc) {
      ativarPainelCentro('chat')
      ativarAbaDireita('agent')
      if (window.innerWidth >= 900) toggleRight(true)
      else toggleRight(false)
    }
    sincronizarBotoesPainelDireito()
    // P1 responsivo: janela estreita recolhe Bloco 3
    const syncResp = () => {
      if (window.innerWidth < 900 && !$('app').classList.contains('right-collapsed')) {
        toggleRight(false)
      }
    }
    window.addEventListener('resize', () => {
      clearTimeout(window.__dgRespT)
      window.__dgRespT = setTimeout(syncResp, 200)
    })
    syncResp()
  })()
}
