// DG Editor - renderer (IDE Opção B)
import { criarEditor } from './editor-cm.js'

const $ = (id) => document.getElementById(id)

let pastaAtual = null
const pastasRecentes = []
/** @type {Map<string, { expandida: boolean, filhosCarregados: boolean }>} */
const estadoArvore = new Map()
/** Containers .tree-children com listagem IPC em andamento (anti duplo clique). */
const carregandoNos = new WeakSet()
/** @type {{ caminho: string, nome: string, dirty: boolean }[]} */
let abas = []
let abaAtiva = null
/** @type {ReturnType<typeof criarEditor> | null} */
let editor = null
let modoPaleta = 'comandos' // 'comandos' | 'arquivos'
let dirtyResolver = null

const CHEV =
  '<span class="chevron"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></span>'

function pastasPermitidas() {
  return [...pastasRecentes]
}

function nomeArquivo(p) {
  const s = String(p || '').replace(/\//g, '\\')
  const i = s.lastIndexOf('\\')
  return i >= 0 ? s.slice(i + 1) : s
}

function caminhoRelativo(abs) {
  const a = String(abs || '')
  for (const raiz of pastasRecentes) {
    const r = String(raiz)
    if (a === r) return nomeArquivo(r)
    const sep = r.endsWith('\\') || r.endsWith('/') ? '' : '\\'
    if (a.toLowerCase().startsWith((r + sep).toLowerCase())) {
      return a.slice(r.length + sep.length).replace(/\//g, '\\')
    }
  }
  return nomeArquivo(a)
}

function extIcon(nome) {
  const m = String(nome).toLowerCase().match(/\.([a-z0-9]+)$/)
  const ext = m ? m[1] : ''
  const label = (ext || '·').slice(0, 3).toUpperCase()
  return `<span class="file-icon ext-${ext || 'txt'}">${label}</span>`
}

function escapar(s) {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

// ---------- Layout persistido ----------
function carregarLayout() {
  try {
    const raw = localStorage.getItem('dg-layout')
    if (!raw) return
    const L = JSON.parse(raw)
    const app = $('app')
    if (L.sidebarWidth) app.style.setProperty('--dg-sidebar-width', L.sidebarWidth + 'px')
    if (L.rightWidth) app.style.setProperty('--dg-right-panel-width', L.rightWidth + 'px')
    if (L.sidebarCollapsed) app.classList.add('sidebar-collapsed')
    if (L.rightCollapsed) app.classList.add('right-collapsed')
  } catch { /* ignora */ }
}

function salvarLayout() {
  const app = $('app')
  const sw = parseInt(getComputedStyle(app).getPropertyValue('--dg-sidebar-width'), 10) || 260
  const rw = parseInt(getComputedStyle(app).getPropertyValue('--dg-right-panel-width'), 10) || 380
  localStorage.setItem(
    'dg-layout',
    JSON.stringify({
      sidebarWidth: sw,
      rightWidth: rw,
      sidebarCollapsed: app.classList.contains('sidebar-collapsed'),
      rightCollapsed: app.classList.contains('right-collapsed')
    })
  )
}

function initResizers() {
  const bind = (el, kind) => {
    if (!el) return
    let startX = 0
    let startW = 0
    const onMove = (e) => {
      const dx = e.clientX - startX
      if (kind === 'sidebar') {
        const w = Math.min(500, Math.max(200, startW + dx))
        $('app').style.setProperty('--dg-sidebar-width', w + 'px')
      } else {
        const w = Math.min(600, Math.max(320, startW - dx))
        $('app').style.setProperty('--dg-right-panel-width', w + 'px')
      }
    }
    const onUp = () => {
      el.classList.remove('dragging')
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      salvarLayout()
    }
    el.addEventListener('mousedown', (e) => {
      e.preventDefault()
      startX = e.clientX
      const prop = kind === 'sidebar' ? '--dg-sidebar-width' : '--dg-right-panel-width'
      startW = parseInt(getComputedStyle($('app')).getPropertyValue(prop), 10) || (kind === 'sidebar' ? 260 : 380)
      el.classList.add('dragging')
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
    el.addEventListener('dblclick', () => {
      $('app').style.setProperty(
        kind === 'sidebar' ? '--dg-sidebar-width' : '--dg-right-panel-width',
        kind === 'sidebar' ? '260px' : '380px'
      )
      salvarLayout()
    })
  }
  bind($('resize-sidebar'), 'sidebar')
  bind($('resize-right'), 'right')
}

function toggleSidebar(forcar) {
  const app = $('app')
  if (typeof forcar === 'boolean') {
    app.classList.toggle('sidebar-collapsed', !forcar)
  } else {
    app.classList.toggle('sidebar-collapsed')
  }
  salvarLayout()
  setActivityActive('explorer', !app.classList.contains('sidebar-collapsed'))
}

function toggleRight(forcar) {
  const app = $('app')
  if (typeof forcar === 'boolean') {
    app.classList.toggle('right-collapsed', !forcar)
  } else {
    app.classList.toggle('right-collapsed')
  }
  salvarLayout()
}

function setActivityActive(action, on) {
  document.querySelectorAll('.ab-btn').forEach((b) => {
    if (b.dataset.action === action) b.classList.toggle('active', !!on)
  })
}

function initActivityBar() {
  document.querySelectorAll('.ab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.action
      if (a === 'explorer') {
        toggleSidebar()
        setActivityActive('explorer', !$('app').classList.contains('sidebar-collapsed'))
      } else if (a === 'busca') {
        abrirPaletaArquivos()
      } else if (a === 'chat') {
        toggleRight(true)
        ativarAbaDireita('chat')
        setTimeout(() => $('chat-input')?.focus(), 0)
      } else if (a === 'navegador') {
        window.api.invoke('navegador:abrir').catch((e) => console.warn('[navegador]', e))
      } else if (a === 'config') {
        abrirConfig()
      } else if (a === 'tema') {
        alternarTema()
      }
    })
  })
}

function ativarAbaDireita(pane) {
  document.querySelectorAll('.right-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.pane === pane)
  })
  document.querySelectorAll('.right-pane').forEach((p) => {
    p.classList.toggle('active', p.id === 'pane-' + pane)
  })
}

document.querySelectorAll('.right-tab').forEach((t) => {
  t.addEventListener('click', () => ativarAbaDireita(t.dataset.pane))
})

// ---------- Pastas ----------
async function abrirPasta() {
  const r = await window.api.invoke('folder:select')
  if (r.canceled) return
  adicionarPasta(r.path)
  await selecionarPasta(r.path)
}

function adicionarPasta(path) {
  if (!pastasRecentes.includes(path)) pastasRecentes.push(path)
  renderizarPastas()
  salvarPastas()
}

function salvarPastas() {
  localStorage.setItem('dg-pastas', JSON.stringify(pastasRecentes))
}

function carregarPastas() {
  const salvas = localStorage.getItem('dg-pastas')
  if (salvas) {
    try {
      pastasRecentes.push(...JSON.parse(salvas))
    } catch { /* ignora */ }
  }
}

async function selecionarPasta(path) {
  console.time('selecionarPasta')
  pastaAtual = path
  $('chat-title').textContent = nomeArquivo(path)
  $('empty-state')?.remove()
  $('chat-send').disabled = false
  $('btn-reanalyze').classList.remove('hidden')

  // garantir estado no Map SEM re-renderizar
  if (!estadoArvore.has(path)) {
    estadoArvore.set(path, { expandida: true, filhosCarregados: false })
  } else {
    estadoArvore.get(path).expandida = true
  }

  // realce visual do item selecionado (SEM recriar DOM)
  document.querySelectorAll('.tree-root.selected').forEach((el) => el.classList.remove('selected'))
  const raizEl = document.querySelector('.tree-root[data-path="' + CSS.escape(path) + '"]')
  if (raizEl) raizEl.classList.add('selected')

  // se a raiz clicada ainda não tem filhos no DOM, carregar SÓ ela
  if (raizEl) {
    const children = raizEl.querySelector(':scope > .tree-children')
    const chev = raizEl.querySelector('.chevron')
    if (children && children.childElementCount === 0) {
      chev?.classList.add('open')
      children.classList.add('open')
      await carregarFilhos(path, children, 1)
    } else if (children) {
      chev?.classList.add('open')
      children.classList.add('open')
    }
  }

  // 3 chamadas INDEPENDENTES em paralelo
  const [msgs, cached, temRegras] = await Promise.all([
    window.api.invoke('chat:load', path),
    window.api.invoke('analysis:cached', path),
    window.api.invoke('rules:exists', path)
  ])

  renderizarChat(msgs)

  if (cached) {
    renderizarAnalise(cached, true)
  } else {
    $('analysis-content').innerHTML =
      '<p class="muted">Pasta aberta. Clique em <strong>Analisar</strong> quando quiser a análise.</p>'
  }

  if (!temRegras) {
    // fire-and-forget: não bloqueia o clique
    window.api.invoke('rules:create-template', path).catch(() => {})
  }
  console.timeEnd('selecionarPasta')
}

// ---------- Árvore ----------
/**
 * Contexto do chat (pastaAtual / chat-title):
 * muda só aqui — ao selecionar pasta raiz já expandida (clique no nome, não no chevron)
 * ou ao abrir um arquivo. Expandir/retrair árvore NÃO chama isto.
 */
function definirContextoPasta(p) {
  if (!p) return
  pastaAtual = p
  $('chat-title').textContent = nomeArquivo(p)
  $('chat-send').disabled = false
  $('btn-reanalyze').classList.remove('hidden')
}

function raizWorkspaceDe(caminho) {
  const a = String(caminho || '')
  for (const r of pastasRecentes) {
    if (!r) continue
    if (a === r) return r
    const sep = r.endsWith('\\') || r.endsWith('/') ? '' : '\\'
    if (a.toLowerCase().startsWith((r + sep).toLowerCase())) return r
  }
  return pastaAtual
}

async function renderizarPastas() {
  const lista = $('folder-list')
  lista.innerHTML = ''
  if (pastasRecentes.length === 0) {
    lista.innerHTML = '<p class="muted" style="padding:12px">Nenhuma pasta. Clique em + para abrir.</p>'
    return
  }
  for (const p of pastasRecentes) {
    const root = document.createElement('div')
    root.className = 'tree-root' + (p === pastaAtual ? ' selected' : '')
    root.dataset.path = p
    const st = estadoArvore.get(p) || { expandida: false, filhosCarregados: false }
    estadoArvore.set(p, st)

    const header = document.createElement('div')
    header.className = 'tree-root-header'
    header.innerHTML =
      CHEV +
      '<span class="file-icon">📁</span><span class="tab-name" style="overflow:hidden;text-overflow:ellipsis">' +
      escapar(nomeArquivo(p)) +
      '</span>'
    header.title = p
    const chev = header.querySelector('.chevron')
    if (st.expandida) chev.classList.add('open')

    const children = document.createElement('div')
    children.className = 'tree-children' + (st.expandida ? ' open' : '')

    header.addEventListener('click', async (e) => {
      if (carregandoNos.has(children)) return
      const noChevron = !e.target.closest('.chevron')
      // Pasta já expandida + clique no nome/ícone → selecionarPasta (sem re-render).
      if (st.expandida && noChevron && e.target.closest('.tab-name, .file-icon')) {
        selecionarPasta(p)
        return
      }
      // Expandir / retrair: só classe 'open'. NÃO limpar DOM. NÃO mudar chat.
      st.expandida = !st.expandida
      chev.classList.toggle('open', st.expandida)
      children.classList.toggle('open', st.expandida)
      if (!st.expandida) return
      if (children.childElementCount > 0) return
      carregandoNos.add(children)
      try {
        await carregarFilhos(p, children, 1)
      } finally {
        carregandoNos.delete(children)
      }
    })
    root.appendChild(header)
    root.appendChild(children)
    lista.appendChild(root)

    if (st.expandida && children.childElementCount === 0) {
      await carregarFilhos(p, children, 1)
    }
  }
}

async function carregarFilhos(dir, container, nivel) {
  console.time('carregarFilhos')
  try {
    const r = await window.api.invoke('arquivo:listar', dir, pastasPermitidas())
    container.innerHTML = ''
    if (!r.ok) {
      container.innerHTML =
        '<div class="muted" style="padding:4px 12px;font-size:11px">' + escapar(r.erro || 'erro') + '</div>'
      return false
    }
    const st = estadoArvore.get(dir)
    if (st) st.filhosCarregados = true
    for (const ent of r.entradas || []) {
      if (ent.tipo === 'dir') {
        container.appendChild(criarNoDir(ent, nivel))
      } else {
        container.appendChild(criarNoFile(ent, nivel))
      }
    }
    return true
  } catch (e) {
    container.innerHTML =
      '<div class="muted" style="padding:4px 12px;font-size:11px">erro ao listar: ' +
      escapar(String(e && e.message ? e.message : e)) +
      '</div>'
    return false
  } finally {
    console.timeEnd('carregarFilhos')
  }
}

function criarNoDir(ent, nivel) {
  const wrap = document.createElement('div')
  const row = document.createElement('div')
  row.className = 'tree-item'
  row.style.paddingLeft = 8 + nivel * 16 + 'px'
  row.innerHTML = CHEV + '<span class="file-icon">📁</span><span>' + escapar(ent.nome) + '</span>'
  row.title = ent.caminho
  const kids = document.createElement('div')
  kids.className = 'tree-children'
  let aberto = false
  let carregado = false
  row.addEventListener('click', async (e) => {
    e.stopPropagation()
    if (carregandoNos.has(kids)) return
    aberto = !aberto
    row.querySelector('.chevron').classList.toggle('open', aberto)
    kids.classList.toggle('open', aberto)
    if (!aberto) return
    if (carregado || kids.childElementCount > 0) {
      carregado = kids.childElementCount > 0
      return
    }
    carregandoNos.add(kids)
    try {
      carregado = await carregarFilhos(ent.caminho, kids, nivel + 1)
    } finally {
      carregandoNos.delete(kids)
    }
  })
  wrap.appendChild(row)
  wrap.appendChild(kids)
  return wrap
}

function criarNoFile(ent, nivel) {
  const row = document.createElement('div')
  row.className = 'tree-item'
  row.style.paddingLeft = 8 + nivel * 16 + 16 + 'px'
  row.innerHTML = extIcon(ent.nome) + '<span>' + escapar(ent.nome) + '</span>'
  row.title = ent.caminho
  row.dataset.path = ent.caminho
  row.addEventListener('click', (e) => {
    e.stopPropagation()
    if (!ent.editavel) {
      alert('Extensão não editável: ' + ent.nome)
      return
    }
    document.querySelectorAll('.tree-item.active').forEach((el) => el.classList.remove('active'))
    row.classList.add('active')
    const raiz = raizWorkspaceDe(ent.caminho)
    if (raiz) definirContextoPasta(raiz)
    abrirArquivoNaAba(ent.caminho)
  })
  return row
}

$('btn-refresh-tree')?.addEventListener('click', () => {
  for (const [, st] of estadoArvore) st.filhosCarregados = false
  renderizarPastas()
})

// ---------- Abas + editor ----------
function persistirAbas() {
  localStorage.setItem(
    'dg-abas',
    JSON.stringify({ abas: abas.map((a) => a.caminho), ativa: abaAtiva })
  )
}

async function restaurarAbas() {
  try {
    const raw = localStorage.getItem('dg-abas')
    if (!raw) return
    const data = JSON.parse(raw)
    const lista = data.abas || []
    for (const c of lista) {
      const existe = await window.api.invoke('arquivo:existe', c, pastasPermitidas())
      if (existe.ok && existe.existe) {
        const r = await window.api.invoke('arquivo:ler', c, pastasPermitidas())
        if (r.ok) {
          abas.push({ caminho: c, nome: nomeArquivo(c), dirty: false })
          // conteúdo fica no editor só para a ativa; dirty false
        }
      }
    }
    if (abas.length) {
      const alvo = data.ativa && abas.find((a) => a.caminho === data.ativa) ? data.ativa : abas[0].caminho
      await ativarAba(alvo)
    }
    renderizarAbas()
  } catch (e) {
    console.warn('[abas] restaurar:', e)
  }
}

function renderizarAbas() {
  const bar = $('editor-tabs')
  bar.innerHTML = ''
  for (const a of abas) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className =
      'editor-tab' + (a.caminho === abaAtiva ? ' active' : '') + (a.dirty ? ' dirty' : '')
    btn.innerHTML =
      extIcon(a.nome) +
      '<span class="tab-name">' +
      escapar(a.nome) +
      '</span>' +
      '<span class="tab-close" title="Fechar">×</span>'
    btn.title = a.caminho
    btn.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-close')) {
        e.stopPropagation()
        fecharAba(a.caminho)
      } else {
        ativarAba(a.caminho)
      }
    })
    bar.appendChild(btn)
  }
  atualizarEmpty()
}

