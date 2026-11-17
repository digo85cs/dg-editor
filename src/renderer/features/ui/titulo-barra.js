// Titlebar frameless: botões de janela, histórico de abas e auto-auditoria.
import { irHistAbas, atualizarBotoesHist } from '../editor/historico-abas.js'
import { fecharModalReinicio } from './escolha-modal.js'
import { initMenubar } from './menubar.js'
import { rodarAutoAuditoria, atualizarIconeMax } from './auditoria-ui.js'

export function ligarTituloBarra() {
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('btn-auditar')
    if (btn) btn.addEventListener('click', rodarAutoAuditoria)
    var bMin = document.getElementById('tb-min')
    var bMax = document.getElementById('tb-max')
    var bClose = document.getElementById('tb-close')
    var bVoltar = document.getElementById('tb-voltar')
    var bAvancar = document.getElementById('tb-avancar')
    if (bVoltar) bVoltar.addEventListener('click', function () {
      void irHistAbas(-1)
    })
    if (bAvancar) bAvancar.addEventListener('click', function () {
      void irHistAbas(1)
    })
    atualizarBotoesHist()
    if (bMin) bMin.addEventListener('click', function () {
      window.api.invoke('janela:minimizar')
    })
    if (bMax)
      bMax.addEventListener('click', async function () {
        try {
          await window.api.invoke('janela:maximizar')
        } catch (e) {
          console.warn('[janela] maximizar:', e)
        }
        setTimeout(atualizarIconeMax, 120)
      })
    if (bClose) bClose.addEventListener('click', function () {
      window.api.invoke('janela:fechar')
    })
    var bAgora = document.getElementById('btn-reinicio-agora')
    var bDepois = document.getElementById('btn-reinicio-depois')
    if (bDepois) bDepois.addEventListener('click', fecharModalReinicio)
    if (bAgora)
      bAgora.addEventListener('click', function () {
        fecharModalReinicio()
        window.api.invoke('auditoria:rodar', { autoAtualizar: false, reiniciarAoFim: true })
      })
    atualizarIconeMax()
    initMenubar()
  })
}
