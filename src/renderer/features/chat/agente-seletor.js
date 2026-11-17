import { state } from '../../state/app-state.js'

const $ = (id) => document.getElementById(id)

let deps = {
  definirSkillChat: () => {},
  focarPainelIa: () => {},
  executarAgentUi: () => {},
  agendarSalvarWorkspace: () => {}
}

export function configurarAgenteSeletor(d) {
  deps = { ...deps, ...d }
}

const chatModes = [
  { id: 'auto', label: 'Auto' },
  { id: 'code', label: 'Agent' },
  { id: 'plan', label: 'Plan' },
  { id: 'ask', label: 'Ask' },
  { id: 'debug', label: 'Debug' }
]
const agentesGratisPadrao = [
  { id: 'free-auto', nome: 'Auto Free', tipo: 'free' },
  { id: 'free-coder', nome: 'Coder Free', tipo: 'free' },
  { id: 'free-assist', nome: 'Assist Free', tipo: 'free' },
  { id: 'free-reason', nome: 'Reason Free', tipo: 'free' },
  { id: 'free-architect', nome: 'Architect Free', tipo: 'free' },
  { id: 'free-debugger', nome: 'Debugger Free', tipo: 'free' },
  { id: 'free-reviewer', nome: 'Reviewer Free', tipo: 'free' }
]
let chatAgentRequestId = 0

export async function carregarOpcoesAgenteChat(raiz = state.pastaAtual) {
  const agentSel = document.getElementById('chat-agent-select')
  if (!agentSel) return
  const requestId = ++chatAgentRequestId
  let list = []
  if (raiz) {
    try {
      const r = await window.api.invoke('agente:listar', raiz)
      list = r?.agentes || []
    } catch {}
  }
  if (requestId !== chatAgentRequestId || !agentSel.isConnected) return

  const preferido = (() => {
    try { return localStorage.getItem('dg-chat-agent') || agentSel.value || 'auto' } catch { return agentSel.value || 'auto' }
  })()
  agentSel.replaceChildren()
  const autoOpt = document.createElement('option')
  autoOpt.value = 'auto'
  autoOpt.textContent = 'Automático'
  agentSel.appendChild(autoOpt)

  const grpFree = document.createElement('optgroup')
  grpFree.label = 'Agentes gratuitos'
  for (const a of agentesGratisPadrao) {
    const o = document.createElement('option')
    o.value = a.id
    o.textContent = a.nome
    grpFree.appendChild(o)
  }
  agentSel.appendChild(grpFree)

  const grpLocal = document.createElement('optgroup')
  grpLocal.label = 'Agentes locais'
  for (const a of list) {
    const o = document.createElement('option')
    o.value = a.id
    o.textContent = a.nome || a.id
    grpLocal.appendChild(o)
  }
  if (grpLocal.children.length) agentSel.appendChild(grpLocal)
  agentSel.value = Array.from(agentSel.options).some((o) => o.value === preferido) ? preferido : 'auto'
  const agentBtn = document.getElementById('btn-chat-agent')
  if (agentBtn) {
    agentBtn.title = 'Agente: ' + (agentSel.selectedOptions?.[0]?.textContent || agentSel.value)
  }
}

