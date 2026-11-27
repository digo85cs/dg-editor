/**
 * Perspectivas de 1 clique (Onda 2): Código · Agente · Mídia · Vault · Zen.
 * Adapta o layout do DG Editor ao fluxo atual sem destruir estado de abas/chat/terminal.
 */
import { anunciar } from './live-region.js'

const LS_KEY = 'dg-perspectiva'
const VALIDAS = ['codigo', 'agente', 'midia', 'vault', 'zen']

const METAS = [
  { id: 'codigo', rotulo: 'Código', tip: 'Modo Código (Editor + Explorer)' },
  { id: 'agente', rotulo: 'Agente', tip: 'Modo Agente (Chat + Diff + Browser)' },
  { id: 'midia', rotulo: 'Mídia', tip: 'Estúdio de Mídia expandido' },
  { id: 'vault', rotulo: 'Vault', tip: 'Notas Markdown, Grafo e Mapa Mental' },
  { id: 'zen', rotulo: 'Zen', tip: 'Modo Zen — foco total (Ctrl+Alt+Z)' }
]

let atual = 'codigo'
let anteriorAntesZen = 'codigo'
let deps = {
  focarPainelIa: () => {},
  ativarPainelCentro: () => {},
  abrirVault: () => {}
}

export function configurarPerspectivas(d) {
  deps = { ...deps, ...(d || {}) }
}

export function obterPerspectivaAtual() {
  return atual
}

function atualizarBotoes(id) {
  document.querySelectorAll('.dg-persp-btn').forEach((btn) => {
    const ativo = btn.dataset.perspectiva === id
    btn.classList.toggle('ativo', ativo)
    btn.setAttribute('aria-selected', ativo ? 'true' : 'false')
  })
  const zenExit = document.getElementById('dg-zen-exit')
  if (zenExit) zenExit.hidden = id !== 'zen'
}

export function aplicarPerspectiva(id, opts = {}) {
  const alvo = VALIDAS.includes(id) ? id : 'codigo'
  if (alvo === 'zen' && atual !== 'zen') anteriorAntesZen = atual
  atual = alvo

  for (const v of VALIDAS) document.body.classList.remove('perspectiva-' + v)
  document.body.classList.add('perspectiva-' + alvo)
  document.body.dataset.perspectiva = alvo
  atualizarBotoes(alvo)

  if (alvo !== 'zen') {
    try { localStorage.setItem(LS_KEY, alvo) } catch { /* */ }
  }

  if (!opts.silencioso) {
    if (alvo === 'codigo') {
      const toolPanel = document.getElementById('tool-panel')
      if (toolPanel && !toolPanel.hidden) document.getElementById('tool-voltar')?.click()
      document.getElementById('sidebar')?.classList.remove('collapsed')
    } else if (alvo === 'agente') {
      const toolPanel = document.getElementById('tool-panel')
      if (toolPanel && !toolPanel.hidden) document.getElementById('tool-voltar')?.click()
      deps.focarPainelIa?.('chat')
    } else if (alvo === 'midia') {
      document.getElementById('sidebar')?.classList.remove('collapsed')
      const btnMidia = document.querySelector('#tool-nav .tool-nav-btn[data-tool="midia"]')
      const jaAberto = btnMidia?.classList.contains('ativo') && !document.getElementById('tool-panel')?.hidden
      if (btnMidia && !jaAberto) btnMidia.click()
    } else if (alvo === 'vault') {
      document.getElementById('sidebar')?.classList.remove('collapsed')
      const toolPanel = document.getElementById('tool-panel')
      if (toolPanel && !toolPanel.hidden) document.getElementById('tool-voltar')?.click()
      const vaultSec = document.getElementById('vault-section')
      if (vaultSec && vaultSec.hidden) deps.abrirVault?.()
    }
    const meta = METAS.find((m) => m.id === alvo)
    if (meta) anunciar('Perspectiva: ' + meta.rotulo)
  }
  return alvo
}

export function alternarModoZen() {
  if (atual === 'zen') return aplicarPerspectiva(anteriorAntesZen || 'codigo')
  return aplicarPerspectiva('zen')
}

export function initPerspectivas() {
  const titlebar = document.getElementById('titlebar')
  const dragFill = titlebar?.querySelector('.tb-drag-fill')
  if (titlebar && !document.getElementById('dg-perspectivas')) {
    const nav = document.createElement('div')
    nav.id = 'dg-perspectivas'
    nav.className = 'dg-perspectivas'
    nav.setAttribute('role', 'tablist')
    nav.setAttribute('aria-label', 'Perspectivas de trabalho')
    for (const m of METAS) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'dg-persp-btn'
      btn.dataset.perspectiva = m.id
      btn.setAttribute('role', 'tab')
      btn.setAttribute('aria-selected', m.id === 'codigo' ? 'true' : 'false')
      btn.title = m.tip
      btn.textContent = m.rotulo
      btn.addEventListener('click', () => aplicarPerspectiva(m.id))
      nav.appendChild(btn)
    }
    if (dragFill) titlebar.insertBefore(nav, dragFill)
    else titlebar.appendChild(nav)
  }

  if (!document.getElementById('dg-zen-exit')) {
    const pill = document.createElement('button')
    pill.id = 'dg-zen-exit'
    pill.type = 'button'
    pill.className = 'dg-zen-exit'
    pill.hidden = true
    pill.textContent = 'Sair do Zen (Ctrl+Alt+Z)'
    pill.addEventListener('click', () => alternarModoZen())
    document.body.appendChild(pill)
  }

  // Inicia sempre em perspectiva segura (nao restaura 'zen' nem 'midia' no boot para evitar layout inesperado)
  aplicarPerspectiva('codigo', { silencioso: true })
}
