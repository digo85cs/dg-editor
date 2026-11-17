// menubar.js — menubar da titlebar frameless (menus dropdown).
// Extraído de app.js. executarComando/acaoEditar injetados via configurarMenubar().
import { MENUS_BARRA } from './menubar-dados.js'
import { executarComandoLocal } from '../../comandos.js'

let deps = {}

/** Registra callbacks do app.js. Chamar uma vez no boot. */
export function configurarMenubar(d) {
  deps = d || {}
}

export function fecharMenubar() {
  const bar = document.getElementById('menubar')
  if (!bar) return
  bar.dataset.open = ''
  bar.querySelectorAll('.mb-btn').forEach((b) => b.setAttribute('aria-expanded', 'false'))
  bar.querySelectorAll('.mb-dropdown').forEach((p) => {
    p.hidden = true
  })
}

export function abrirMenuPainel(nome) {
  const bar = document.getElementById('menubar')
  if (!bar) return
  bar.dataset.open = nome
  bar.querySelectorAll('.mb-btn').forEach((b) => {
    const on = b.getAttribute('data-menu') === nome
    b.setAttribute('aria-expanded', on ? 'true' : 'false')
  })
  bar.querySelectorAll('.mb-dropdown').forEach((p) => {
    p.hidden = p.getAttribute('data-menu-panel') !== nome
  })
}

function executarAcaoMenu(id, editCmd) {
  if (editCmd) {
    deps.acaoEditar?.(editCmd)
    return
  }
  if (executarComandoLocal(id)) return
  deps.executarComando?.(id)
}

function popularPainelMenu(panel, itens) {
  panel.textContent = ''
  for (const it of itens) {
    if (it.sep) {
      const hr = document.createElement('div')
      hr.className = 'mb-sep'
      hr.setAttribute('role', 'separator')
      panel.appendChild(hr)
      continue
    }
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'mb-option'
    btn.setAttribute('role', 'menuitem')
    btn.dataset.acao = it.id
    if (it.edit) btn.dataset.edit = it.edit
    const lab = document.createElement('span')
    lab.textContent = it.label
    btn.appendChild(lab)
    if (it.accel) {
      const acc = document.createElement('span')
      acc.className = 'mb-accel'
      acc.textContent = it.accel
      btn.appendChild(acc)
    }
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      fecharMenubar()
      executarAcaoMenu(it.id, it.edit)
    })
    panel.appendChild(btn)
  }
}

export function initMenubar() {
  const bar = document.getElementById('menubar')
  if (!bar || bar.dataset.ready === '1') return
  bar.dataset.ready = '1'

  for (const [nome, itens] of Object.entries(MENUS_BARRA)) {
    const panel = bar.querySelector('[data-menu-panel="' + nome + '"]')
    if (panel) popularPainelMenu(panel, itens)
  }

  bar.querySelectorAll('.mb-btn').forEach((btn) => {
    const nome = btn.getAttribute('data-menu')
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (bar.dataset.open === nome) fecharMenubar()
      else abrirMenuPainel(nome)
    })
    btn.addEventListener('mouseenter', () => {
      if (bar.dataset.open && bar.dataset.open !== nome) abrirMenuPainel(nome)
    })
  })

  document.addEventListener('mousedown', (e) => {
    if (!bar.dataset.open) return
    if (bar.contains(e.target)) return
    fecharMenubar()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && bar.dataset.open) {
      fecharMenubar()
      e.stopPropagation()
    }
  })

  try {
    window.api.on('menu:acao', (_ev, id) => {
      if (!id) return
      executarAcaoMenu(String(id))
    })
  } catch (e) {
    console.warn('[menubar] menu:acao:', e)
  }
}
