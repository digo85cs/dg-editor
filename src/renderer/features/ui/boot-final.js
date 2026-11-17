// Sequência final de boot: listas, status, guardião, providers e titlebar.
import { state } from '../../state/app-state.js'
import { garantirPastaRaizProjeto } from '../arquivos/pastas-crud.js'
import { restaurarAbas } from '../editor/abas-ui.js'
import { iniciarGuardian } from '../guardian/index.js'
import { atualizarStatusBar } from './repos-status.js'
import { renderizarPastas, renderizarProjects } from '../arquivos/arvore-render.js'
import { ligarContextMenuDg } from './context-menu.js'
import { initTooltipsRicos } from './tooltips.js'
import { atualizarBadgeProvedorReal } from './deps-status.js'
import { iniciarStatusProviders, ligarBotaoOllama, avisarStatusDepsBoot } from './boot-status.js'
import { ligarTituloBarra } from './titulo-barra.js'

export function executarBootFinal() {
  ligarContextMenuDg()
  renderizarPastas()
    .then(() => garantirPastaRaizProjeto())
    .then(() => restaurarAbas())
  void renderizarProjects().then(() => atualizarStatusBar(state.pastaAtual || state.pastasRecentes[0] || null))
  void atualizarStatusBar(state.pastaAtual || state.pastasRecentes[0] || null)
  iniciarGuardian()
  void atualizarBadgeProvedorReal()
  /** Modo QA (e2e/mock): suprime avisos transitórios de boot nas capturas. */
  const qaModoPromessa = window.api
    .invoke('app:qa-mode')
    .then((r) => !!r?.e2e)
    .catch(() => false)
  avisarStatusDepsBoot(qaModoPromessa)

  /** Tooltips ricos (balão) para ícones e botões com title/data-tip. */
  initTooltipsRicos()

  iniciarStatusProviders(qaModoPromessa)
  ligarBotaoOllama()

  ligarTituloBarra()
}