function atualizarEmpty() {
  const empty = $('editor-empty')
  if (!empty) return
  empty.classList.toggle('hidden', !!abaAtiva)
}

function atualizarBreadcrumb() {
  const bc = $('editor-breadcrumb')
  if (!bc) return
  bc.textContent = abaAtiva ? caminhoRelativo(abaAtiva) : ''
}

async function abrirArquivoNaAba(caminho) {
  const existente = abas.find((a) => a.caminho === caminho)
  if (existente) {
    await ativarAba(caminho)
    return
  }
  const r = await window.api.invoke('arquivo:ler', caminho, pastasPermitidas())
  if (!r.ok) {
    alert('Não foi possível abrir: ' + (r.erro || 'erro'))
    return
  }
  // sincronizar dirty da aba atual antes de trocar
  syncDirtyAtiva()
  abas.push({ caminho, nome: nomeArquivo(caminho), dirty: false })
  await ativarAba(caminho, r.conteudo)
  persistirAbas()
}

function syncDirtyAtiva() {
  if (!abaAtiva || !editor) return
  const a = abas.find((x) => x.caminho === abaAtiva)
  if (a) a.dirty = editor.isDirty()
}

async function ativarAba(caminho, conteudoPrevio) {
  syncDirtyAtiva()
  abaAtiva = caminho
  let conteudo = conteudoPrevio
  if (conteudo == null) {
    const r = await window.api.invoke('arquivo:ler', caminho, pastasPermitidas())
    if (!r.ok) {
      alert('Erro ao ler: ' + (r.erro || 'erro'))
      return
    }
    conteudo = r.conteudo
  }
  if (!editor) initEditor()
  editor.abrir(caminho, conteudo)
  const a = abas.find((x) => x.caminho === caminho)
  if (a) a.dirty = false
  renderizarAbas()
  atualizarBreadcrumb()
  atualizarEmpty()
  editor.focar()
  persistirAbas()
}

