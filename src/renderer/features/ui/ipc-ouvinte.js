// Ouvintes IPC globais: agendador, fallback de providers, badge de modelo.
import { mostrarToast } from './toast.js'
import { enviarMensagem } from '../chat/enviar.js'
import { setChatLiveStatus } from '../chat/chat-core.js'
import { marcarProviderFallback } from '../../chat.js'
import { atualizarBadgeProvedorReal } from './deps-status.js'
import { toggleRight, sincronizarBotoesPainelDireito } from '../layout/paineis.js'
import { ativarAbaDireita } from '../layout/panes.js'

const $ = (id) => document.getElementById(id)

// Agendador: injeta o prompt no chat quando um job vence
function ligarAgendador() {
  window.api.on('agendador:disparo', (_e, p) => {
    try {
      if (!p || !p.prompt) return
      const input = $('chat-input')
      if (input) {
        input.value = String(p.prompt)
        mostrarToast('Job agendado disparou: ' + String(p.prompt).slice(0, 60), 'info')
        void enviarMensagem()
      }
    } catch {
      /* */
    }
  })
}

/** Valida UI crítica e recarrega o app (passo self-loop). */
export async function verificarEReiniciarDg() {
  mostrarToast('Verificando Bloco 3 e chat…', 'aviso')
  toggleRight(true)
  ativarAbaDireita('agent')
  sincronizarBotoesPainelDireito()
  const okToggle = !!$('btn-right-toggle')
  const okPanel = !!$('exec-panel') && !$('app').classList.contains('right-collapsed')
  const okRail = !!$('right-rail') && !!$('rail-collapse')
  const okEdge = !!$('bloco3-edge')
  const okChats = !!$('agent-chats-list')
  // ciclo recolher/expandir garante botão de retorno
  toggleRight(false)
  sincronizarBotoesPainelDireito()
  const okCollapsed = $('app').classList.contains('right-collapsed') &&
    !!$('right-rail') &&
    $('bloco3-edge') &&
    !$('bloco3-edge').hidden
  toggleRight(true)
  sincronizarBotoesPainelDireito()
  if (!okToggle || !okPanel || !okRail || !okEdge || !okChats || !okCollapsed) {
    mostrarToast('Checagem parcial — use “Abrir Bloco 3” / aba ‹ na borda', 'erro')
  } else {
    mostrarToast('Bloco 3 + chats OK — recarregando', 'ok')
  }
  try {
    await window.api.invoke('janela:recarregar', true)
  } catch {
    location.reload()
  }
}

export function ligarIpcOuvintes() {
  ligarAgendador()

  // ---------- Guardião ----------
  window.__dgAtualizarAba = window.__dgAtualizarAba || function () {}
  window.dgToast = mostrarToast

  // Checagem ocasional de versões remotas (não bloqueia UI)
  setTimeout(() => {
    void window.api
      .invoke('modelos:versoes-remotas')
      .then(() => atualizarBadgeProvedorReal())
      .catch(() => {})
  }, 20000)

  if (typeof window.api?.on === 'function') {
    window.api.on('chat:fallback', (_e, payload) => {
      const p = payload || {}
      const de = p.de || 'provedor'
      marcarProviderFallback()
      setChatLiveStatus('Provedor ' + de + ' falhou — tentando outro…')
    })
    window.api.on('brain:fallback', (_e, payload) => {
      const p = payload || {}
      const de = p.de || '?'
      const para = p.para || '?'
      mostrarToast('IA trocou de modelo: ' + de + ' → ' + para, 'aviso')
      marcarProviderFallback()
      void atualizarBadgeProvedorReal(para)
      void window.api.invoke('brain:avaliar', para).then((r) => {
        const nota = r?.avaliacao?.nota
        if (typeof nota === 'number' && nota < 6) {
          mostrarToast(
            'Modelo ' + para + ' respondeu abaixo do esperado (nota ' + nota + '/10) — verifique',
            'aviso'
          )
        }
      }).catch(() => {})
    })
    window.api.on('devin:sessao-mudou', (_e, p) => {
      const s = p || {}
      mostrarToast(
        'Sessão Devin ' + String(s.sessionId || '').slice(0, 8) + ': ' + String(s.de || '?') + ' → ' + String(s.para || '?'),
        'info'
      )
    })
    // Subagente em background concluiu — avisa e deixa o resultado no /tarefa <id>
    window.api.on('agente:background', (_e, p) => {
      const t = p || {}
      const rotulo = String(t.pedido || '').slice(0, 60)
      if (t.status === 'ok') {
        mostrarToast('Tarefa background concluída: ' + rotulo + ' — /tarefa ' + t.id, 'ok')
      } else if (t.status === 'cancelada') {
        mostrarToast('Tarefa background cancelada: ' + rotulo, 'aviso')
      } else {
        mostrarToast('Tarefa background falhou: ' + rotulo + (t.erro ? ' — ' + String(t.erro).slice(0, 80) : ''), 'erro')
      }
    })
  }

  $('btn-brain-avaliar')?.addEventListener('click', async () => {
    mostrarToast('Avaliando modelo ativo…', 'aviso')
    try {
      const r = await window.api.invoke('brain:avaliar')
      if (!r?.ok) {
        mostrarToast('Avaliação falhou: ' + (r?.erro || 'erro'), 'erro')
        return
      }
      const a = r.avaliacao
      mostrarToast(
        'Nota ' + a.nota + '/10 (' + a.acertos + '/' + a.total + ') — ' + a.modelo,
        a.nota < 6 ? 'aviso' : 'ok'
      )
    } catch (e) {
      mostrarToast('Avaliação falhou: ' + String(e), 'erro')
    }
  })
}
