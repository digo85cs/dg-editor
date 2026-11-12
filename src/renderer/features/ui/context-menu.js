/**
 * Menu de botao direito (Copiar / Colar / Recortar / Selecionar tudo)
 * no chat, composer e areas editaveis — estilo Cursor.
 */

let menuEl = null

function fechar() {
  if (menuEl) {
    menuEl.remove()
    menuEl = null
  }
}

function item(label, fn, disabled) {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  b.disabled = !!disabled
  b.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    fechar()
    if (!disabled) void fn()
  })
  return b
}

async function execCmd(cmd) {
  try {
    if (document.execCommand) document.execCommand(cmd)
  } catch {
    /* */
  }
}

async function copiarSel() {
  const sel = String(window.getSelection?.()?.toString() || '')
  if (sel) {
    try {
      await navigator.clipboard.writeText(sel)
      return
    } catch {
      /* */
    }
  }
  await execCmd('copy')
}

async function colarEm(alvo) {
  try {
    const txt = await navigator.clipboard.readText()
    if (alvo && (alvo.tagName === 'TEXTAREA' || alvo.tagName === 'INPUT')) {
      const start = alvo.selectionStart ?? alvo.value.length
      const end = alvo.selectionEnd ?? start
      const v = String(alvo.value || '')
      alvo.value = v.slice(0, start) + txt + v.slice(end)
      const pos = start + txt.length
      alvo.setSelectionRange(pos, pos)
      alvo.dispatchEvent(new Event('input', { bubbles: true }))
      return
    }
  } catch {
    /* */
  }
  await execCmd('paste')
}

function abrir(x, y, alvo) {
  fechar()
  const editavel =
    alvo &&
    (alvo.isContentEditable ||
      alvo.tagName === 'TEXTAREA' ||
      alvo.tagName === 'INPUT' ||
      !!alvo.closest?.('textarea, input, [contenteditable="true"]'))
  const campo =
    alvo?.tagName === 'TEXTAREA' || alvo?.tagName === 'INPUT'
      ? alvo
      : alvo?.closest?.('textarea, input')
  const temSel = !!(window.getSelection?.()?.toString() || '')
  const menu = document.createElement('div')
  menu.className = 'dg-ctx-menu'
  menu.setAttribute('role', 'menu')
  menu.appendChild(item('Copiar', () => copiarSel(), !temSel && !editavel))
  menu.appendChild(item('Colar', () => colarEm(campo || alvo), !editavel))
  menu.appendChild(item('Recortar', () => execCmd('cut'), !editavel || !temSel))
  const sep = document.createElement('div')
  sep.className = 'dg-ctx-sep'
  menu.appendChild(sep)
  menu.appendChild(
    item('Selecionar tudo', () => {
      if (campo) {
        campo.focus()
        campo.select()
      } else {
        const range = document.createRange()
        const root = alvo?.closest?.('.msg, .chat-messages, #chat-messages') || alvo
        if (root) {
          range.selectNodeContents(root)
          const sel = window.getSelection()
          sel.removeAllRanges()
          sel.addRange(range)
        }
      }
    }, false)
  )
  document.body.appendChild(menu)
  const pad = 6
  const rect = menu.getBoundingClientRect()
  let left = x
  let top = y
  if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad
  if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad
  menu.style.left = Math.max(pad, left) + 'px'
  menu.style.top = Math.max(pad, top) + 'px'
  menuEl = menu
}

export function ligarContextMenuDg() {
  if (document.documentElement.dataset.dgCtxMenu === '1') return
  document.documentElement.dataset.dgCtxMenu = '1'
  document.addEventListener(
    'contextmenu',
    (e) => {
      const t = e.target
      if (!t || !(t instanceof Element)) return
      // Nao sobrescrever menus nativos da arvore / terminais xterm
      if (t.closest('.xterm, .tree-ctx-menu, .agent-chat-menu, .dg-ctx-menu')) return
      const zona = t.closest(
        '#chat-messages, #chat-input, #chat-panel, #agent-output, #agent-trace, #analysis-content, .msg, textarea, input[type="text"], input:not([type]), [contenteditable="true"]'
      )
      if (!zona) return
      e.preventDefault()
      abrir(e.clientX, e.clientY, t)
    },
    true
  )
  document.addEventListener('click', () => fechar())
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fechar()
  })
  window.addEventListener('blur', () => fechar())
}
