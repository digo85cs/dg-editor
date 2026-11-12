/**
 * Cursor Parity v1 — Plan / Apply / Restore / checklist no fio do chat.
 */

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Cartao de plano com checklist + botao Implementar plano.
 * @param {HTMLElement} area
 * @param {{ passos?: Array<{id:string,texto:string,feito?:boolean}>, texto?: string }} plano
 * @param {{ onImplementar?: (soProximo:boolean) => void, onMarcar?: (id:string, feito:boolean) => void }} handlers
 */
export function renderChatPlanoCard(area, plano, handlers) {
  if (!area) return null
  let card = area.querySelector('#chat-plano-card')
  const passos = Array.isArray(plano?.passos) ? plano.passos : []
  if (!passos.length) {
    if (card) card.remove()
    return null
  }
  if (!card) {
    card = document.createElement('div')
    card.id = 'chat-plano-card'
    card.className = 'chat-parity-card chat-plano-card'
    card.setAttribute('role', 'region')
    card.setAttribute('aria-label', 'Plano do agente')
    area.appendChild(card)
  }
  const feitos = passos.filter((p) => p.feito).length
  card.innerHTML = ''
  const head = document.createElement('div')
  head.className = 'chat-parity-head'
  head.innerHTML =
    '<strong>Plano</strong> <span class="muted">' + feitos + '/' + passos.length + '</span>'
  card.appendChild(head)

  const list = document.createElement('ul')
  list.className = 'chat-plano-passos'
  for (const p of passos) {
    const li = document.createElement('li')
    if (p.feito) li.classList.add('is-feito')
    const lab = document.createElement('label')
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = !!p.feito
    cb.addEventListener('change', () => {
      if (handlers && typeof handlers.onMarcar === 'function') handlers.onMarcar(p.id, cb.checked)
    })
    const span = document.createElement('span')
    span.textContent = p.texto
    lab.appendChild(cb)
    lab.appendChild(span)
    li.appendChild(lab)
    list.appendChild(li)
  }
  card.appendChild(list)

  const acoes = document.createElement('div')
  acoes.className = 'chat-parity-acoes'
  const btnAll = document.createElement('button')
  btnAll.type = 'button'
  btnAll.className = 'btn-small chat-parity-primary'
  btnAll.textContent = 'Implementar plano'
  btnAll.dataset.parity = 'implementar-plano'
  btnAll.addEventListener('click', () => {
    if (handlers && typeof handlers.onImplementar === 'function') handlers.onImplementar(false)
  })
  const btnNext = document.createElement('button')
  btnNext.type = 'button'
  btnNext.className = 'btn-small'
  btnNext.textContent = 'Proximo passo'
  btnNext.dataset.parity = 'proximo-passo'
  btnNext.addEventListener('click', () => {
    if (handlers && typeof handlers.onImplementar === 'function') handlers.onImplementar(true)
  })
  acoes.appendChild(btnAll)
  acoes.appendChild(btnNext)
  card.appendChild(acoes)
  return card
}

/**
 * Cartao Apply no fio do chat.
 * @param {HTMLElement} area
 * @param {Array<{id:string,path:string,unifiedDiff?:string}>} propostas
 * @param {{ onAplicarTodas?: () => void, onRevisar?: () => void, onAplicarUma?: (id:string) => void }} handlers
 */
