(function () {
  const api = window.api || {}
  let regras = []
  let dragId = null

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }
  function ensureHost() {
    if (document.getElementById('regras-gerais-box')) return
    const host = document.querySelector('#modal-config .modal-box, #modal-config') || document.querySelector('#configuracoes, .painel-config, [data-painel="config"]') || document.body
    const box = document.createElement('section')
    box.id = 'regras-gerais-box'
    box.className = 'regras-gerais'
    box.setAttribute('aria-label', 'Regras Gerais')
    box.innerHTML = '' +
      '<header class="regras-gerais__header">' +
        '<div class="regras-gerais__title-group">' +
          '<h2>Regras Gerais</h2>' +
          '<span id="rg-count" class="regras-gerais__badge-count">0 ativas</span>' +
        '</div>' +
        '<p class="regras-gerais__subtitle">Aplicadas a todos os agentes, skills e ferramentas do DG Editor.</p>' +
      '</header>' +
      '<ul id="rg-list" class="regras-gerais__list" role="list" aria-label="Lista de regras"></ul>' +
      '<form id="rg-form" class="regra-nova">' +
        '<input id="rg-titulo" name="titulo" placeholder="Título da regra" aria-label="Título da regra" />' +
        '<textarea id="rg-desc" name="descricao" placeholder="Descreva a regra..." rows="2" aria-label="Descrição da regra"></textarea>' +
        '<button type="submit">+ Adicionar regra</button>' +
      '</form>'
    host.appendChild(box)
    document.getElementById('rg-form').addEventListener('submit', (e) => { e.preventDefault(); add() })
    const list = document.getElementById('rg-list')
    list.addEventListener('click', onListClick)
    list.addEventListener('change', onListChange)
    list.addEventListener('keydown', onListKeydown)
    list.addEventListener('dragstart', onDragStart)
    list.addEventListener('dragover', onDragOver)
    list.addEventListener('dragleave', onDragLeave)
    list.addEventListener('drop', onDrop)
    list.addEventListener('dragend', onDragEnd)
  }

  function badgeText() {
    const n = regras.filter((r) => r.ativo !== false).length
    const el = document.getElementById('rg-count')
    if (el) el.textContent = n + (n === 1 ? ' ativa' : ' ativas')
  }

  function render() {
    const list = document.getElementById('rg-list')
    if (!list) return
    list.innerHTML = regras.map((r, i) => {
      const ativa = r.ativo !== false
      return '' +
        '<li class="regra-card" role="listitem" data-id="' + esc(r.id) + '" draggable="true">' +
          '<span class="regra-card__handle" tabindex="0" role="button" aria-label="Reordenar ' + esc(r.titulo) + '" title="Reordenar (arraste ou use ↑↓)">⠿</span>' +
          '<span class="regra-card__index" aria-hidden="true">' + (i + 1) + '</span>' +
          '<div class="regra-card__content">' +
            '<div class="regra-card__title">' +
              '<label><input type="checkbox" data-action="toggle" data-id="' + esc(r.id) + '"' + (ativa ? ' checked' : '') + ' aria-label="Ativar regra ' + esc(r.titulo) + '"> ' + esc(r.titulo) + '</label>' +
              (ativa ? ' <span class="regra-card__badge">ativa</span>' : '') +
            '</div>' +
            '<div class="regra-card__desc">' + esc(r.descricao) + '</div>' +
            '<div class="regra-card__editor">' +
              '<input name="titulo" value="' + esc(r.titulo) + '" aria-label="Editar título" />' +
              '<textarea name="descricao" rows="2" aria-label="Editar descrição">' + esc(r.descricao) + '</textarea>' +
              '<div class="regra-card__editor-actions">' +
                '<button type="button" class="btn-save" data-action="save-edit" data-id="' + esc(r.id) + '">Salvar</button>' +
                '<button type="button" class="btn-cancel" data-action="cancel-edit" data-id="' + esc(r.id) + '">Cancelar</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="regra-card__actions">' +
            '<button type="button" class="rg-icon-btn" data-action="edit" data-id="' + esc(r.id) + '" title="Editar" aria-label="Editar ' + esc(r.titulo) + '">✎</button>' +
            '<button type="button" class="rg-icon-btn rg-icon-btn--danger" data-action="remove" data-id="' + esc(r.id) + '" title="Remover" aria-label="Remover ' + esc(r.titulo) + '">🗑</button>' +
          '</div>' +
        '</li>'
    }).join('')
    badgeText()
  }

  function renumber() {
    document.querySelectorAll('#rg-list .regra-card__index').forEach((el, i) => { el.textContent = String(i + 1) })
  }

  async function carregar() {
    try {
      const r = await api.invoke('dg:regrasgerais:listar')
      regras = (r && r.regras) || (Array.isArray(r) ? r : []) || []
      render()
    } catch (_) {}
  }

  async function salvar() {
    try { await api.invoke('dg:regrasgerais:salvar', regras) } catch (_) {}
  }

  async function persistOrderFromDom() {
    const ids = [...document.querySelectorAll('#rg-list .regra-card')].map((el) => el.dataset.id)
    const map = new Map(regras.map((r) => [r.id, r]))
    const next = ids.map((id) => map.get(id)).filter(Boolean)
    regras.forEach((r) => { if (!ids.includes(r.id)) next.push(r) })
    regras = next
    renumber()
    badgeText()
    try {
      const res = await api.invoke('dg:regrasgerais:reordenar', ids)
      if (!res || res.ok === false) await salvar()
    } catch (_) { await salvar() }
  }

  function closeEditing(exceptId) {
    document.querySelectorAll('#rg-list .regra-card.is-editing').forEach((card) => {
      if (exceptId && card.dataset.id === exceptId) return
      card.classList.remove('is-editing')
      const r = regras.find((x) => x.id === card.dataset.id)
      if (r) {
        const ti = card.querySelector('.regra-card__editor input[name="titulo"]')
        const de = card.querySelector('.regra-card__editor textarea[name="descricao"]')
        if (ti) ti.value = r.titulo
        if (de) de.value = r.descricao
      }
    })
  }

  function onListClick(e) {
    const btn = e.target.closest('[data-action]')
    if (!btn) return
    const id = btn.dataset.id
    const action = btn.dataset.action
    if (action === 'remove') {
      const r = regras.find((x) => x.id === id)
      if (!r) return
      if (!confirm('Remover a regra "' + r.titulo + '"?')) return
      regras = regras.filter((x) => x.id !== id)
      render(); salvar(); return
    }
    if (action === 'edit') {
      closeEditing(id)
      const card = btn.closest('.regra-card')
      if (!card) return
      card.classList.add('is-editing')
      const input = card.querySelector('.regra-card__editor input[name="titulo"]')
      if (input) { input.focus(); input.select() }
      return
    }
    if (action === 'cancel-edit') { closeEditing(null); return }
    if (action === 'save-edit') {
      const card = btn.closest('.regra-card')
      const r = regras.find((x) => x.id === id)
      if (!card || !r) return
      const ti = card.querySelector('.regra-card__editor input[name="titulo"]')
      const de = card.querySelector('.regra-card__editor textarea[name="descricao"]')
      const titulo = (ti && ti.value || '').trim()
      const descricao = (de && de.value || '').trim()
      if (!titulo) { ti && ti.focus(); return }
      r.titulo = titulo; r.descricao = descricao
      card.classList.remove('is-editing')
      render(); salvar(); return
    }
  }

  function onListChange(e) {
    const el = e.target
    if (el && el.dataset && el.dataset.action === 'toggle') {
      const r = regras.find((x) => x.id === el.dataset.id)
      if (r) { r.ativo = !!el.checked; render(); salvar() }
    }
  }

  function onListKeydown(e) {
    const handle = e.target.closest('.regra-card__handle')
    if (handle && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      const card = handle.closest('.regra-card')
      const list = document.getElementById('rg-list')
      if (!card || !list) return
      if (e.key === 'ArrowUp' && card.previousElementSibling) list.insertBefore(card, card.previousElementSibling)
      if (e.key === 'ArrowDown' && card.nextElementSibling) list.insertBefore(card.nextElementSibling, card)
      handle.focus(); renumber(); persistOrderFromDom(); return
    }
    const card = e.target.closest('.regra-card.is-editing')
    if (!card) return
    if (e.key === 'Escape') { e.preventDefault(); closeEditing(null) }
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault(); const save = card.querySelector('[data-action="save-edit"]'); if (save) save.click()
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault(); const save = card.querySelector('[data-action="save-edit"]'); if (save) save.click()
    }
  }

  function onDragStart(e) {
    const handle = e.target.closest('.regra-card__handle')
    const card = e.target.closest('.regra-card')
    if (!card) return
    if (!handle && !e.target.classList.contains('regra-card__handle')) { e.preventDefault(); return }
    dragId = card.dataset.id
    card.classList.add('is-dragging')
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId || '') } catch (_) {}
  }
  function onDragOver(e) {
    e.preventDefault()
    const target = e.target.closest('.regra-card')
    if (!target || target.dataset.id === dragId) return
    document.querySelectorAll('.regra-card.is-drag-over').forEach((el) => el.classList.remove('is-drag-over'))
    target.classList.add('is-drag-over')
    try { e.dataTransfer.dropEffect = 'move' } catch (_) {}
  }
  function onDragLeave(e) {
    const target = e.target.closest('.regra-card')
    if (target) target.classList.remove('is-drag-over')
  }
  function onDrop(e) {
    e.preventDefault()
    const target = e.target.closest('.regra-card')
    const list = document.getElementById('rg-list')
    const dragged = list && dragId ? list.querySelector('.regra-card[data-id="' + dragId + '"]') : null
    document.querySelectorAll('.regra-card.is-drag-over').forEach((el) => el.classList.remove('is-drag-over'))
    if (!target || !dragged || target === dragged) return
    const rect = target.getBoundingClientRect()
    const after = e.clientY > rect.top + rect.height / 2
    if (after) target.parentNode.insertBefore(dragged, target.nextSibling)
    else target.parentNode.insertBefore(dragged, target)
    renumber()
    persistOrderFromDom()
  }
  function onDragEnd() {
    dragId = null
    document.querySelectorAll('.regra-card.is-dragging,.regra-card.is-drag-over').forEach((el) => el.classList.remove('is-dragging','is-drag-over'))
  }

  function add() {
    const t = (document.getElementById('rg-titulo').value || '').trim()
    const d = (document.getElementById('rg-desc').value || '').trim()
    if (!t) { document.getElementById('rg-titulo').focus(); return }
    regras.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), titulo: t, descricao: d, ativo: true, criadoEm: new Date().toISOString() })
    document.getElementById('rg-titulo').value = ''
    document.getElementById('rg-desc').value = ''
    render(); salvar()
  }

  function init() { ensureHost(); carregar() }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()

