/**
 * Autosave da area de trabalho: localStorage + IPC workspace.json (userData).
 */
let timer = null
let wired = false
/** @type {null | (() => Record<string, unknown>)} */
let coletor = null
/** @type {null | ((doc: Record<string, unknown>) => void | Promise<void>)} */
let aplicador = null

function lsGet(k, fallback) {
  try {
    const v = localStorage.getItem(k)
    return v == null ? fallback : v
  } catch {
    return fallback
  }
}

function lsSet(k, v) {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* */
  }
}

export function coletarWorkspacePadrao(getState) {
  const state = typeof getState === 'function' ? getState() : getState || {}
  const app = document.getElementById('app')
  const sw = app
    ? parseInt(getComputedStyle(app).getPropertyValue('--dg-sidebar-w'), 10) || 260
    : 260
  const rw = app
    ? parseInt(getComputedStyle(app).getPropertyValue('--dg-panel-w'), 10) || 420
    : 420
  const centerBtn = document.querySelector('.center-tab.active, [data-center].active')
  const rightBtn = document.querySelector('.right-tab.active')
  return {
    v: 1,
    layout: {
      sidebarWidth: sw,
      rightWidth: rw,
      sidebarCollapsed: !!app?.classList.contains('sidebar-collapsed'),
      rightCollapsed: !!app?.classList.contains('right-collapsed')
    },
    tema: document.body.classList.contains('tema-claro') ? 'claro' : 'escuro',
    chat: {
      mode: lsGet('dg-chat-mode', 'auto'),
      agent: lsGet('dg-chat-agent', 'auto'),
      autoapprove: lsGet('dg-chat-autoapprove', '') === '1',
      skill: lsGet('dg-chat-skill', ''),
      skillTitulo: lsGet('dg-chat-skill-titulo', ''),
      ativoId: lsGet('dg-chat-ativo', '') || undefined,
      draft: (document.getElementById('chat-input')?.value || '').slice(0, 20000)
    },
    ui: {
      centerPane: centerBtn?.getAttribute('data-center') || 'chat',
      rightPane: rightBtn?.getAttribute('data-pane') || 'agent',
      sidebarMode: document.querySelector('.sidebar-mode.active')?.id?.includes('projects')
        ? 'projects'
        : 'explorer',
      browserUrl: document.getElementById('browser-url')?.value || ''
    },
    pastas: Array.isArray(state.pastasRecentes) ? state.pastasRecentes.slice(0, 40) : [],
    pastaAtual: state.pastaAtual || null
  }
}

export function espelharLocal(doc) {
  if (!doc || typeof doc !== 'object') return
  if (doc.layout) {
    lsSet('dg-layout', JSON.stringify(doc.layout))
  }
  if (doc.tema) lsSet('dg-tema', doc.tema)
  if (doc.chat) {
    if (doc.chat.mode) lsSet('dg-chat-mode', doc.chat.mode)
    if (doc.chat.agent) lsSet('dg-chat-agent', doc.chat.agent)
    if (doc.chat.autoapprove) lsSet('dg-chat-autoapprove', '1')
    else if (doc.chat.autoapprove === false) {
      try {
        localStorage.removeItem('dg-chat-autoapprove')
      } catch {
        /* */
      }
    }
    if (doc.chat.skill) lsSet('dg-chat-skill', doc.chat.skill)
    if (doc.chat.skillTitulo) lsSet('dg-chat-skill-titulo', doc.chat.skillTitulo)
    if (doc.chat.ativoId) lsSet('dg-chat-ativo', doc.chat.ativoId)
    if (typeof doc.chat.draft === 'string') lsSet('dg-chat-draft', doc.chat.draft)
  }
  if (Array.isArray(doc.pastas)) lsSet('dg-pastas', JSON.stringify(doc.pastas))
  if (doc.pastaAtual) lsSet('dg-pasta-atual', doc.pastaAtual)
}

export function agendarSalvarWorkspace() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    void flushWorkspace()
  }, 400)
}

export async function flushWorkspace() {
  clearTimeout(timer)
  timer = null
  if (!coletor) return { ok: false }
  const doc = coletor()
  espelharLocal(doc)
  const el = document.getElementById('sb-workspace')
  if (el) el.textContent = 'WS: salvando…'
  try {
    const r = await window.api.invoke('workspace:salvar', doc)
    if (el) {
      el.textContent = r?.ok ? 'WS: salvo' : 'WS: local'
      setTimeout(() => {
        if (el.textContent.startsWith('WS: salvo') || el.textContent.startsWith('WS: local')) {
          el.textContent = 'WS: auto'
        }
      }, 2200)
    }
    return r
  } catch (e) {
    console.warn('[workspace] salvar:', e)
    if (el) el.textContent = 'WS: local'
    return { ok: false, erro: String(e) }
  }
}

export async function carregarWorkspaceDisco() {
  try {
    const r = await window.api.invoke('workspace:carregar')
    if (r?.ok && r.workspace) return r.workspace
  } catch {
    /* */
  }
  // fallback localStorage
  try {
    const layout = JSON.parse(lsGet('dg-layout', 'null'))
    return {
      v: 1,
      layout: layout || undefined,
      tema: lsGet('dg-tema', 'escuro'),
      chat: {
        mode: lsGet('dg-chat-mode', 'auto'),
        agent: lsGet('dg-chat-agent', 'auto'),
        autoapprove: lsGet('dg-chat-autoapprove', '') === '1',
        skill: lsGet('dg-chat-skill', ''),
        skillTitulo: lsGet('dg-chat-skill-titulo', ''),
        ativoId: lsGet('dg-chat-ativo', ''),
        draft: lsGet('dg-chat-draft', '')
      },
      pastas: JSON.parse(lsGet('dg-pastas', '[]')),
      pastaAtual: lsGet('dg-pasta-atual', '') || null
    }
  } catch {
    return null
  }
}

/**
 * @param {{
 *   coletar: () => Record<string, unknown>,
 *   aplicar: (doc: Record<string, unknown>) => void | Promise<void>
 * }} opts
 */
export function ligarWorkspaceAutosave(opts) {
  if (wired) return
  wired = true
  coletor = opts.coletar
  aplicador = opts.aplicar

  window.addEventListener('beforeunload', () => {
    try {
      const doc = coletor?.()
      if (doc) {
        espelharLocal(doc)
        // sendSync n뿯½o existe; invoke fire-and-forget
        void window.api.invoke('workspace:salvar', doc)
      }
    } catch {
      /* */
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void flushWorkspace()
  })
  document.getElementById('chat-input')?.addEventListener('input', () => {
    lsSet('dg-chat-draft', (document.getElementById('chat-input')?.value || '').slice(0, 20000))
    agendarSalvarWorkspace()
  })
}

export async function restaurarWorkspaceNoBoot() {
  const doc = await carregarWorkspaceDisco()
  if (!doc) return null
  espelharLocal(doc)
  if (aplicador) await aplicador(doc)
  return doc
}

export { agendarSalvarWorkspace as marcarWorkspaceSujo }