function perguntarDirty(caminho) {
  return new Promise((resolve) => {
    dirtyResolver = resolve
    $('dirty-msg').textContent =
      'O arquivo "' + nomeArquivo(caminho) + '" tem alterações não salvas. Deseja salvar?'
    $('modal-dirty').classList.remove('hidden')
  })
}

function fecharDirtyModal(resultado) {
  $('modal-dirty').classList.add('hidden')
  if (dirtyResolver) {
    const r = dirtyResolver
    dirtyResolver = null
    r(resultado)
  }
}

$('btn-dirty-cancel')?.addEventListener('click', () => fecharDirtyModal('cancelar'))
$('btn-dirty-discard')?.addEventListener('click', () => fecharDirtyModal('descartar'))
$('btn-dirty-save')?.addEventListener('click', () => fecharDirtyModal('salvar'))

async function fecharAba(caminho) {
  const a = abas.find((x) => x.caminho === caminho)
  if (!a) return
  if (caminho === abaAtiva && editor) a.dirty = editor.isDirty()
  if (a.dirty) {
    const resp = await perguntarDirty(caminho)
    if (resp === 'cancelar') return
    if (resp === 'salvar') {
      if (caminho === abaAtiva) {
        const ok = await salvarArquivoAtivo()
        if (!ok) return
      } else {
        // precisa ativar para salvar conteúdo atual no editor — se não é ativa e dirty, conteúdo perdido
        // abas dirty só se estavam ativas e editadas; ao trocar syncamos. OK.
        await ativarAba(caminho)
        const ok = await salvarArquivoAtivo()
        if (!ok) return
      }
    }
  }
  const idx = abas.findIndex((x) => x.caminho === caminho)
  abas.splice(idx, 1)
  if (abaAtiva === caminho) {
    abaAtiva = null
    if (abas.length) {
      const next = abas[Math.min(idx, abas.length - 1)]
      await ativarAba(next.caminho)
    } else {
      editor?.limpar()
      atualizarBreadcrumb()
      atualizarEmpty()
      renderizarAbas()
    }
  } else {
    renderizarAbas()
  }
  persistirAbas()
}

