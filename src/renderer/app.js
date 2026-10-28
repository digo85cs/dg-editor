// DG Editor - renderer (IDE Opção B)
import { criarEditor } from './editor-cm.js'
import { initTerminalPanel } from './terminal.js'
import { registrarComando, listarComandosLocais, executarComandoLocal } from './comandos.js'
import {
  iniciarHistoricoChat,
  mostrarLoadingChat,
  removerLoadingChat,
  marcarProviderFallback,
  animarEntradaMsg
} from './chat.js'

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
  void ligarHistoricoChat(path)
  void atualizarGitStatusArvore()

  if (cached) {
    renderizarAnalise(cached, true)
    $('analysis-content').dataset.jaAnalisou = '1'
  } else {
    $('analysis-content').innerHTML =
      '<p class="muted">Pasta aberta. Clique em <strong>Analisar</strong> quando quiser a análise.</p>'
    delete $('analysis-content').dataset.jaAnalisou
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
  const promessasFilhos = []
  for (const p of pastasRecentes) {
    const root = document.createElement('div')
    root.className = 'tree-root' + (p === pastaAtual ? ' selected' : '')
    root.dataset.path = p
    const st = estadoArvore.get(p) || { expandida: false, filhosCarregados: false }
    estadoArvore.set(p, st)

    const header = document.createElement('div')
    header.className = 'tree-root-header'
    header.dataset.path = p
    header.dataset.tipo = 'dir'
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

    // Re-render: leituras em paralelo (sem await no loop).
    if (st.expandida && children.childElementCount === 0) {
      carregandoNos.add(children)
      promessasFilhos.push(
        carregarFilhos(p, children, 1)
          .catch(() => false)
          .finally(() => carregandoNos.delete(children))
      )
    }
  }
  if (promessasFilhos.length) await Promise.all(promessasFilhos)
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
  row.dataset.path = ent.caminho
  row.dataset.tipo = 'dir'
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

/** @type {Map<string, string>} caminho relativo (posix) -> status git */
const gitStatusMap = new Map()

function relPosix(abs, raiz) {
  const a = String(abs || '').replace(/\\/g, '/')
  const r = String(raiz || '').replace(/\\/g, '/').replace(/\/$/, '')
  if (a.toLowerCase().startsWith(r.toLowerCase() + '/')) return a.slice(r.length + 1)
  return a.split('/').pop() || a
}

function badgeGitHtml(st) {
  if (!st) return ''
  const cor =
    st === 'M' ? '#c9a227' : st === 'A' ? '#2e7d4f' : st === 'D' ? '#b33a3a' : '#888'
  return (
    '<span class="git-badge" data-git="' +
    escapar(st) +
    '" style="color:' +
    cor +
    '" title="git ' +
    escapar(st) +
    '">' +
    escapar(st) +
    '</span>'
  )
}

function renderDiffHtml(diffText) {
  const lines = String(diffText || '').split(/\r?\n/)
  return lines
    .map((ln) => {
      let cls = 'diff-ctx'
      if (ln.startsWith('+') && !ln.startsWith('+++')) cls = 'diff-add'
      else if (ln.startsWith('-') && !ln.startsWith('---')) cls = 'diff-del'
      else if (ln.startsWith('@@')) cls = 'diff-hunk'
      return '<span class="' + cls + '">' + escapar(ln) + '</span>'
    })
    .join('\n')
}

async function abrirPainelDiff(absPath) {
  const raiz = raizWorkspaceDe(absPath) || pastaAtual
  if (!raiz) return
  const rel = relPosix(absPath, raiz)
  const panel = $('diff-panel')
  const body = $('diff-panel-body')
  const title = $('diff-panel-title')
  if (!panel || !body) return
  title.textContent = 'Diff: ' + rel
  body.textContent = 'Carregando…'
  panel.classList.remove('hidden')
  panel.setAttribute('aria-hidden', 'false')
  try {
    const r = await window.api.invoke('git:diff', raiz, rel)
    body.innerHTML = renderDiffHtml(r?.diff || r?.erro || '(vazio)')
  } catch (e) {
    body.textContent = String(e)
  }
}

function fecharPainelDiff() {
  const panel = $('diff-panel')
  if (!panel) return
  panel.classList.add('hidden')
  panel.setAttribute('aria-hidden', 'true')
}

async function atualizarGitStatusArvore() {
  const raiz = pastaAtual
  if (!raiz) return
  try {
    const r = await window.api.invoke('git:status', raiz)
    gitStatusMap.clear()
    if (r?.ok && Array.isArray(r.itens)) {
      for (const it of r.itens) {
        gitStatusMap.set(String(it.path).replace(/\\/g, '/'), it.status)
      }
    }
    document.querySelectorAll('.tree-item[data-tipo="file"]').forEach((row) => {
      const abs = row.dataset.path || ''
      const rel = relPosix(abs, raiz)
      const st = gitStatusMap.get(rel)
      let badge = row.querySelector('.git-badge')
      if (!st) {
        badge?.remove()
        return
      }
      if (!badge) {
        badge = document.createElement('span')
        badge.className = 'git-badge'
        row.appendChild(badge)
      }
      badge.dataset.git = st
      badge.textContent = st
      badge.title = 'git ' + st
      badge.style.color =
        st === 'M' ? '#c9a227' : st === 'A' ? '#2e7d4f' : st === 'D' ? '#b33a3a' : '#888'
    })
  } catch {
    /* */
  }
}

function criarNoFile(ent, nivel) {
  const row = document.createElement('div')
  row.className = 'tree-item'
  row.style.paddingLeft = 8 + nivel * 16 + 16 + 'px'
  const raiz = raizWorkspaceDe(ent.caminho) || pastaAtual
  const rel = raiz ? relPosix(ent.caminho, raiz) : ''
  const st = rel ? gitStatusMap.get(rel) : null
  row.innerHTML =
    extIcon(ent.nome) + '<span>' + escapar(ent.nome) + '</span>' + badgeGitHtml(st)
  row.title = ent.caminho
  row.dataset.path = ent.caminho
  row.dataset.tipo = 'file'
  row.addEventListener('click', (e) => {
    e.stopPropagation()
    if (e.target?.closest?.('.git-badge')) {
      void abrirPainelDiff(ent.caminho)
      return
    }
    if (!ent.editavel) {
      alert('Extensão não editável: ' + ent.nome)
      return
    }
    document.querySelectorAll('.tree-item.active').forEach((el) => el.classList.remove('active'))
    row.classList.add('active')
    const rz = raizWorkspaceDe(ent.caminho)
    if (rz) definirContextoPasta(rz)
    abrirArquivoNaAba(ent.caminho)
    if (st) void abrirPainelDiff(ent.caminho)
  })
  return row
}

$('btn-refresh-tree')?.addEventListener('click', () => {
  for (const [, st] of estadoArvore) st.filhosCarregados = false
  renderizarPastas().then(() => atualizarGitStatusArvore())
})
$('btn-git-refresh')?.addEventListener('click', () => void atualizarGitStatusArvore())
$('diff-panel-close')?.addEventListener('click', () => fecharPainelDiff())
setInterval(() => {
  if (document.hidden || !pastaAtual) return
  void atualizarGitStatusArvore()
}, 5000)

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

function extDe(caminho) {
  const m = String(caminho || '')
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

function ehMarkdown(caminho) {
  const e = extDe(caminho)
  return e === 'md' || e === 'markdown'
}

function ehImagemExt(caminho) {
  return /^(png|jpe?g|gif|webp)$/.test(extDe(caminho))
}

/** Renderer markdown mínimo + sanitização (sem HTML arbitrário). */
function sanitizarERenderMarkdown(src) {
  let t = String(src || '')
  t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  t = t.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
  t = t.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
  t = t.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
  t = t.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
  t = t.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
  t = t.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
  t = t.replace(/```([\s\S]*?)```/g, (_, code) => '<pre><code>' + code.trim() + '</code></pre>')
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  t = t.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>')
  t = t.replace(/(<li>.*<\/li>\n?)+/g, (m) => '<ul>' + m + '</ul>')
  t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>')
  t = t.replace(/^\|(.+)\|$/gm, (line) => {
    const cells = line
      .slice(1, -1)
      .split('|')
      .map((c) => '<td>' + c.trim() + '</td>')
      .join('')
    return '<tr>' + cells + '</tr>'
  })
  t = t.replace(/(<tr>.*<\/tr>\n?)+/g, (m) => '<table>' + m + '</table>')
  t = t.replace(/^(?!<[hupolt]|<li|<tr|<table|<pre)(.+)$/gm, '<p>$1</p>')
  // remove on* / script / iframe mesmo se vazarem
  t = t.replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  t = t.replace(/<\/?(script|iframe|object|embed)[^>]*>/gi, '')
  return t
}

let mdPreviewOn = false

function atualizarToolbarPreview(caminho) {
  const bar = $('editor-toolbar')
  const btn = $('btn-md-preview')
  const mdBox = $('md-preview')
  const imgBox = $('image-preview')
  if (!bar) return
  const md = ehMarkdown(caminho)
  const img = ehImagemExt(caminho)
  bar.classList.toggle('hidden', !md && !img)
  if (btn) btn.classList.toggle('hidden', !md)
  if (!md) {
    mdPreviewOn = false
    mdBox?.classList.add('hidden')
    mdBox?.setAttribute('aria-hidden', 'true')
    $('editor-host')?.classList.remove('split-preview')
  }
  if (!img) {
    imgBox?.classList.add('hidden')
    imgBox?.setAttribute('aria-hidden', 'true')
  }
}

function toggleMdPreview() {
  const caminho = abaAtiva
  if (!ehMarkdown(caminho) || !editor) return
  mdPreviewOn = !mdPreviewOn
  const host = $('editor-host')
  const box = $('md-preview')
  if (!box || !host) return
  if (mdPreviewOn) {
    box.innerHTML = sanitizarERenderMarkdown(editor.getConteudo ? editor.getConteudo() : '')
    box.classList.remove('hidden')
    box.setAttribute('aria-hidden', 'false')
    host.classList.add('split-preview')
  } else {
    box.classList.add('hidden')
    box.setAttribute('aria-hidden', 'true')
    host.classList.remove('split-preview')
  }
}

async function mostrarImagem(caminho) {
  const host = $('editor-host')
  const box = $('image-preview')
  const img = $('image-preview-img')
  const mount = $('editor-mount')
  if (!box || !img) return
  const r = await window.api.invoke('arquivo:ler-base64', caminho, pastasPermitidas())
  if (!r?.ok || !r.dataUrl) {
    alert('Não foi possível abrir imagem: ' + (r?.erro || 'erro'))
    return
  }
  img.src = r.dataUrl
  img.style.maxWidth = '100%'
  img.style.maxHeight = '100%'
  img.style.objectFit = 'contain'
  box.classList.remove('hidden')
  box.setAttribute('aria-hidden', 'false')
  mount?.classList.add('hidden')
  $('editor-empty')?.classList.add('hidden')
  host?.classList.add('modo-imagem')
}

function esconderImagem() {
  const box = $('image-preview')
  const mount = $('editor-mount')
  box?.classList.add('hidden')
  box?.setAttribute('aria-hidden', 'true')
  mount?.classList.remove('hidden')
  $('editor-host')?.classList.remove('modo-imagem')
}

$('btn-md-preview')?.addEventListener('click', () => toggleMdPreview())

async function abrirArquivoNaAba(caminho) {
  const existente = abas.find((a) => a.caminho === caminho)
  if (existente) {
    await ativarAba(caminho)
    return
  }
  if (ehImagemExt(caminho)) {
    syncDirtyAtiva()
    abas.push({ caminho, nome: nomeArquivo(caminho), dirty: false, imagem: true })
    abaAtiva = caminho
    if (!editor) initEditor()
    esconderImagem()
    await mostrarImagem(caminho)
    renderizarAbas()
    atualizarBreadcrumb()
    atualizarEmpty()
    atualizarToolbarPreview(caminho)
    persistirAbas()
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
  if (ehImagemExt(caminho)) {
    if (!editor) initEditor()
    await mostrarImagem(caminho)
    renderizarAbas()
    atualizarBreadcrumb()
    atualizarEmpty()
    atualizarToolbarPreview(caminho)
    persistirAbas()
    return
  }
  esconderImagem()
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
  atualizarToolbarPreview(caminho)
  if (mdPreviewOn && ehMarkdown(caminho)) {
    const box = $('md-preview')
    if (box) box.innerHTML = sanitizarERenderMarkdown(conteudo)
  } else {
    mdPreviewOn = false
    $('md-preview')?.classList.add('hidden')
    $('editor-host')?.classList.remove('split-preview')
  }
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
    $('analysis-content').dataset.jaAnalisou = '1'
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
  animarEntradaMsg(div, role)
  area.scrollTop = area.scrollHeight
  return div
}

/** @type {Awaited<ReturnType<typeof iniciarHistoricoChat>> | null} */
let histChat = null

async function enviarMensagem() {
  if (!pastaAtual) return
  const input = $('chat-input')
  const texto = input.value.trim()
  if (!texto) return
  input.value = ''
  adicionarBolha('user', texto)
  histChat?.registrarMensagem('user', texto)
  $('chat-send').disabled = true
  // Loading dedicado (não usa bolha "Pensando..." órfã)
  mostrarLoadingChat()
  let falhou = false
  try {
    const r = await window.api.invoke('chat:send', pastaAtual, texto)
    const ok = r && r.ok !== false && r.message && r.message.content
    const conteudo = ok
      ? r.message.content
      : r?.message?.content || 'Não consegui responder.'
    falhou = !ok || (r.message && r.message.provider === 'erro')
    await removerLoadingChat({ erro: falhou })
    const bolha = adicionarBolha('assistant', conteudo, r?.message?.provider)
    if (!falhou) {
      histChat?.registrarMensagem('assistant', conteudo, r.message.provider)
      if (r.message.provider) atualizarBadgeProvedor(r.message.provider)
    }
    void bolha
  } catch (err) {
    falhou = true
    await removerLoadingChat({ erro: true })
    adicionarBolha('assistant', 'Não consegui responder.')
    console.info('[chat] erro invoke:', err)
  } finally {
    $('chat-send').disabled = false
    input.focus()
  }
}

async function ligarHistoricoChat(raiz) {
  histChat = await iniciarHistoricoChat(raiz, {
    onRender: (msgs) => {
      const empty = $('empty-state')
      if (empty) empty.classList.add('hidden')
      renderizarChat(msgs || [])
    },
    onNova: () => {
      const empty = $('empty-state')
      if (empty) empty.classList.add('hidden')
      renderizarChat([])
    }
  })
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

// ---------- Paleta / Quick Open / Busca ----------
let paletaItens = []
let paletaSel = 0
let buscaAbortId = null

function bootstrapComandos() {
  const defs = [
    { id: 'abrir-pasta', titulo: 'Abrir pasta de trabalho', atalho: 'Ctrl+O', fn: () => abrirPasta() },
    { id: 'quick-open', titulo: 'Quick Open', atalho: 'Ctrl+P', fn: () => abrirPaletaArquivos() },
    { id: 'busca-global', titulo: 'Busca no projeto', atalho: 'Ctrl+Shift+F', fn: () => abrirBuscaGlobal() },
    { id: 'paleta-comandos', titulo: 'Paleta de comandos', atalho: 'Ctrl+Shift+P', fn: () => abrirPaletaComandos() },
    { id: 'analisar', titulo: 'Analisar sistema aberto', fn: () => pastaAtual && rodarAnalise(pastaAtual, false) },
    { id: 'reanalisar', titulo: 'Analisar novamente', fn: () => pastaAtual && rodarAnalise(pastaAtual, true) },
    {
      id: 'limpar-chat',
      titulo: 'Limpar chat',
      fn: () => pastaAtual && window.api.invoke('chat:clear', pastaAtual).then(() => renderizarChat([]))
    },
    { id: 'contas', titulo: 'Contas e saude', fn: () => abrirContas() },
    { id: 'config', titulo: 'Configuracoes', fn: () => abrirConfig() },
    { id: 'tema', titulo: 'Alternar tema', fn: () => alternarTema() },
    { id: 'guardian', titulo: 'Guardiao', fn: () => abrirContas() },
    { id: 'salvar', titulo: 'Salvar', atalho: 'Ctrl+S', fn: () => salvarArquivoAtivo() },
    { id: 'fechar-aba', titulo: 'Fechar aba', atalho: 'Ctrl+W', fn: () => abaAtiva && fecharAba(abaAtiva) },
    { id: 'toggle-sidebar', titulo: 'Alternar Explorer', atalho: 'Ctrl+B', fn: () => toggleSidebar() },
    { id: 'toggle-right', titulo: 'Alternar painel direito', atalho: 'Ctrl+Alt+B', fn: () => toggleRight() },
    {
      id: 'toggle-terminal',
      titulo: 'Alternar terminal',
      atalho: 'Ctrl+`',
      fn: () => document.getElementById('btn-terminal-toggle')?.click()
    },
    {
      id: 'navegador',
      titulo: 'Navegador embutido',
      atalho: 'Ctrl+Shift+N',
      fn: () => window.api.invoke('navegador:abrir').catch(() => {})
    }
  ]
  for (const d of defs) registrarComando(d)
}

function abrirPaletaComandos() {
  modoPaleta = 'comandos'
  fecharBuscaGlobal()
  $('palette').classList.remove('hidden')
  $('palette-input').value = ''
  $('palette-input').placeholder = 'Digite um comando...'
  renderizarPaleta('')
  $('palette-input').focus()
}

function abrirPaletaArquivos() {
  modoPaleta = 'arquivos'
  fecharBuscaGlobal()
  $('palette').classList.remove('hidden')
  $('palette-input').value = ''
  $('palette-input').placeholder = 'Quick Open — nome do arquivo...'
  renderizarPaleta('')
  $('palette-input').focus()
}

function fecharPaleta() {
  $('palette').classList.add('hidden')
}

function abrirBuscaGlobal() {
  fecharPaleta()
  $('busca-global')?.classList.remove('hidden')
  const inp = $('busca-input')
  if (inp) {
    inp.value = ''
    inp.focus()
  }
  const box = $('busca-resultados')
  if (box) box.innerHTML = '<div class="palette-item muted">Digite para buscar no projeto</div>'
}

function fecharBuscaGlobal() {
  $('busca-global')?.classList.add('hidden')
  if (buscaAbortId) {
    window.api.invoke('busca:cancelar', buscaAbortId).catch(() => {})
    buscaAbortId = null
  }
}

async function renderizarPaleta(filtro) {
  const lista = $('palette-list')
  lista.innerHTML = ''
  paletaSel = 0
  const f = (filtro || '').trim()
  paletaItens = []

  if (modoPaleta === 'comandos') {
    let cmds = listarComandosLocais()
    try {
      const remoto = await window.api.invoke('comandos:listar')
      if (remoto?.ok && Array.isArray(remoto.comandos)) {
        for (const c of remoto.comandos) {
          if (!cmds.find((x) => x.id === c.id)) {
            cmds.push({ id: c.id, titulo: c.titulo, atalho: c.atalho })
          }
        }
      }
    } catch {
      /* offline meta */
    }
    const fl = f.toLowerCase()
    cmds = cmds.filter((c) => !fl || (c.titulo || '').toLowerCase().includes(fl) || c.id.includes(fl))
    for (const c of cmds) {
      paletaItens.push({ tipo: 'cmd', id: c.id, label: c.titulo, hint: c.atalho || '' })
    }
  } else {
    const raiz = pastaAtual || pastasRecentes[0]
    if (raiz) {
      try {
        const r = await window.api.invoke('busca:arquivos', raiz, f, 80)
        if (r?.ok && Array.isArray(r.itens)) {
          for (const e of r.itens) {
            paletaItens.push({
              tipo: 'file',
              caminho: e.caminho,
              label: e.rel || e.nome,
              hint: e.nome
            })
          }
        }
      } catch {
        /* fallback vazio */
      }
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
  if (executarComandoLocal(id)) return
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

async function rodarBuscaGlobal() {
  const raiz = pastaAtual || pastasRecentes[0]
  const q = ($('busca-input')?.value || '').trim()
  const box = $('busca-resultados')
  if (!box) return
  if (!raiz) {
    box.innerHTML = '<div class="palette-item muted">Abra uma pasta primeiro</div>'
    return
  }
  if (!q) {
    box.innerHTML = '<div class="palette-item muted">Digite para buscar</div>'
    return
  }
  if (buscaAbortId) await window.api.invoke('busca:cancelar', buscaAbortId).catch(() => {})
  buscaAbortId = 'ui-' + Date.now()
  box.innerHTML = '<div class="palette-item muted">Buscando...</div>'
  const regex = !!$('busca-regex')?.checked
  try {
    const r = await window.api.invoke('busca:conteudo', raiz, q, {
      regex,
      limite: 50,
      id: buscaAbortId
    })
    box.innerHTML = ''
    if (!r?.ok) {
      box.innerHTML = '<div class="palette-item muted">' + escapar(r?.erro || 'falha') + '</div>'
      return
    }
    if (r.cancelado) {
      box.innerHTML = '<div class="palette-item muted">Cancelado</div>'
      return
    }
    const grupos = r.grupos || []
    if (!grupos.length) {
      box.innerHTML = '<div class="palette-item muted">Nenhum resultado</div>'
      return
    }
    for (const g of grupos) {
      const head = document.createElement('div')
      head.className = 'palette-item'
      head.innerHTML = '<span class="palette-label">' + escapar(g.rel) + '</span>'
      head.addEventListener('click', () => {
        fecharBuscaGlobal()
        abrirArquivoNaAba(g.arquivo)
      })
      box.appendChild(head)
      for (const h of g.hits || []) {
        const hit = document.createElement('div')
        hit.className = 'busca-hit'
        hit.textContent = h.linha + ': ' + h.texto
        hit.addEventListener('click', () => {
          fecharBuscaGlobal()
          abrirArquivoNaAba(g.arquivo)
        })
        box.appendChild(hit)
      }
    }
  } catch (e) {
    box.innerHTML = '<div class="palette-item muted">' + escapar(String(e)) + '</div>'
  }
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

/** Toast DOM simples (canto inferior direito, auto-dismiss 5s). */
function mostrarToast(mensagem, tipo = 'aviso') {
  let host = document.getElementById('dg-toast-host')
  if (!host) {
    host = document.createElement('div')
    host.id = 'dg-toast-host'
    host.setAttribute('aria-live', 'polite')
    host.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:99999;display:flex;flex-direction:column;gap:8px;max-width:360px;pointer-events:none'
    document.body.appendChild(host)
  }
  const el = document.createElement('div')
  const cor =
    tipo === 'erro' ? '#8b1e1e' : tipo === 'ok' ? '#1e5a32' : '#5a4a1e'
  el.textContent = String(mensagem || '')
  el.style.cssText =
    'pointer-events:auto;padding:10px 14px;border-radius:6px;background:' +
    cor +
    ';color:#f5f5f0;font:13px/1.35 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35);opacity:0;transition:opacity .2s'
  host.appendChild(el)
  requestAnimationFrame(() => {
    el.style.opacity = '1'
  })
  setTimeout(() => {
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 250)
  }, 5000)
  return el
}
window.dgToast = mostrarToast

async function atualizarBadgeProvedorReal(modeloForcado) {
  try {
    const ps = await window.api.invoke('brain:providers')
    const ativo = Array.isArray(ps) ? ps.find((p) => p.available) : null
    const nomeProv = ativo
      ? ativo.name === 'ollama'
        ? 'Ollama'
        : String(ativo.name || 'IA')
      : '—'
    let modelo = modeloForcado || ''
    let flagUpdate = false
    if (!modelo) {
      try {
        const r = await window.api.invoke('modelos:listar')
        modelo = (r && r.catalogo && r.catalogo.ativo) || ''
        const m = (r?.catalogo?.modelos || []).find((x) => x.id === modelo)
        flagUpdate = !!(m && m.atualizadoDisponivel)
      } catch {
        /* ignora */
      }
    } else {
      try {
        const r = await window.api.invoke('modelos:listar')
        const m = (r?.catalogo?.modelos || []).find((x) => x.id === modelo)
        flagUpdate = !!(m && m.atualizadoDisponivel)
      } catch {
        /* */
      }
    }
    let texto = modelo ? 'IA: ' + nomeProv + ' — ' + modelo : 'IA: ' + nomeProv
    if (flagUpdate) texto += ' ⚠ atualização disponível'
    const alvo = document.getElementById('chat-provider')
    if (alvo) alvo.textContent = texto
  } catch {
    /* ignora */
  }
}

// Checagem ocasional de versões remotas (não bloqueia UI)
setTimeout(() => {
  void window.api
    .invoke('modelos:versoes-remotas')
    .then(() => atualizarBadgeProvedorReal())
    .catch(() => {})
}, 20000)

if (typeof window.api?.on === 'function') {
  window.api.on('brain:fallback', (_e, payload) => {
    const p = payload || {}
    const de = p.de || '?'
    const para = p.para || '?'
    mostrarToast('IA trocou de modelo: ' + de + ' → ' + para, 'aviso')
    marcarProviderFallback()
    void atualizarBadgeProvedorReal(para)
    void window.api.invoke('brain:avaliar', para).then((r) => {
      const nota = r?.avaliacao?.nota
      if (typeof nota === 'number' && nota < 6) {
        mostrarToast(
          'Modelo ' + para + ' respondeu abaixo do esperado (nota ' + nota + '/10) — verifique',
          'aviso'
        )
      }
    }).catch(() => {})
  })
}

$('btn-brain-avaliar')?.addEventListener('click', async () => {
  mostrarToast('Avaliando modelo ativo…', 'aviso')
  try {
    const r = await window.api.invoke('brain:avaliar')
    if (!r?.ok) {
      mostrarToast('Avaliação falhou: ' + (r?.erro || 'erro'), 'erro')
      return
    }
    const a = r.avaliacao
    mostrarToast(
      'Nota ' + a.nota + '/10 (' + a.acertos + '/' + a.total + ') — ' + a.modelo,
      a.nota < 6 ? 'aviso' : 'ok'
    )
  } catch (e) {
    mostrarToast('Avaliação falhou: ' + String(e), 'erro')
  }
})

// ---------- Eventos ----------
$('btn-add-folder').addEventListener('click', abrirPasta)
$('btn-empty-open')?.addEventListener('click', abrirPasta)
$('btn-reanalyze').addEventListener('click', () => {
  if (!pastaAtual) return
  const jaAnalisou = $('analysis-content').dataset.jaAnalisou === '1'
  rodarAnalise(pastaAtual, jaAnalisou)
})
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
  if (mod && e.shiftKey && key === 'f') {
    e.preventDefault()
    abrirBuscaGlobal()
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
    fecharBuscaGlobal()
    $('modal-config').classList.add('hidden')
    $('modal-contas').classList.add('hidden')
  }
})

$('palette').addEventListener('click', (e) => {
  if (e.target === $('palette')) fecharPaleta()
})
$('busca-global')?.addEventListener('click', (e) => {
  if (e.target === $('busca-global')) fecharBuscaGlobal()
})
let buscaTimer = null
$('busca-input')?.addEventListener('input', () => {
  clearTimeout(buscaTimer)
  buscaTimer = setTimeout(() => void rodarBuscaGlobal(), 280)
})
$('busca-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fecharBuscaGlobal()
  if (e.key === 'Enter') {
    e.preventDefault()
    void rodarBuscaGlobal()
  }
})
$('busca-regex')?.addEventListener('change', () => void rodarBuscaGlobal())
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

/** Diretório pai de um caminho (arquivo → pasta). */
function dirPaiDe(caminho) {
  const n = String(caminho || '').replace(/[/\\]+$/, '')
  const i = Math.max(n.lastIndexOf('\\'), n.lastIndexOf('/'))
  return i > 0 ? n.slice(0, i) : n
}

let menuCtxArvore = null

function fecharMenuCtxArvore() {
  if (menuCtxArvore) {
    menuCtxArvore.remove()
    menuCtxArvore = null
  }
}

function abrirMenuCtxArvore(x, y, cwd) {
  fecharMenuCtxArvore()
  const menu = document.createElement('div')
  menu.className = 'tree-ctx-menu'
  menu.setAttribute('role', 'menu')
  const item = document.createElement('button')
  item.type = 'button'
  item.className = 'tree-ctx-item'
  item.setAttribute('role', 'menuitem')
  item.textContent = 'Abrir terminal nesta pasta'
  item.addEventListener('click', (e) => {
    e.stopPropagation()
    fecharMenuCtxArvore()
    const api = window.dgTerminal
    if (typeof garantirTerminal === 'function') garantirTerminal()
    const api2 = window.dgTerminal
    if (api2 && typeof api2.abrirEm === 'function') {
      void api2.abrirEm(cwd)
    } else {
      console.warn('[arvore] dgTerminal.abrirEm indisponivel')
    }
  })
  menu.appendChild(item)
  document.body.appendChild(menu)
  const pad = 4
  const rect = menu.getBoundingClientRect()
  let left = x
  let top = y
  if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad
  if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad
  menu.style.left = Math.max(pad, left) + 'px'
  menu.style.top = Math.max(pad, top) + 'px'
  menuCtxArvore = menu
}

function initMenuCtxArvore() {
  const lista = $('folder-list')
  if (!lista) return
  lista.addEventListener('contextmenu', (e) => {
    const alvo =
      e.target.closest('.tree-item[data-path]') || e.target.closest('.tree-root-header[data-path]')
    if (!alvo) return
    e.preventDefault()
    e.stopPropagation()
    const path = alvo.dataset.path
    if (!path) return
    const tipo = alvo.dataset.tipo || (alvo.classList.contains('tree-root-header') ? 'dir' : 'file')
    const cwd = tipo === 'file' ? dirPaiDe(path) : path
    abrirMenuCtxArvore(e.clientX, e.clientY, cwd)
  })
  document.addEventListener('click', (e) => {
    if (menuCtxArvore && !menuCtxArvore.contains(e.target)) fecharMenuCtxArvore()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharMenuCtxArvore()
  })
  window.addEventListener('blur', () => fecharMenuCtxArvore())
}

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
bootstrapComandos()
carregarTema()
// Lazy: terminal só no primeiro uso (botão / atalho / abrirEm)
let terminalIniciado = false
function garantirTerminal() {
  if (terminalIniciado) return
  terminalIniciado = true
  initTerminalPanel()
}
document.getElementById('btn-terminal-toggle')?.addEventListener(
  'click',
  () => garantirTerminal(),
  { once: true, capture: true }
)
document.addEventListener(
  'keydown',
  (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === '`') garantirTerminal()
  },
  true
)
// placeholder até primeiro uso
const termPanel = document.getElementById('terminal-panel')
if (termPanel && !termPanel.dataset.lazyReady) {
  termPanel.dataset.lazyReady = '0'
}
initMenuCtxArvore()
renderizarPastas().then(() => restaurarAbas())
atualizarGuardiao()
setInterval(atualizarGuardiao, 5000)
void atualizarBadgeProvedorReal()

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
