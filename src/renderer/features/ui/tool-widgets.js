// tool-widgets.js — builders DOM puros do painel de ferramentas.
// Extraidos de ferramentas-ui.js (secao/tool-bloco + form de criacao).

/** Secao <section class="tool-bloco"> com titulo e lista de linhas (ou vazio). */
export function blocoFerramenta(nome, linhas) {
  const box = document.createElement('section')
  box.className = 'tool-bloco'
  const h = document.createElement('h4')
  h.textContent = nome
  box.appendChild(h)
  const lista = Array.isArray(linhas) ? linhas : []
  if (!lista.length) {
    const p = document.createElement('p')
    p.className = 'tool-vazio'
    p.textContent = 'Nada por aqui ainda.'
    box.appendChild(p)
    return box
  }
  const ul = document.createElement('ul')
  for (const linha of lista) {
    const li = document.createElement('li')
    li.textContent = linha
    ul.appendChild(li)
  }
  box.appendChild(ul)
  return box
}

/**
 * Formulario de criacao: campos [{key,label,placeholder,tipo?,rows?}] + botao
 * "Criar" que coleta valores e chama onSalvar(vals). Botao desabilita no envio.
 */
export function formCriarFerramenta(titulo, campos, onSalvar) {
  const box = document.createElement('section')
  box.className = 'tool-bloco'
  const h = document.createElement('h4')
  h.textContent = titulo
  box.appendChild(h)
  const form = document.createElement('div')
  form.className = 'tool-criar-form'
  const refs = {}
  for (const c of campos || []) {
    const el = c.tipo === 'textarea' ? document.createElement('textarea') : document.createElement('input')
    if (c.tipo === 'textarea') el.rows = c.rows || 3
    else el.type = 'text'
    el.placeholder = c.placeholder || c.label
    el.setAttribute('aria-label', c.label)
    refs[c.key] = el
    form.appendChild(el)
  }
  const acoes = document.createElement('div')
  acoes.className = 'tool-criar-acoes'
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'btn-small btn-primary'
  btn.textContent = 'Criar'
  btn.addEventListener('click', async () => {
    const vals = {}
    for (const k of Object.keys(refs)) vals[k] = String(refs[k].value || '').trim()
    btn.disabled = true
    try {
      await onSalvar(vals)
    } finally {
      btn.disabled = false
    }
  })
  acoes.appendChild(btn)
  form.appendChild(acoes)
  box.appendChild(form)
  return box
}

/** Invoke IPC tolerante a falha — retorna { ok:false, erro } em vez de throw. */
export async function seguroInvoke(channel, ...args) {
  try {
    return await window.api.invoke(channel, ...args)
  } catch (e) {
    return { ok: false, erro: String(e && e.message ? e.message : e) }
  }
}