async function salvarArquivoAtivo() {
  if (!abaAtiva || !editor) return false
  const conteudo = editor.getConteudo()
  const r = await window.api.invoke('arquivo:salvar', abaAtiva, conteudo, pastasPermitidas())
  if (!r.ok) {
    alert('Erro ao salvar: ' + (r.erro || 'erro'))
    return false
  }
  editor.marcarSalvo()
  const a = abas.find((x) => x.caminho === abaAtiva)
  if (a) a.dirty = false
  renderizarAbas()
  return true
}

function initEditor() {
  const mount = $('editor-mount')
  editor = criarEditor(mount, {
    onChange: () => {
      const a = abas.find((x) => x.caminho === abaAtiva)
      if (!a || !editor) return
      const dirty = editor.isDirty()
      if (a.dirty !== dirty) {
        a.dirty = dirty
        renderizarAbas()
      }
    },
    onSave: () => {
      salvarArquivoAtivo()
    }
  })
}

function ciclarAbas() {
  if (abas.length < 2) return
  const idx = abas.findIndex((a) => a.caminho === abaAtiva)
  const next = abas[(idx + 1) % abas.length]
  ativarAba(next.caminho)
}

// ---------- Análise ----------
async function rodarAnalise(root, force) {
  $('analysis-progress').classList.remove('hidden')
  $('progress-text').textContent = force ? 'Analisando de novo...' : 'Analisando...'
  $('analysis-content').innerHTML =
    '<p class="muted">Lendo o sistema, lendo arquivos-chave e perguntando a IA...</p>'
  ativarAbaDireita('analise')
  try {
    const r = await window.api.invoke('analysis:run', root, force)
    renderizarAnalise(r.report, r.fromCache)
  } catch (err) {
    $('analysis-content').innerHTML =
      '<p class="muted">Nao consegui analisar agora: ' +
      escapar(String(err)) +
      '</p><p class="muted">Dica: instale o Ollama (ollama.com) e baixe um modelo (ex.: ollama pull llama3.2), ou configure LLM_API_KEY no ambiente.</p>'
  } finally {
    $('analysis-progress').classList.add('hidden')
  }
}

function renderizarAnalise(report, fromCache) {
  const badge = fromCache ? ' <span class="muted">(do cache)</span>' : ''
  let html = ''
  html += secao('O que é', report.oQueE || '—')
  html += secao('Stack', report.stack || '—')
  html += secao('Estrutura', report.estrutura || '—')
  html += secaoLista('Pontos de atenção', report.pontosAtencao)
  html += secaoLista('Sugestões', report.sugestoes)
  if (report.provider) {
    html +=
      '<p class="muted">Analisado por: ' +
      escapar(report.provider) +
      (report.model ? ' (' + escapar(report.model) + ')' : '') +
      ' — ' +
      new Date(report.analyzedAt).toLocaleString('pt-BR') +
      badge +
      '</p>'
  }
  $('analysis-content').innerHTML = html
}

