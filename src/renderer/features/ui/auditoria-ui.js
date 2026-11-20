// Auto-auditoria sob demanda, ícone de maximizar e botão do painel direito.
import { toggleRight } from '../layout/paineis.js'
import { abrirModalReinicio } from './escolha-modal.js'

const $ = (id) => document.getElementById(id)

export function ligarBotaoPainel() {
  $('btn-painel')?.addEventListener('click', () => toggleRight())
}

export async function rodarAutoAuditoria() {
  const btn = document.getElementById('btn-auditar')
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Auditando...'
  }
  try {
    // Mesma regua do boot (autoAtualizar=false) — numeros OK/warn/erro identicos
    const r = await window.api.invoke('auditoria:rodar', {
      autoAtualizar: false,
      reiniciarAoFim: false
    })
    if (!r || r.erro) {
      console.warn('[auditoria] erro:', r && r.erro)
    } else {
      const falhas = (r.achados || []).filter(function (a) {
        return a.status === 'falhou'
      })
      const pend = (r.resumo && r.resumo.pendencias) || []
      var msg =
        'Auditoria concluida\n' +
        'OK: ' +
        r.resumo.ok +
        ' | Avisos: ' +
        r.resumo.warn +
        ' | Erros: ' +
        r.resumo.erro +
        '\n' +
        'Corrigidos: ' +
        r.resumo.corrigidos +
        ' | Falhas: ' +
        r.resumo.falhas
      if (pend.length) {
        msg +=
          '\n\nPendencias:\n' +
          pend
            .map(function (p) {
              return '- [' + p.severidade + '] ' + p.id + ' — ' + p.titulo
            })
            .join('\n')
      }
      if (falhas.length) {
        msg +=
          '\n\nFalhas:\n' +
          falhas
            .map(function (a) {
              return '- ' + a.titulo
            })
            .join('\n')
      }
      if (!r.reiniciarPendente) {
        mostrarRelatorioAuditoria(msg)
      }
      if (r.reiniciarPendente) {
        abrirModalReinicio(r.motivoReinicio)
      }
    }
  } catch (e) {
    console.warn('[auditoria] excecao:', e)
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = 'Auditar'
    }
  }
}

function mostrarRelatorioAuditoria(msg) {
  const overlay = document.createElement('div')
  overlay.className = 'escolha-overlay'
  const caixa = document.createElement('div')
  caixa.className = 'escolha-caixa'
  caixa.style.cssText =
    'max-width:720px;width:92vw;max-height:80vh;display:flex;flex-direction:column;'
  const h = document.createElement('h3')
  h.textContent = 'Auto-auditoria'
  h.style.cssText = 'margin:0 0 10px;font-size:15px;flex:none;'
  caixa.appendChild(h)
  const corpo = document.createElement('pre')
  corpo.textContent = msg
  corpo.style.cssText =
    'margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px;' +
    'overflow:auto;flex:1 1 auto;min-height:0;line-height:1.45;'
  caixa.appendChild(corpo)
  const fechar = document.createElement('button')
  fechar.textContent = 'Fechar'
  fechar.className = 'btn-primary'
  fechar.style.cssText = 'margin-top:12px;flex:none;'
  fechar.addEventListener('click', () => overlay.remove())
  caixa.appendChild(fechar)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove()
  })
  overlay.appendChild(caixa)
  document.body.appendChild(overlay)
}

/** Atualiza o tooltip do botão de maximizar conforme o estado da janela. */
export async function atualizarIconeMax() {
  try {
    const st = await window.api.invoke('janela:estado')
    const b = document.getElementById('tb-max')
    if (!b) return
    b.title = st && st.maximizado ? 'Restaurar' : 'Maximizar'
  } catch {}
}
