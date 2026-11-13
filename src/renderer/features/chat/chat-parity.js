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

/** Colore cada linha do unified diff sem usar innerHTML. */
function marcarLinhasDiff(pre) {
  const texto = pre.textContent || ''
  pre.textContent = ''
  for (const ln of texto.split('\n')) {
    const span = document.createElement('span')
    span.className =
      ln.startsWith('+++') || ln.startsWith('---')
        ? 'dg-diff-meta'
        : ln.startsWith('@@')
          ? 'dg-diff-hunk'
          : ln.startsWith('+')
            ? 'dg-diff-add'
            : ln.startsWith('-')
              ? 'dg-diff-del'
              : 'dg-diff-ctx'
    span.textContent = ln + '\n'
    pre.appendChild(span)
  }
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
  const contarDiff = (p) => {
    const d = String(p.unifiedDiff || '')
    return {
      add: Math.max(0, (d.match(/^\+/gm) || []).length - 1),
      del: Math.max(0, (d.match(/^-/gm) || []).length - 1)
    }
  }
  const totais = lista.reduce(
    (acc, p) => {
      const c = contarDiff(p)
      acc.add += c.add
      acc.del += c.del
      return acc
    },
    { add: 0, del: 0 }
  )
  const head = document.createElement('div')
  head.className = 'chat-parity-head'
  head.innerHTML =
    '<strong>' +
    lista.length +
    ' proposta(s)</strong> <span class="muted">+' +
    totais.add +
    '/-' +
    totais.del +
    ' · Apply</span>'
  card.appendChild(head)

  const LIMITE_INLINE = 12
  const ul = document.createElement('ul')
  ul.className = 'chat-apply-lista'
  for (const p of lista) {
    const li = document.createElement('li')
    const { add, del } = contarDiff(p)
    const linha = document.createElement('div')
    linha.className = 'chat-apply-linha'
    linha.innerHTML =
      '<code>' +
      esc(p.path) +
      '</code> <span class="muted">+' +
      add +
      '/-' +
      del +
      '</span>'
    const btnDiff = document.createElement('button')
    btnDiff.type = 'button'
    btnDiff.className = 'btn-small chat-apply-ver'
    btnDiff.textContent = 'Ver diff'
    btnDiff.dataset.parity = 'ver-diff'
    btnDiff.setAttribute('aria-expanded', 'false')
    const btnOne = document.createElement('button')
    btnOne.type = 'button'
    btnOne.className = 'btn-small'
    btnOne.textContent = 'Aplicar'
    btnOne.dataset.parity = 'aplicar-uma'
    btnOne.addEventListener('click', async () => {
      if (!handlers || typeof handlers.onAplicarUma !== 'function') return
      btnOne.disabled = true
      try {
        await handlers.onAplicarUma(p.id)
      } finally {
        btnOne.disabled = false
      }
    })
    linha.appendChild(btnDiff)
    linha.appendChild(btnOne)
    li.appendChild(linha)

    const diff = String(p.unifiedDiff || '')
    const linhasDiff = diff ? diff.split('\n') : []
    const pre = document.createElement('pre')
    pre.className = 'chat-apply-diff'
    pre.dataset.parity = 'diff'
    const renderDiff = (completo) => {
      if (!diff) {
        pre.textContent = '(sem diff)'
        return
      }
      if (completo || linhasDiff.length <= LIMITE_INLINE) {
        pre.textContent = diff
        return
      }
      pre.textContent =
        linhasDiff.slice(0, LIMITE_INLINE).join('\n') +
        '\n… ' +
        (linhasDiff.length - LIMITE_INLINE) +
        ' linha(s) ocultas'
    }
    // Diff inline imediato quando ha uma unica proposta; varias ficam recolhidas.
    const inline = lista.length === 1
    pre.hidden = !inline
    renderDiff(inline)
    btnDiff.textContent = inline ? 'Ocultar diff' : 'Ver diff'
    btnDiff.setAttribute('aria-expanded', inline ? 'true' : 'false')
    marcarLinhasDiff(pre)
    btnDiff.addEventListener('click', () => {
      pre.hidden = !pre.hidden
      renderDiff(!pre.hidden)
      marcarLinhasDiff(pre)
      btnDiff.setAttribute('aria-expanded', pre.hidden ? 'false' : 'true')
      btnDiff.textContent = pre.hidden ? 'Ver diff' : 'Ocultar diff'
    })
    li.appendChild(pre)
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