function secao(titulo, texto) {
  return (
    '<div class="analysis-section"><h4>' + titulo + '</h4><p>' + escapar(texto) + '</p></div>'
  )
}

function secaoLista(titulo, itens) {
  if (!itens || itens.length === 0) return secao(titulo, '—')
  return (
    '<div class="analysis-section"><h4>' +
    titulo +
    '</h4><ul>' +
    itens.map((i) => '<li>' + escapar(i) + '</li>').join('') +
    '</ul></div>'
  )
}

// ---------- Chat ----------
function renderizarChat(msgs) {
  const area = $('chat-messages')
  area.innerHTML = ''
  for (const m of msgs) adicionarBolha(m.role, m.content, m.provider)
  area.scrollTop = area.scrollHeight
}

function adicionarBolha(role, content, provider) {
  const area = $('chat-messages')
  const div = document.createElement('div')
  div.className = 'msg ' + role
  const span = document.createElement('span')
  span.className = 'msg-text'
  span.textContent = content
  div.appendChild(span)
  if (provider) {
    const tag = document.createElement('span')
    tag.className = 'msg-provider'
    tag.textContent = provider
    div.appendChild(tag)
  }
  area.appendChild(div)
  area.scrollTop = area.scrollHeight
  return div
}

async function enviarMensagem() {
  if (!pastaAtual) return
  const input = $('chat-input')
  const texto = input.value.trim()
  if (!texto) return
  input.value = ''
  adicionarBolha('user', texto)
  $('chat-send').disabled = true
  const bolhaProc = adicionarBolha('assistant', 'Pensando...')
  try {
    const r = await window.api.invoke('chat:send', pastaAtual, texto)
    bolhaProc.querySelector('.msg-text').textContent = r.message.content
    if (r.message.provider) atualizarBadgeProvedor(r.message.provider)
  } catch (err) {
    bolhaProc.querySelector('.msg-text').textContent = 'Erro ao enviar: ' + String(err)
  } finally {
    $('chat-send').disabled = false
    input.focus()
  }
}

// ---------- Config / Contas ----------
async function abrirConfig() {
  $('modal-config').classList.remove('hidden')
  const p = await window.api.invoke('system:get-profile')
  const forca = await window.api.invoke('system:profile-strength')
  const gb = (b) => (b / 1024 / 1024 / 1024).toFixed(1) + ' GB'
  $('config-profile').innerHTML =
    '<h4>Maquina</h4>' +
    escapar(p.hostname) +
    ' — ' +
    escapar(p.platform) +
    ' ' +
    escapar(p.arch) +
    '<br>' +
    (p.cpus ? p.cpus.length : '?') +
    ' nucleos — ' +
    gb(p.totalMemory) +
    ' RAM<br>' +
    'Forca: <strong>' +
    escapar(forca) +
    '</strong>'
  const o = await window.api.invoke('brain:ollama-status')
  $('config-ollama').innerHTML =
    '<h4>Ollama (IA local)</h4>' +
    (o.installed
      ? o.reachable
        ? 'Instalado e rodando — ' +
          o.models.length +
          ' modelo(s): ' +
          escapar(o.models.map((m) => m.name).join(', ') || '—')
        : 'Instalado, mas parado. Rode: ollama serve'
      : 'Nao instalado. Baixe em ollama.com')
}

async function abrirContas() {
  $('modal-contas').classList.remove('hidden')
  $('contas-identidade').innerHTML = '<h4>Identidade</h4>Carregando...'
  $('contas-maquina').innerHTML = '<h4>Maquina</h4>Carregando...'
  $('contas-ia').innerHTML = '<h4>IA</h4>Carregando...'
  $('contas-guardian').innerHTML = '<h4>Guardiao de recursos</h4>Carregando...'
  try {
    const s = await window.api.invoke('accounts:get-state')
    $('contas-identidade').innerHTML =
      '<h4>Identidade</h4>' +
      'Usuario: <strong>owner</strong> (device-token)<br>' +
      'Token: <code>' +
      escapar(s.identidade.tokenPrefix) +
      '...</code><br>' +
      'Desde: ' +
      (s.identidade.criadoEm ? new Date(s.identidade.criadoEm).toLocaleDateString('pt-BR') : '—')
    $('contas-maquina').innerHTML =
      '<h4>Maquina</h4>' +
      escapar(s.maquina.hostname) +
      ' — ' +
      escapar(s.maquina.plataforma) +
      '<br>' +
      s.maquina.cpus +
      ' nucleos — ' +
      escapar(s.maquina.ramGB) +
      ' GB RAM<br>' +
      'Forca: <strong>' +
      escapar(s.maquina.forca) +
      '</strong>'
    const provs = s.ia.provedores
      .map((p) => p.name + ': ' + (p.available ? 'OK (' + p.models + ')' : 'off'))
      .join('<br>')
    $('contas-ia').innerHTML =
      '<h4>IA</h4>' +
      'Ollama: ' +
      (s.ia.ollamaInstalado ? (s.ia.ollamaRodando ? 'rodando' : 'instalado, parado') : 'nao instalado') +
      '<br>' +
      'Modelos: ' +
      escapar(s.ia.modelos.join(', ') || 'nenhum') +
      '<br>' +
      'Provedores: <br>' +
      provs
    $('contas-guardian').innerHTML =
      '<h4>Guardiao de recursos</h4>' +
      'RAM livre: ' +
      Math.round(s.guardian.freeMemory / 1048576) +
      ' MB (' +
      s.guardian.freePct +
      '%)<br>' +
      'CPU: ' +
      s.guardian.cpuPercent +
      '%<br>' +
      'Operacoes pesadas: ' +
      (s.guardian.ramOk ? 'LIBERADAS' : 'PAUSADAS (RAM baixa)')
  } catch (err) {
    $('contas-ia').innerHTML = '<h4>Erro</h4>' + escapar(String(err))
  }
}

