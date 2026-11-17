// context-menu.js — popover de contexto dos ícones do chat (nova conversa,
// anexar, melhorar prompt, modo, agente). Extraído de app.js.
// Callbacks do app.js são injetados via configurarChatCtx().

let deps = {}

/** Registra callbacks do app.js. Chamar antes de initChatIconContext(). */
export function configurarChatCtx(d) {
  deps = d || {}
}

export function initChatIconContext() {
  const pop = document.getElementById('chat-ctx-popover')
  if (!pop || pop.dataset.wired === '1') return
  pop.dataset.wired = '1'
  let ativo = null

  const fechar = () => {
    pop.hidden = true
    pop.replaceChildren()
    if (ativo) {
      ativo.setAttribute('aria-expanded', 'false')
      ativo = null
    }
  }

  const posicionar = (btn) => {
    const host = btn.closest('#chat-panel') || document.body
    if (pop.parentElement !== host) host.appendChild(pop)
    pop.hidden = false
    pop.style.maxHeight = ''
    pop.classList.remove('chat-ctx-popover--up', 'chat-ctx-popover--down')
    const br = btn.getBoundingClientRect()
    const hr = host.getBoundingClientRect()
    const gap = 6
    const pw = Math.min(pop.offsetWidth || 240, hr.width - 16)
    const ph = pop.offsetHeight || 160
    const spaceAbove = br.top - hr.top
    const spaceBelow = hr.bottom - br.bottom
    // Preferir abrir para cima (composer fica na base)
    const abrirCima = spaceAbove >= Math.min(ph + gap, 120) || spaceAbove >= spaceBelow
    pop.classList.add(abrirCima ? 'chat-ctx-popover--up' : 'chat-ctx-popover--down')
    const maxH = Math.max(120, (abrirCima ? spaceAbove : spaceBelow) - gap - 8)
    pop.style.maxHeight = maxH + 'px'
    let top
    if (abrirCima) {
      top = br.top - hr.top - Math.min(ph, maxH) - gap
      if (top < 8) top = 8
    } else {
      top = br.bottom - hr.top + gap
    }
    let left = br.left - hr.left
    const maxLeft = Math.max(8, hr.width - pw - 8)
    if (left > maxLeft) left = maxLeft
    if (left < 8) left = 8
    pop.style.top = top + 'px'
    pop.style.left = left + 'px'
    pop.style.width = pw + 'px'
  }

  const mkBtn = (label, primary, onClick) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = primary ? 'btn-small btn-primary' : 'btn-small'
    b.textContent = label
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      fechar()
      onClick()
    })
    return b
  }

  const mkOption = (label, selected, onClick) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'chat-ctx-option chat-ctx-option--row'
    b.textContent = label
    if (selected) b.setAttribute('aria-selected', 'true')
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      fechar()
      onClick()
    })
    return b
  }

  const abrir = (btn) => {
    const id = btn.getAttribute('data-chat-ctx')
    if (!id) return
    if (ativo === btn && !pop.hidden) {
      fechar()
      return
    }
    // "Mais" já tem menu próprio
    if (id === 'mais') return

    fechar()
    ativo = btn
    btn.setAttribute('aria-expanded', 'true')

    const title = document.createElement('p')
    title.className = 'chat-ctx-popover-title'
    const desc = document.createElement('p')
    desc.className = 'chat-ctx-popover-desc'
    const meta = document.createElement('p')
    meta.className = 'chat-ctx-popover-meta'
    const actions = document.createElement('div')
    actions.className = 'chat-ctx-popover-actions'

    if (id === 'nova') {
      title.textContent = 'Nova conversa'
      desc.textContent = 'Limpa o chat atual e começa outra sessão.'
      actions.appendChild(mkBtn('Criar nova', true, () => deps.novaConversa?.()))
    } else if (id === 'anexar') {
      title.textContent = 'Anexar arquivos'
      desc.textContent = 'Os anexos entram no próximo envio do composer.'
      actions.appendChild(mkBtn('Escolher arquivos', true, () => {
        document.getElementById('chat-anexos-input')?.click()
      }))
    } else if (id === 'prompt') {
      title.textContent = 'Melhorar prompt'
      desc.textContent = 'Abre o assistente para refinar o texto do composer com o modelo local.'
      meta.innerHTML = 'Atalho <kbd>Ctrl+Alt+P</kbd>'
      actions.appendChild(mkBtn('Abrir assistente', true, () => deps.abrirOrientador?.()))
    } else if (id === 'mode') {
      const sel = document.getElementById('chat-mode-select')
      title.textContent = 'Modo'
      desc.textContent = 'Define como o Agent interpreta o pedido.'
      const modos = [
        ['auto', 'Auto'],
        ['code', 'Agent'],
        ['plan', 'Plan'],
        ['ask', 'Ask'],
        ['debug', 'Debug']
      ]
      actions.classList.add('chat-ctx-popover-actions--list')
      for (const [val, label] of modos) {
        actions.appendChild(mkOption(label, sel?.value === val, () => {
          if (!sel) return
          sel.value = val
          sel.dispatchEvent(new Event('change', { bubbles: true }))
          const modeBtn = document.getElementById('btn-chat-mode')
          if (modeBtn) modeBtn.title = 'Modo: ' + label
        }))
      }
    } else if (id === 'agent') {
      const sel = document.getElementById('chat-agent-select')
      title.textContent = 'Agente'
      desc.textContent = 'Escolha um agente (lista). Auto escolhe sozinho.'
      actions.classList.add('chat-ctx-popover-actions--list')
      const opts = sel ? Array.from(sel.options) : []
      const vistos = new Set()
      for (const o of opts) {
        if (!o.value) continue
        const key = String(o.value).toLowerCase()
        if (vistos.has(key)) continue
        vistos.add(key)
        actions.appendChild(mkOption(o.textContent || o.value, sel.value === o.value, () => {
          sel.value = o.value
          sel.dispatchEvent(new Event('change', { bubbles: true }))
          const agentBtn = document.getElementById('btn-chat-agent')
          if (agentBtn) agentBtn.title = 'Agente: ' + (o.textContent || o.value)
        }))
      }
    } else {
      return
    }

    pop.replaceChildren(title, desc)
    if (meta.innerHTML) pop.appendChild(meta)
    pop.appendChild(actions)
    posicionar(btn)
  }

  document.querySelectorAll('.chat-ctx-btn[data-chat-ctx]').forEach((btn) => {
    if (btn.dataset.ctxWired === '1') return
    btn.dataset.ctxWired = '1'
    btn.setAttribute('aria-expanded', 'false')
    btn.addEventListener('click', (e) => {
      const id = btn.getAttribute('data-chat-ctx')
      if (id === 'mais') return
      e.preventDefault()
      e.stopPropagation()
      abrir(btn)
    })
  })

  document.addEventListener('click', (ev) => {
    if (pop.hidden) return
    const t = ev.target
    if (pop.contains(t) || (ativo && ativo.contains(t))) return
    fechar()
  })
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !pop.hidden) {
      fechar()
      ativo?.focus()
    }
  })
  window.dgFecharChatCtx = fechar
}
