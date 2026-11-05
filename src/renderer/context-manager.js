/**
 * Gerenciador de Contexto - estima tokens e permite gerenciar
 */
let contextItems = []
const TOKEN_RATIO = 4 // ~4 chars = 1 token

function estimateTokens(text) {
  if (!text) return 0
  return Math.ceil(String(text).length / TOKEN_RATIO)
}

function updateContextUI() {
  const container = document.getElementById('context-manager')
  if (!container) return
  const totalTokens = contextItems.reduce((sum, item) => sum + item.tokens, 0)
  container.innerHTML = `
    <div class="context-header">
      <span>Contexto: ${totalTokens} tokens</span>
      <button id="ctx-clear" class="btn-small">Limpar</button>
    </div>
    <div class="context-items">
      ${contextItems.map((item, idx) => `
        <div class="context-item" data-idx="${idx}">
          <span class="ctx-name">${escapeHtml(item.name)}</span>
          <span class="ctx-tokens">${item.tokens}t</span>
          <button class="ctx-remove" data-idx="${idx}">×</button>
        </div>
      `).join('')}
    </div>
  `
  container.querySelector('#ctx-clear')?.addEventListener('click', () => {
    contextItems = []
    updateContextUI()
    window.dispatchEvent(new CustomEvent('dg:context-changed', { detail: { items: [] } }))
  })
  container.querySelectorAll('.ctx-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx)
      contextItems.splice(idx, 1)
      updateContextUI()
      window.dispatchEvent(new CustomEvent('dg:context-changed', { detail: { items: contextItems } }))
    })
  })
}

function escapeHtml(s) {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

export function addContextItem(name, content, type = 'file') {
  const tokens = estimateTokens(content)
  contextItems.push({ name, content, tokens, type })
  updateContextUI()
  window.dispatchEvent(new CustomEvent('dg:context-changed', { detail: { items: contextItems } }))
}

export function clearContext() {
  contextItems = []
  updateContextUI()
}

export function getContextItems() {
  return contextItems.slice()
}

export function initContextManager() {
  if (document.getElementById('context-manager')) return
  const agentPanel = document.querySelector('#agent .agent-input-bar') || document.querySelector('.agent-pane')
  if (!agentPanel) return
  const div = document.createElement('div')
  div.id = 'context-manager'
  div.className = 'context-manager'
  agentPanel.parentElement?.insertBefore(div, agentPanel)
  updateContextUI()
}