async function rodarDiagnostico() {
  const alvo = $('contas-diagnostico')
  alvo.innerHTML = '<h4>Diagnostico ao vivo</h4>Rodando 8 testes...'
  const t0 = Date.now()
  try {
    const r = await window.api.invoke('diagnostico:rodar', pastaAtual || null)
    const total = Date.now() - t0
    let html = '<h4>Diagnostico ao vivo - ' + r.ok + '/' + r.total + ' OK (' + total + ' ms)</h4>'
    for (const m of r.modulos) {
      const icone = m.ok ? '\u2713' : '\u2717'
      const cor = m.ok ? '#3fb950' : '#f85149'
      html +=
        '<div style="margin:4px 0"><span style="color:' +
        cor +
        ';font-weight:bold">' +
        icone +
        '</span> ' +
        '<strong>' +
        escapar(m.nome) +
        '</strong> <span class="muted">(' +
        m.ms +
        ' ms)</span><br>' +
        '<span style="margin-left:18px;font-size:12px">' +
        escapar(m.detalhe) +
        '</span></div>'
    }
    alvo.innerHTML = html
  } catch (err) {
    alvo.innerHTML = '<h4>Diagnostico</h4><span style="color:#f85149">' + escapar(String(err)) + '</span>'
  }
}

// ---------- Tema ----------
async function alternarTema() {
  const atual = document.body.classList.contains('tema-escuro') ? 'escuro' : 'claro'
  const novo = atual === 'claro' ? 'escuro' : 'claro'
  try {
    await window.api.invoke('tema:set', novo)
  } catch (e) {
    console.warn('[tema] set:', e)
  }
  aplicarTema(novo)
}

/** CodeMirror: escuro → oneDark; claro → tema padrão (themeCompartment). Body já deve ter a classe. */
function trocarTemaEditor(_tema) {
  editor?.aplicarTema()
}

function aplicarTema(tema) {
  document.body.classList.toggle('tema-escuro', tema === 'escuro')
  document.body.classList.toggle('tema-claro', tema !== 'escuro')
  try {
    localStorage.setItem('dg-tema', tema)
  } catch {}
  trocarTemaEditor(tema)
}

async function carregarTema() {
  try {
    const tema = await window.api.invoke('tema:get')
    aplicarTema(tema)
  } catch {
    aplicarTema(localStorage.getItem('dg-tema') === 'claro' ? 'claro' : 'escuro')
  }
}

// ---------- Paleta ----------
const COMANDOS = [
  { id: 'abrir-pasta', label: 'Abrir pasta de trabalho', hint: 'Ctrl+O' },
  { id: 'analisar', label: 'Analisar sistema aberto', hint: 'IA' },
  { id: 'reanalisar', label: 'Analisar novamente', hint: 'IA' },
  { id: 'limpar-chat', label: 'Limpar chat desta pasta', hint: 'chat' },
  { id: 'contas', label: 'Abrir Contas e saude do sistema', hint: 'Fase 2' },
  { id: 'config', label: 'Abrir Configuracoes', hint: 'sistema' },
  { id: 'tema', label: 'Alternar tema claro/escuro', hint: 'visual' },
  { id: 'guardian', label: 'Ver guardiao de recursos', hint: 'RAM/CPU' },
  { id: 'salvar', label: 'Salvar arquivo ativo', hint: 'Ctrl+S' },
  { id: 'fechar-aba', label: 'Fechar aba ativa', hint: 'Ctrl+W' },
  { id: 'toggle-sidebar', label: 'Alternar Explorer', hint: 'Ctrl+B' },
  { id: 'toggle-right', label: 'Alternar painel direito', hint: 'Ctrl+Alt+B' },
  { id: 'navegador', label: 'Abrir navegador embutido', hint: 'Ctrl+Shift+N' }
]

let paletaItens = []
let paletaSel = 0

function abrirPaletaComandos() {
  modoPaleta = 'comandos'
  $('palette').classList.remove('hidden')
  $('palette-input').value = ''
  $('palette-input').placeholder = 'Digite um comando...'
  renderizarPaleta('')
  $('palette-input').focus()
}

function abrirPaletaArquivos() {
  modoPaleta = 'arquivos'
  $('palette').classList.remove('hidden')
  $('palette-input').value = ''
  $('palette-input').placeholder = 'Buscar arquivo nas pastas...'
  renderizarPaleta('')
  $('palette-input').focus()
}

function fecharPaleta() {
  $('palette').classList.add('hidden')
}

async function coletarArquivos(dir, acc, profundidade) {
  if (profundidade > 6 || acc.length > 800) return
  const r = await window.api.invoke('arquivo:listar', dir, pastasPermitidas())
  if (!r.ok) return
  for (const e of r.entradas || []) {
    if (e.tipo === 'dir') await coletarArquivos(e.caminho, acc, profundidade + 1)
    else if (e.editavel) acc.push(e)
  }
}

async function renderizarPaleta(filtro) {
  const lista = $('palette-list')
  lista.innerHTML = ''
  paletaSel = 0
  const f = filtro.toLowerCase().trim()
  paletaItens = []

  if (modoPaleta === 'comandos') {
    const cmds = COMANDOS.filter((c) => !f || c.label.toLowerCase().includes(f))
    for (const c of cmds) {
      paletaItens.push({ tipo: 'cmd', id: c.id, label: c.label, hint: c.hint })
    }
  } else {
    const acc = []
    for (const p of pastasRecentes) await coletarArquivos(p, acc, 0)
    const filtrados = acc.filter(
      (e) =>
        !f ||
        e.nome.toLowerCase().includes(f) ||
        e.caminho.toLowerCase().includes(f) ||
        caminhoRelativo(e.caminho).toLowerCase().includes(f)
    )
    for (const e of filtrados.slice(0, 80)) {
      paletaItens.push({
        tipo: 'file',
        caminho: e.caminho,
        label: caminhoRelativo(e.caminho),
        hint: e.nome
      })
    }
  }

  if (paletaItens.length === 0) {
    lista.innerHTML = '<div class="palette-item muted">Nenhum resultado</div>'
    return
  }
  for (let i = 0; i < paletaItens.length; i++) {
    const c = paletaItens[i]
    const div = document.createElement('div')
    div.className = 'palette-item' + (i === 0 ? ' selecionado' : '')
    div.innerHTML =
      '<span class="palette-label">' +
      escapar(c.label) +
      '</span>' +
      (c.hint ? '<span class="palette-hint">' + escapar(c.hint) + '</span>' : '')
    div.addEventListener('click', () => {
      fecharPaleta()
      executarItemPaleta(c)
    })
    lista.appendChild(div)
  }
}