export function initChatAgentSelector() {
  const agentSel = document.getElementById('chat-agent-select')
  const modeSel = document.getElementById('chat-mode-select')
  const btnMais = document.getElementById('btn-chat-mais')
  const menu = document.getElementById('chat-mais-menu')
  const maisWrap = btnMais?.closest('.chat-more-wrap')
  if (!agentSel || !modeSel) return
  if (agentSel.dataset.wired === '1') {
    void carregarOpcoesAgenteChat()
    return
  }
  agentSel.dataset.wired = '1'
  if (!modeSel.options.length) {
    for (const m of chatModes) {
      const o = document.createElement('option')
      o.value = m.id
      o.textContent = m.label
      modeSel.appendChild(o)
    }
  }
  if (btnMais && menu && maisWrap && menu.dataset.wired !== '1') {
    menu.dataset.wired = '1'
    const setMenuOpen = (open) => {
      menu.hidden = !open
      btnMais.setAttribute('aria-expanded', open ? 'true' : 'false')
    }
    const itemAuto = document.createElement('button')
    itemAuto.type = 'button'
    itemAuto.className = 'chat-more-item'
    itemAuto.setAttribute('role', 'menuitemcheckbox')
    function atualizarItemAuto() {
      try {
        const v = localStorage.getItem('dg-chat-autoapprove') === '1'
        itemAuto.textContent = v ? 'Desativar aprovação automática' : 'Ativar aprovação automática'
        itemAuto.setAttribute('aria-checked', v ? 'true' : 'false')
      } catch {
        itemAuto.textContent = 'Ativar aprovação automática'
        itemAuto.setAttribute('aria-checked', 'false')
      }
    }
    atualizarItemAuto()
    itemAuto.addEventListener('click', (e) => {
      e.stopPropagation()
      try {
        const v = localStorage.getItem('dg-chat-autoapprove') === '1'
        if (v) localStorage.removeItem('dg-chat-autoapprove')
        else localStorage.setItem('dg-chat-autoapprove', '1')
      } catch {}
      atualizarItemAuto()
      setMenuOpen(false)
      btnMais.focus()
    })
    const itemAvaliar = document.createElement('button')
    itemAvaliar.type = 'button'
    itemAvaliar.className = 'chat-more-item'
    itemAvaliar.setAttribute('role', 'menuitem')
    itemAvaliar.textContent = 'Avaliar modelo'
    itemAvaliar.addEventListener('click', (e) => {
      e.stopPropagation()
      setMenuOpen(false)
      document.getElementById('btn-brain-avaliar')?.click()
    })
    const itemAuditar = document.createElement('button')
    itemAuditar.type = 'button'
    itemAuditar.className = 'chat-more-item'
    itemAuditar.setAttribute('role', 'menuitem')
    itemAuditar.textContent = 'Auto auditoria'
    itemAuditar.addEventListener('click', (e) => {
      e.stopPropagation()
      setMenuOpen(false)
      document.getElementById('btn-auditar')?.click()
    })
    const itemLimparSkill = document.createElement('button')
    itemLimparSkill.type = 'button'
    itemLimparSkill.className = 'chat-more-item'
    itemLimparSkill.setAttribute('role', 'menuitem')
    itemLimparSkill.textContent = 'Remover skill ativa'
    itemLimparSkill.addEventListener('click', (e) => {
      e.stopPropagation()
      setMenuOpen(false)
      deps.definirSkillChat('', '')
    })
    menu.replaceChildren(itemAuto, itemAvaliar, itemAuditar, itemLimparSkill)
    const mk = (label, fn) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'chat-more-item'
      b.setAttribute('role', 'menuitem')
      b.textContent = label
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        setMenuOpen(false)
        fn()
      })
      return b
    }
    menu.appendChild(mk('Orquestrar', () => {
      const ai = $('agent-input')
      const ci = $('chat-input')
      if (ai && ci && !ai.value.trim() && ci.value.trim()) ai.value = ci.value
      deps.focarPainelIa('agent')
      void deps.executarAgentUi(true)
    }))
    menu.appendChild(mk('Verificar após turno', () => {
      const v = document.getElementById('agent-verify-loop')
      if (v) {
        v.checked = !v.checked
        if (window.dgToast) window.dgToast(v.checked ? 'Verificar ligado' : 'Verificar desligado', 'ok')
      }
    }))
    menu.appendChild(mk('Desfazer apply', () => document.getElementById('btn-agent-undo')?.click()))
    btnMais.addEventListener('click', (e) => {
      e.stopPropagation()
      const open = btnMais.getAttribute('aria-expanded') !== 'true'
      if (open) atualizarItemAuto()
      setMenuOpen(open)
      if (open) itemAuto.focus()
    })
    document.addEventListener('click', (ev) => {
      if (!maisWrap.contains(ev.target)) setMenuOpen(false)
    })
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || menu.hidden) return
      setMenuOpen(false)
      btnMais.focus()
      ev.stopPropagation()
    })
  }
  void carregarOpcoesAgenteChat()
  try {
    const vm = localStorage.getItem('dg-chat-mode')
    if (vm && Array.from(modeSel.options).some((o) => o.value === vm)) modeSel.value = vm
  } catch {}
  const planToggle = document.getElementById('agent-plan-mode')
  const syncPlanFromMode = () => {
    if (!planToggle) return
    planToggle.checked = modeSel.value === 'plan'
  }
  syncPlanFromMode()
  const syncCtxTitles = () => {
    const modeBtn = document.getElementById('btn-chat-mode')
    const agentBtn = document.getElementById('btn-chat-agent')
    if (modeBtn) modeBtn.title = 'Modo: ' + (modeSel.selectedOptions?.[0]?.textContent || modeSel.value)
    if (agentBtn) agentBtn.title = 'Agente: ' + (agentSel.selectedOptions?.[0]?.textContent || agentSel.value)
  }
  agentSel.addEventListener('change', () => {
    try { localStorage.setItem('dg-chat-agent', agentSel.value) } catch {}
    sincronizarAgenteSelects('chat')
    syncCtxTitles()
  })
  modeSel.addEventListener('change', () => {
    try { localStorage.setItem('dg-chat-mode', modeSel.value) } catch {}
    syncPlanFromMode()
    syncCtxTitles()
    deps.agendarSalvarWorkspace()
  })
  syncCtxTitles()
  planToggle?.addEventListener('change', () => {
    if (planToggle.checked) {
      modeSel.value = 'plan'
      try { localStorage.setItem('dg-chat-mode', 'plan') } catch {}
    } else if (modeSel.value === 'plan') {
      modeSel.value = 'code'
      try { localStorage.setItem('dg-chat-mode', 'code') } catch {}
    }
  })
}

