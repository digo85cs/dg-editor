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
        alert(msg)
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

/** Atualiza o tooltip do botão de maximizar conforme o estado da janela. */
export async function atualizarIconeMax() {
  try {
    const st = await window.api.invoke('janela:estado')
    const b = document.getElementById('tb-max')
    if (!b) return
    b.title = st && st.maximizado ? 'Restaurar' : 'Maximizar'
  } catch {}
}