function executarItemPaleta(c) {
  if (c.tipo === 'file') abrirArquivoNaAba(c.caminho)
  else executarComando(c.id)
}

function executarComando(id) {
  if (id === 'abrir-pasta') abrirPasta()
  else if (id === 'analisar') {
    if (pastaAtual) rodarAnalise(pastaAtual, false)
  } else if (id === 'reanalisar') {
    if (pastaAtual) rodarAnalise(pastaAtual, true)
  } else if (id === 'limpar-chat') {
    if (pastaAtual) window.api.invoke('chat:clear', pastaAtual).then(() => renderizarChat([]))
  } else if (id === 'contas') abrirContas()
  else if (id === 'config') abrirConfig()
  else if (id === 'tema') alternarTema()
  else if (id === 'guardian') abrirContas()
  else if (id === 'salvar') salvarArquivoAtivo()
  else if (id === 'fechar-aba') {
    if (abaAtiva) fecharAba(abaAtiva)
  } else if (id === 'toggle-sidebar') toggleSidebar()
  else if (id === 'toggle-right') toggleRight()
  else if (id === 'navegador') window.api.invoke('navegador:abrir').catch(() => {})
}

function destacarPaleta(itens) {
  itens.forEach((el, i) => el.classList.toggle('selecionado', i === paletaSel))
  itens[paletaSel]?.scrollIntoView({ block: 'nearest' })
}

// ---------- Guardião ----------
async function atualizarGuardiao() {
  try {
    const s = await window.api.invoke('guardian:snapshot')
    const mb = Math.round(s.freeMemory / 1048576)
    $('guardian-text').textContent =
      'Guardiao: RAM ' +
      mb +
      ' MB (' +
      s.freePct +
      '%) - CPU ' +
      s.cpuPercent +
      '%' +
      (s.ramOk ? '' : ' - PAUSADO')
    $('guardian-bar').classList.toggle('guardian-alerta', !s.ramOk)
  } catch { /* ignora */ }
}

function atualizarBadgeProvedor(nome) {
  const alvo = document.getElementById('chat-provider')
  if (alvo) alvo.textContent = 'IA: ' + nome
}

// ---------- Eventos ----------
$('btn-add-folder').addEventListener('click', abrirPasta)
$('btn-empty-open')?.addEventListener('click', abrirPasta)
$('btn-reanalyze').addEventListener('click', () => pastaAtual && rodarAnalise(pastaAtual, true))
$('btn-config').addEventListener('click', abrirConfig)
$('btn-config-close').addEventListener('click', () => $('modal-config').classList.add('hidden'))
$('btn-contas').addEventListener('click', abrirContas)
$('btn-diag').addEventListener('click', rodarDiagnostico)
$('btn-contas-close').addEventListener('click', () => $('modal-contas').classList.add('hidden'))
$('chat-send').addEventListener('click', enviarMensagem)
$('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    enviarMensagem()
  }
})
$('palette-input').addEventListener('input', (e) => {
  renderizarPaleta(e.target.value)
})
$('palette-input').addEventListener('keydown', (e) => {
  const itens = document.querySelectorAll('.palette-item')
  if (e.key === 'Escape') fecharPaleta()
  else if (e.key === 'ArrowDown') {
    e.preventDefault()
    paletaSel = Math.min(paletaSel + 1, itens.length - 1)
    destacarPaleta(itens)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    paletaSel = Math.max(paletaSel - 1, 0)
    destacarPaleta(itens)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const alvo = paletaItens[paletaSel]
    if (alvo) {
      fecharPaleta()
      executarItemPaleta(alvo)
    }
  }
})

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey
  const key = e.key.toLowerCase()

  if (mod && e.shiftKey && key === 'p') {
    e.preventDefault()
    abrirPaletaComandos()
    return
  }
  if (mod && key === 'p' && !e.shiftKey) {
    e.preventDefault()
    abrirPaletaArquivos()
    return
  }
  if (mod && key === 'b' && !e.altKey && !e.shiftKey) {
    e.preventDefault()
    toggleSidebar()
    return
  }
  if (mod && e.altKey && key === 'b') {
    e.preventDefault()
    toggleRight()
    return
  }
  if (mod && e.shiftKey && key === 'e') {
    e.preventDefault()
    toggleSidebar(true)
    setActivityActive('explorer', true)
    return
  }
  if (mod && key === 's') {
    e.preventDefault()
    salvarArquivoAtivo()
    return
  }
  if (mod && key === 'w') {
    e.preventDefault()
    if (abaAtiva) fecharAba(abaAtiva)
    return
  }
  if (mod && key === 'tab') {
    e.preventDefault()
    ciclarAbas()
    return
  }
  if (mod && key === 'f') {
    // deixa o CM6 abrir busca se o foco estiver no editor; senão abre explicitamente
    if (editor && abaAtiva) {
      e.preventDefault()
      editor.buscar()
    }
    return
  }
  if (e.key === 'Escape') {
    fecharPaleta()
    $('modal-config').classList.add('hidden')
    $('modal-contas').classList.add('hidden')
  }
})