export function atualizarStatusAgent(modelo, ms, fila) {
  const el = $('sb-agent')
  if (!el) return
  const partes = []
  if (modelo) partes.push(modelo)
  if (ms != null) partes.push(ms + 'ms')
  if (fila) {
    if (fila.ocupado) partes.push('fila●')
    else if (fila.tamanho) partes.push('fila:' + fila.tamanho)
  }
  el.textContent = partes.length ? 'Agent: ' + partes.join(' · ') : 'Agent: —'
  el.title = partes.length ? 'Agente: ' + partes.join(' · ') : 'Agente: ocioso'
}

export async function carregarAgentesUi() {
  const sel = $('agent-select')
  if (!sel || !state.pastaAtual) return
  const r = await window.api.invoke('agente:listar', state.pastaAtual)
  const cur = sel.value || document.getElementById('chat-agent-select')?.value
  sel.innerHTML = ''
  for (const a of r?.agentes || []) {
    const o = document.createElement('option')
    o.value = a.id
    o.textContent = a.nome || a.id
    sel.appendChild(o)
  }
  if (cur && Array.from(sel.options).some((o) => o.value === cur)) sel.value = cur
  sincronizarAgenteSelects('agent')
  void carregarOpcoesAgenteChat()
  const st = await window.api.invoke('agente:fila-status')
  const fs = $('agent-fila-status')
  if (fs && st) {
    fs.textContent = st.ocupado
      ? 'fila: ocupado (' + st.tamanho + ')'
      : st.tamanho
        ? 'fila: ' + st.tamanho
        : 'pronto'
  }
  atualizarStatusAgent(null, null, st)
}

export function agenteSelecionadoUi() {
  const chat = document.getElementById('chat-agent-select')?.value
  const adv = document.getElementById('agent-select')?.value
  const v = chat && chat !== 'auto' ? chat : adv
  return v && v !== 'auto' ? v : undefined
}

export function sincronizarAgenteSelects(origem) {
  const chat = document.getElementById('chat-agent-select')
  const adv = document.getElementById('agent-select')
  if (!chat || !adv) return
  if (origem === 'chat' && chat.value) {
    if (Array.from(adv.options).some((o) => o.value === chat.value)) adv.value = chat.value
  } else if (origem === 'agent' && adv.value) {
    if (Array.from(chat.options).some((o) => o.value === adv.value)) chat.value = adv.value
  }
}
