/**
 * UI de aprovação de automação (Office/Windows) — diálogos no tema DG.
 */
import { dgConfirm, dgAlert } from './dg-dialog.js'

/**
 * @param {{ toast?: (msg: string, tipo?: string) => void }} [opts]
 */
export function ligarAutomacaoAprovacao(opts = {}) {
  const toast = opts.toast || (() => {})
  try {
    window.api?.on?.('automation:aprovacao-pendente', async (_e, payload) => {
      const p = payload && typeof payload === 'object' ? payload : {}
      const id = String(p.id || '')
      if (!id) return
      const risco = String(p.risco || 'medio')
      const nivel = String(p.nivelAprovacao || 'simples')
      const titulo = 'Autorizar automação'
      const corpo =
        (p.descricao || p.comandoId || 'comando') +
        '\n\nDomínio: ' +
        (p.dominio || '?') +
        ' · Risco: ' +
        risco +
        (p.args ? '\nArgs: ' + JSON.stringify(p.args).slice(0, 280) : '')
      let aprovado = false
      let confirmacao
      try {
        if (nivel === 'forte') {
          aprovado = await dgConfirm(
            corpo + '\n\nAção sensível: confirme digitando mentalmente CONFIRMAR e aceite.',
            titulo
          )
          if (aprovado) confirmacao = 'CONFIRMAR'
        } else {
          aprovado = await dgConfirm(corpo, titulo)
        }
      } catch {
        aprovado = false
      }
      try {
        const r = await window.api.invoke('automation:aprovacao-resolver', {
          id,
          aprovado,
          confirmacao
        })
        if (!r?.ok && aprovado) {
          toast('Aprovação expirou', 'aviso')
        } else if (aprovado) {
          toast('Automação autorizada', 'ok')
        } else {
          toast('Automação recusada', 'aviso')
        }
      } catch (e) {
        void dgAlert('Falha ao resolver aprovação: ' + String(e), 'Erro')
      }
    })
  } catch (e) {
    console.warn('[automation-aprovacao]', e)
  }
}