$('palette').addEventListener('click', (e) => {
  if (e.target === $('palette')) fecharPaleta()
})
$('modal-config').addEventListener('click', (e) => {
  if (e.target === $('modal-config')) $('modal-config').classList.add('hidden')
})
$('modal-contas').addEventListener('click', (e) => {
  if (e.target === $('modal-contas')) $('modal-contas').classList.add('hidden')
})

function alternarPainel() {
  toggleRight()
}
$('btn-painel')?.addEventListener('click', alternarPainel)

async function rodarAutoAuditoria() {
  const btn = document.getElementById('btn-auditar')
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Auditando...'
  }
  try {
    const r = await window.api.invoke('auditoria:rodar', { autoAtualizar: true, reiniciarAoFim: false })
    if (!r || r.erro) {
      console.warn('[auditoria] erro:', r && r.erro)
    } else {
      const falhas = r.achados.filter(function (a) {
        return a.status === 'falhou'
      })
      var msg =
        'Auditoria concluida\n' +
        'OK: ' +
        r.resumo.ok +
        ' | Avisos: ' +
        r.resumo.warn +
        ' | Erros: ' +
        r.resumo.erro +
        '\n' +
        'Corrigidos: ' +
        r.resumo.corrigidos +
        ' | Falhas: ' +
        r.resumo.falhas
      if (falhas.length) {
        msg += '\n\nFalhas:\n' + falhas.map(function (a) {
          return '- ' + a.titulo
        }).join('\n')
      }
      if (!r.reiniciarPendente) {
        alert(msg)
      }
      if (r.reiniciarPendente) {
        abrirModalReinicio(r.motivoReinicio)
      }
    }
  } catch (e) {
    console.warn('[auditoria] excecao:', e)
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = 'Auditar'
    }
  }
}

function abrirModalReinicio(motivo) {
  var m = document.getElementById('modal-reinicio')
  if (!m) return
  var p = document.getElementById('reinicio-motivo')
  if (p)
    p.textContent =
      (motivo || 'Algumas alteracoes precisam de reinicio para serem aplicadas') +
      '. Deseja reiniciar agora?'
  m.classList.remove('hidden')
}
function fecharModalReinicio() {
  var m = document.getElementById('modal-reinicio')
  if (m) m.classList.add('hidden')
}

function perguntarEscolha(titulo, opcoes, config) {
  const multiplo = !!(config && config.multiplo)
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'escolha-overlay'
    const caixa = document.createElement('div')
    caixa.className = 'escolha-caixa'
    const h = document.createElement('h3')
    h.textContent = titulo
    h.style.cssText = 'margin:0 0 12px;font-size:15px;'
    caixa.appendChild(h)
    const selecionadas = new Set()
    opcoes.forEach((op) => {
      const btn = document.createElement('button')
      btn.textContent = op
      btn.className = 'btn-ghost'
      btn.style.cssText = 'display:block;width:100%;margin:6px 0;'
      if (multiplo) {
        btn.addEventListener('click', () => {
          if (selecionadas.has(op)) selecionadas.delete(op)
          else selecionadas.add(op)
          btn.style.background = selecionadas.has(op) ? 'var(--dg-active)' : ''
        })
      } else {
        btn.addEventListener('click', () => {
          overlay.remove()
          resolve([op])
        })
      }
      caixa.appendChild(btn)
    })
    if (multiplo) {
      const ok = document.createElement('button')
      ok.textContent = 'Confirmar'
      ok.className = 'btn-primary'
      ok.style.width = '100%'
      ok.style.marginTop = '12px'
      ok.addEventListener('click', () => {
        overlay.remove()
        resolve(Array.from(selecionadas))
      })
      caixa.appendChild(ok)
    }
    const cancelar = document.createElement('button')
    cancelar.textContent = 'Cancelar'
    cancelar.className = 'btn-ghost'
    cancelar.style.width = '100%'
    cancelar.addEventListener('click', () => {
      overlay.remove()
      resolve(null)
    })
    caixa.appendChild(cancelar)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove()
        resolve(null)
      }
    })
    overlay.appendChild(caixa)
    document.body.appendChild(overlay)
  })
}
window.perguntarEscolha = perguntarEscolha

async function atualizarIconeMax() {
  try {
    const st = await window.api.invoke('janela:estado')
    const b = document.getElementById('tb-max')
    if (!b) return
    b.title = st && st.maximizado ? 'Restaurar' : 'Maximizar'
  } catch {}
}

// ---------- Boot ----------
carregarLayout()
carregarPastas()
initResizers()
initActivityBar()
carregarTema()
renderizarPastas().then(() => restaurarAbas())
atualizarGuardiao()
setInterval(atualizarGuardiao, 5000)
window.api.invoke('brain:providers').then((ps) => {
  const ativo = ps.find((p) => p.available)
  if (ativo) $('chat-provider').textContent = 'IA: ' + ativo.name
})

document.addEventListener('DOMContentLoaded', function () {
  var btn = document.getElementById('btn-auditar')
  if (btn) btn.addEventListener('click', rodarAutoAuditoria)
  var bMin = document.getElementById('tb-min')
  var bMax = document.getElementById('tb-max')
  var bClose = document.getElementById('tb-close')
  if (bMin) bMin.addEventListener('click', function () {
    window.api.invoke('janela:minimizar')
  })
  if (bMax)
    bMax.addEventListener('click', async function () {
      try {
        await window.api.invoke('janela:maximizar')
      } catch (e) {
        console.warn('[janela] maximizar:', e)
      }
      setTimeout(atualizarIconeMax, 120)
    })
  if (bClose) bClose.addEventListener('click', function () {
    window.api.invoke('janela:fechar')
  })
  var bAgora = document.getElementById('btn-reinicio-agora')
  var bDepois = document.getElementById('btn-reinicio-depois')
  if (bDepois) bDepois.addEventListener('click', fecharModalReinicio)
  if (bAgora)
    bAgora.addEventListener('click', function () {
      fecharModalReinicio()
      window.api.invoke('auditoria:rodar', { autoAtualizar: false, reiniciarAoFim: true })
    })
  atualizarIconeMax()
})