export function renderChatApplyCard(area, propostas, handlers) {
  if (!area) return null
  let card = area.querySelector('#chat-apply-card')
  const lista = Array.isArray(propostas) ? propostas : []
  if (!lista.length) {
    if (card) card.remove()
    return null
  }
  if (!card) {
    card = document.createElement('div')
    card.id = 'chat-apply-card'
    card.className = 'chat-parity-card chat-apply-card'
    card.setAttribute('role', 'region')
    card.setAttribute('aria-label', 'Propostas para aplicar')
    area.appendChild(card)
  }
  card.innerHTML = ''
  const head = document.createElement('div')
  head.className = 'chat-parity-head'
  head.innerHTML = '<strong>' + lista.length + ' proposta(s)</strong> <span class="muted">Apply</span>'
  card.appendChild(head)

  const ul = document.createElement('ul')
  ul.className = 'chat-apply-lista'
  for (const p of lista) {
    const li = document.createElement('li')
    const add = (String(p.unifiedDiff || '').match(/^\+/gm) || []).length
    const del = (String(p.unifiedDiff || '').match(/^-/gm) || []).length
    li.innerHTML =
      '<code>' +
      esc(p.path) +
      '</code> <span class="muted">+' +
      Math.max(0, add - 1) +
      '/-' +
      Math.max(0, del - 1) +
      '</span>'
    const btnOne = document.createElement('button')
    btnOne.type = 'button'
    btnOne.className = 'btn-small'
    btnOne.textContent = 'Aplicar'
    btnOne.dataset.parity = 'aplicar-uma'
    btnOne.addEventListener('click', () => {
      if (handlers && typeof handlers.onAplicarUma === 'function') handlers.onAplicarUma(p.id)
    })
    li.appendChild(btnOne)
    ul.appendChild(li)
  }
  card.appendChild(ul)

  const acoes = document.createElement('div')
  acoes.className = 'chat-parity-acoes'
  const btnAll = document.createElement('button')
  btnAll.type = 'button'
  btnAll.className = 'btn-small chat-parity-primary'
  btnAll.textContent = 'Aplicar todas'
  btnAll.dataset.parity = 'aplicar-todas'
  btnAll.addEventListener('click', () => {
    if (handlers && typeof handlers.onAplicarTodas === 'function') handlers.onAplicarTodas()
  })
  const btnRev = document.createElement('button')
  btnRev.type = 'button'
  btnRev.className = 'btn-small'
  btnRev.textContent = 'Revisar diffs'
  btnRev.dataset.parity = 'revisar'
  btnRev.addEventListener('click', () => {
    if (handlers && typeof handlers.onRevisar === 'function') handlers.onRevisar()
  })
  acoes.appendChild(btnAll)
  acoes.appendChild(btnRev)
  card.appendChild(acoes)
  return card
}

/**
 * Faixa Desfazer apos Apply.
 * @param {HTMLElement} area
 * @param {{ arquivos?: string[], onDesfazer?: () => void }} opt
 */
export function renderChatRestoreStrip(area, opt) {
  if (!area) return null
  let strip = area.querySelector('#chat-restore-strip')
  if (!strip) {
    strip = document.createElement('div')
    strip.id = 'chat-restore-strip'
    strip.className = 'chat-parity-card chat-restore-strip'
    strip.setAttribute('role', 'status')
    area.appendChild(strip)
  }
  const n = Array.isArray(opt?.arquivos) ? opt.arquivos.length : 0
  strip.innerHTML = ''
  const txt = document.createElement('span')
  txt.textContent =
    n > 0
      ? 'Apply concluido (' + n + ' arquivo' + (n === 1 ? '' : 's') + ').'
      : 'Apply concluido.'
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'btn-small'
  btn.textContent = 'Desfazer (restore)'
  btn.dataset.parity = 'restore'
  btn.addEventListener('click', () => {
    if (opt && typeof opt.onDesfazer === 'function') opt.onDesfazer()
  })
  strip.appendChild(txt)
  strip.appendChild(btn)
  strip.hidden = false
  return strip
}

export function ocultarChatRestoreStrip(area) {
  const strip = area && area.querySelector ? area.querySelector('#chat-restore-strip') : null
  if (strip) strip.hidden = true
}

export function limparChatParityCards(area) {
  if (!area) return
  ;['#chat-plano-card', '#chat-apply-card'].forEach((sel) => {
    const el = area.querySelector(sel)
    if (el) el.remove()
  })
}
