// Contexto de pasta/workspace: seleção, sincronização chat+análise+histórico.
import { state } from '../../state/app-state.js'
import { agendarSalvarWorkspace } from '../../workspace-ui.js'
import { carregarOpcoesAgenteChat } from '../chat/agente-seletor.js'
import { atualizarStatusBar } from '../ui/repos-status.js'
import { habilitarBotoesAnalise, renderizarAnalise } from '../analise/acoes.js'
import {
  jobDaPasta,
  algumJobAtivo,
  pastaTemJob,
  pintarSidebarJobs
} from '../chat/jobs-paralelos.js'
import {
  setChatSendMode,
  setChatLiveStatus,
  obterHistChat
} from '../chat/chat-core.js'
import { atualizarCartaoTrabalho } from '../chat/progresso-humano.js'
import { pintarStatsNoCartao } from '../chat/agent-activity.js'
import { ligarHistoricoChat } from '../chat/historico-orientador.js'
import { carregarFilhos, atualizarGitStatusArvore } from './arvore-render.js'
import { ativarAbaCentro } from '../layout/panes.js'

const $ = (id) => document.getElementById(id)

let deps = {
  nomePastaUi: (p) => p,
  nomeArquivo: (p) => p
}

export function configurarContextoPasta(d) {
  deps = { ...deps, ...d }
}

export async function selecionarPasta(path) {
  console.time('selecionarPasta')
  ativarAbaCentro('chat')

  // Árvore: marcar expandida no Map (não obrigatório abrir filhos para contexto)
  if (!state.estadoArvore.has(path)) {
    state.estadoArvore.set(path, { expandida: true, filhosCarregados: false })
  } else {
    state.estadoArvore.get(path).expandida = true
  }

  // Contexto bloco 2/3 imediato (chat + análise + histórico)
  await sincronizarContextoPasta(path, { forceAnalise: true })

  // Filhos da árvore em paralelo (não bloqueia chat/análise)
  const raizEl = document.querySelector('.tree-root[data-path="' + CSS.escape(path) + '"]')
  if (raizEl) {
    const children = raizEl.querySelector(':scope > .tree-children')
    const chev = raizEl.querySelector('.chevron')
    if (children) {
      chev?.classList.add('open')
      children.classList.add('open')
      if (children.childElementCount === 0) {
        void carregarFilhos(path, children, 1)
      }
    }
  }

  void atualizarGitStatusArvore()
  window.api.invoke('rules:exists', path).then((temRegras) => {
    if (!temRegras) window.api.invoke('rules:create-template', path).catch(() => {})
  }).catch(() => {})

  console.timeEnd('selecionarPasta')
}

/**
 * Contexto bloco 2 (chat/editor) + bloco 3 (análise/execução):
 * sempre segue a pasta/workspace selecionada. Fluido — sem esperar expandir árvore.
 */
export function definirContextoPasta(p) {
  if (!p) return
  void sincronizarContextoPasta(p)
}

export function resolverPastaChatAtiva() {
  const cand =
    state.pastaAtual ||
    window.__DG_PASTA_ATUAL__ ||
    (Array.isArray(state.pastasRecentes) && state.pastasRecentes[0]) ||
    ''
  return typeof cand === 'string' ? cand.trim() : ''
}

export async function sincronizarContextoPasta(p, opts = {}) {
  if (!p) return
  const mudou = state.pastaAtual !== p
  if (mudou) {
    delete $('analysis-content')?.dataset.jaAnalisou
  }
  state.pastaAtual = p
  try {
    window.__DG_PASTA_ATUAL__ = p
  } catch {
    /* */
  }
  try {
    await window.api.invoke('workspace:definir-raiz', p)
  } catch {
    /* main ainda sem canal em builds antigos */
  }
  agendarSalvarWorkspace()
  void carregarOpcoesAgenteChat(p)
  void atualizarStatusBar(p)
  const titulo = $('chat-title')
  if (titulo) titulo.textContent = deps.nomePastaUi(p)
  const send = $('chat-send')
  if (send) send.disabled = false
  habilitarBotoesAnalise(true)
  $('empty-state')?.remove()
  // Restaura cartão / botão Stop se este repo tem Agent em andamento
  const jobAtivo = jobDaPasta(p)
  if (jobAtivo) {
    setChatSendMode('stop')
    atualizarCartaoTrabalho($('chat-messages'), {
      titulo: jobAtivo.tituloCard || 'Trabalhando…',
      passo: jobAtivo.passo || 'Agent em andamento…',
      elapsedSec: (Date.now() - (jobAtivo.iniciadoEm || Date.now())) / 1000
    })
    if (jobAtivo.stats) pintarStatsNoCartao($('chat-messages'), jobAtivo.stats)
    setChatLiveStatus(jobAtivo.passo || 'Trabalhando…')
  } else if (!algumJobAtivo() || !pastaTemJob(p)) {
    setChatSendMode('send')
  }
  pintarSidebarJobs(() => state.pastaAtual)

  document.querySelectorAll('.tree-root.selected').forEach((el) => el.classList.remove('selected'))
  const raizEl = document.querySelector('.tree-root[data-path="' + CSS.escape(p) + '"]')
  if (raizEl) raizEl.classList.add('selected')

  if (opts.chatId) {
    try {
      localStorage.setItem('dg-chat-ativo', opts.chatId)
    } catch {
      /* */
    }
  }

  const tarefas = [ligarHistoricoChat(p)]
  if (mudou || opts.forceAnalise) {
    tarefas.push(
      window.api
        .invoke('analysis:cached', p)
        .then((cached) => {
          const box = $('analysis-content')
          if (!box) return
          const payload = cached && cached.ok === false ? null : cached && cached.result !== undefined ? cached.result : cached
          const rep =
            payload && typeof payload === 'object'
              ? payload.report && typeof payload.report === 'object'
                ? payload.report
                : payload
              : null
          const temRelatorio = !!(rep && (rep.oQueE || rep.stack || rep.estrutura || (rep.pontosAtencao && rep.pontosAtencao.length)))
          if (temRelatorio) {
            renderizarAnalise(rep, !!(payload && payload.fromCache))
          } else if (mudou) {
            box.innerHTML =
              '<p class="muted">Pasta ativa: <strong>' +
              deps.nomeArquivo(p) +
              '</strong>. Nenhuma análise salva ainda — use <strong>Análise rápida</strong> ou <strong>Análise completa</strong> acima.</p>'
          }
        })
        .catch(() => {})
    )
  }
  await Promise.all(tarefas)
  void obterHistChat()?.refrescarLista?.()
}

export function raizWorkspaceDe(caminho) {
  const a = String(caminho || '')
  for (const r of state.pastasRecentes) {
    if (!r) continue
    if (a === r) return r
    const sep = r.endsWith('\\') || r.endsWith('/') ? '' : '\\'
    if (a.toLowerCase().startsWith((r + sep).toLowerCase())) return r
  }
  return state.pastaAtual
}
