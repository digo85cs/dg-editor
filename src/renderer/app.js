// DG Editor - renderer (IDE Opção B)
import { mostrarRegrasUI } from './regras-ui.js'
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
import { ligarFerramentas } from './ferramentas-ui.js'

const $ = (id) => document.getElementById(id)

let pastaAtual = null
ligarFerramentas(() => pastaAtual)
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
/** #files-list precisa re-render quando a aba Files for ativada. */
let filesListaSuja = false
/** Histórico de navegação de abas (tb-voltar / tb-avancar). */
let histAbas = []
let histIdx = -1
/** Raiz do vault Markdown aberto (null = fechado). */
let vaultRaiz = null

const CHEV =
  '<span class="chevron"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></span>'

function pastasPermitidas() {
  const s = new Set(pastasRecentes)
  if (vaultRaiz) s.add(vaultRaiz)
  return [...s]
}

function caminhoNoVault(caminho) {
  if (!vaultRaiz || !caminho) return false
  return caminhoSobPasta(caminho, vaultRaiz)
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
  const label = (ext || 'Â·').slice(0, 3).toUpperCase()
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
    // Inline sobrepoe tokens; nomes novos (--dg-sidebar-w / --dg-panel-w) + aliases legados
    if (L.sidebarWidth) {
      app.style.setProperty('--dg-sidebar-w', L.sidebarWidth + 'px')
      app.style.setProperty('--dg-sidebar-width', L.sidebarWidth + 'px')
    }
    if (L.rightWidth) {
      app.style.setProperty('--dg-panel-w', L.rightWidth + 'px')
      app.style.setProperty('--dg-right-panel-width', L.rightWidth + 'px')
    }
    if (L.sidebarCollapsed) app.classList.add('sidebar-collapsed')
    if (L.rightCollapsed) app.classList.add('right-collapsed')
  } catch { /* ignora */ }
}

function salvarLayout() {
  const app = $('app')
  const sw = parseInt(getComputedStyle(app).getPropertyValue('--dg-sidebar-w'), 10) || 260
  const rw = parseInt(getComputedStyle(app).getPropertyValue('--dg-panel-w'), 10) || 320
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
        $('app').style.setProperty('--dg-sidebar-w', w + 'px')
        $('app').style.setProperty('--dg-sidebar-width', w + 'px')
      } else {
        const w = Math.min(600, Math.max(320, startW - dx))
        $('app').style.setProperty('--dg-panel-w', w + 'px')
        $('app').style.setProperty('--dg-right-panel-width', w + 'px')
        if (typeof enviarBoundsBrowser === 'function') enviarBoundsBrowser()
      }
    }
    const onUp = () => {
      el.classList.remove('dragging')
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      salvarLayout()
      if (typeof enviarBoundsBrowser === 'function') enviarBoundsBrowser()
    }
    el.addEventListener('mousedown', (e) => {
      e.preventDefault()
      startX = e.clientX
      const prop = kind === 'sidebar' ? '--dg-sidebar-w' : '--dg-panel-w'
      startW = parseInt(getComputedStyle($('app')).getPropertyValue(prop), 10) || (kind === 'sidebar' ? 260 : 320)
      el.classList.add('dragging')
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
    el.addEventListener('dblclick', () => {
      if (kind === 'sidebar') {
        $('app').style.setProperty('--dg-sidebar-w', '260px')
        $('app').style.setProperty('--dg-sidebar-width', '260px')
      } else {
        $('app').style.setProperty('--dg-panel-w', '320px')
        $('app').style.setProperty('--dg-right-panel-width', '320px')
      }
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

function sincronizarBotoesPainelDireito() {
  const recolhido = $('app').classList.contains('right-collapsed')
  const pressed = String(recolhido)
  $('btn-right-collapse')?.setAttribute('aria-pressed', pressed)
  $('btn-right-expand')?.setAttribute('aria-pressed', pressed)
}

function toggleRight(forcar) {
  const app = $('app')
  if (typeof forcar === 'boolean') {
    app.classList.toggle('right-collapsed', !forcar)
  } else {
    app.classList.toggle('right-collapsed')
  }
  salvarLayout()
  sincronizarBotoesPainelDireito()
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
        ativarAbaCentro('chat')
        setTimeout(() => $('chat-input')?.focus(), 0)
      } else if (a === 'navegador') {
        toggleRight(true)
        ativarAbaDireita('browser')
        void abrirNavegadorUi()
      } else if (a === 'contas') {
        abrirContas()
      } else if (a === 'config') {
        abrirConfig()
      } else if (a === 'tema') {
        alternarTema()
      }
    })
  })
}

let browserAberto = false
let browserMountObserver = null

function setBrowserStatus(aberto) {
  browserAberto = !!aberto
  const st = $('browser-status')
  const overlay = $('browser-overlay')
  if (st) {
    st.textContent = aberto
      ? 'Navegador ativo nesta aba.'
      : 'Navegador fechado.'
  }
  if (overlay) overlay.classList.toggle('hidden', !!aberto)
}

function enviarBoundsBrowser() {
  const m = $('browser-mount')
  const pane = $('pane-browser')
  if (!m || !pane || !pane.classList.contains('active')) return
  const r = m.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return
  try {
    window.api.send('navegador:bounds', {
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height)
    })
  } catch (e) {
    console.warn('[navegador] bounds', e)
  }
}

function setBrowserVisivel(mostrar) {
  try {
    window.api.send('navegador:mostrar', !!mostrar)
  } catch {
    /* preload antigo */
  }
  if (mostrar) {
    requestAnimationFrame(() => {
      enviarBoundsBrowser()
      requestAnimationFrame(enviarBoundsBrowser)
    })
  }
}

async function abrirNavegadorUi() {
  try {
    await window.api.invoke('navegador:abrir')
    setBrowserStatus(true)
    setBrowserVisivel(true)
    enviarBoundsBrowser()
  } catch (e) {
    console.warn('[navegador]', e)
    setBrowserStatus(false)
    setBrowserVisivel(false)
  }
}

function ativarAbaDireita(pane) {
  // Chat saiu do painel direito (Etapa 5) â€” redirecionar
  if (pane === 'chat') {
    ativarAbaCentro('chat')
    return
  }
  const eraBrowser = $('pane-browser')?.classList.contains('active')
  document.querySelectorAll('.right-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.pane === pane)
  })
  document.querySelectorAll('.right-pane').forEach((p) => {
    p.classList.toggle('active', p.id === 'pane-' + pane)
  })
  if (pane === 'browser') {
    if (browserAberto) setBrowserVisivel(true)
    else setBrowserVisivel(false)
  } else if (eraBrowser || pane !== 'browser') {
    setBrowserVisivel(false)
  }
  if (pane === 'terminal') {
    garantirTerminal()
    const fit = () => {
      window.dgTerminal?.fit?.()
    }
    const open = window.dgTerminal?.abrir
    if (typeof open === 'function') {
      Promise.resolve(open()).then(() => {
        requestAnimationFrame(() => {
          fit()
          requestAnimationFrame(fit)
        })
      })
    } else {
      requestAnimationFrame(() => {
        fit()
        requestAnimationFrame(fit)
      })
    }
  } else if (pane === 'files' && filesListaSuja) {
    filesListaSuja = false
    void renderizarArvoreEm($('files-list'))
  }
}

$('browser-abrir')?.addEventListener('click', () => {
  toggleRight(true)
  ativarAbaDireita('browser')
  void abrirNavegadorUi()
})
try {
  window.api.on?.('navegador:aberto', () => {
    setBrowserStatus(true)
    setBrowserVisivel($('pane-browser')?.classList.contains('active'))
  })
  window.api.on?.('navegador:fechado', () => {
    setBrowserStatus(false)
    setBrowserVisivel(false)
  })
} catch {
  /* preload antigo */
}

window.addEventListener('resize', () => {
  if ($('pane-browser')?.classList.contains('active') && browserAberto) {
    enviarBoundsBrowser()
  }
})
;(() => {
  const m = $('browser-mount')
  if (!m || typeof ResizeObserver === 'undefined') return
  browserMountObserver = new ResizeObserver(() => {
    if ($('pane-browser')?.classList.contains('active') && browserAberto) {
      enviarBoundsBrowser()
    }
  })
  browserMountObserver.observe(m)
})()

function ativarAbaCentro(pane) {
  const alvo = pane === 'editor' || pane === 'agent' ? pane : 'chat'
  document.querySelectorAll('.center-tab').forEach((t) => {
  if(t.dataset.centerPane==='chat'){ try{initChatAgentSelector();}catch(e){} }
    const on = t.dataset.centerPane === alvo
    t.classList.toggle('active', on)
    t.setAttribute('aria-selected', on ? 'true' : 'false')
  })
  document.querySelectorAll('.center-pane').forEach((p) => {
    p.classList.toggle('active', p.id === 'center-pane-' + alvo)
  })
  if (alvo === 'agent') void carregarAgentesUi()
}

document.querySelectorAll('.right-tab').forEach((t) => {
  t.addEventListener('click', () => ativarAbaDireita(t.dataset.pane))
})

document.querySelectorAll('.center-tab').forEach((t) => {
  if(t.dataset.centerPane==='chat'){ try{initChatAgentSelector();}catch(e){} }
  t.addEventListener('click', () => ativarAbaCentro(t.dataset.centerPane))
})

// Bridge para terminal.js (toggle Ctrl+` / icon-bar) sem import circular
window.dgUi = {
  toggleRight,
  ativarAbaDireita,
  ativarAbaCentro
}

// ---------- Pastas ----------
async function abrirPasta() {
  const r = await window.api.invoke('folder:select')
  if (r.canceled) return
  adicionarPasta(r.path)
  await selecionarPasta(r.path)
}

async function abrirVault() {
  const r = await window.api.invoke('vault:abrir')
  if (r?.canceled) return
  if (!r?.ok) {
    alert('Não foi possível abrir o vault: ' + (r?.erro || 'erro'))
    return
  }
  vaultRaiz = r.raiz
  adicionarPasta(r.raiz)
  await selecionarPasta(r.raiz)
  const sec = $('vault-section')
  if (sec) sec.hidden = false
  const st = $('vault-status')
  if (st) st.textContent = nomeArquivo(r.raiz) + ' Â· ' + (r.total || 0) + ' notas'
  await atualizarPainelVault(abaAtiva)
}

async function fecharVault() {
  await window.api.invoke('vault:fechar')
  vaultRaiz = null
  const sec = $('vault-section')
  if (sec) sec.hidden = true
  const st = $('vault-status')
  if (st) st.textContent = 'Nenhum vault'
  const bl = $('vault-backlinks')
  if (bl) bl.innerHTML = ''
  const tg = $('vault-tags')
  if (tg) tg.innerHTML = ''
}

async function atualizarPainelVault(caminho) {
  if (!vaultRaiz) return
  const bl = $('vault-backlinks')
  const tg = $('vault-tags')
  if (bl) {
    bl.innerHTML = ''
    if (caminho && caminhoNoVault(caminho) && ehMarkdown(caminho)) {
      const r = await window.api.invoke('vault:backlinks', caminho)
      const itens = r?.backlinks || []
      if (!itens.length) {
        bl.innerHTML = '<span class="muted">Nenhum backlink</span>'
      } else {
        for (const n of itens) {
          const b = document.createElement('button')
          b.type = 'button'
          b.textContent = n.titulo || n.rel
          b.title = n.rel
          b.addEventListener('click', () => void abrirArquivoNaAba(n.path))
          bl.appendChild(b)
        }
      }
    } else {
      bl.innerHTML = '<span class="muted">Abra uma nota do vault</span>'
    }
  }
  if (tg) {
    tg.innerHTML = ''
    const r = await window.api.invoke('vault:tags')
    const tags = r?.tags || {}
    const keys = Object.keys(tags).sort((a, b) => a.localeCompare(b))
    if (!keys.length) {
      tg.innerHTML = '<span class="muted">Sem tags</span>'
    } else {
      for (const k of keys.slice(0, 40)) {
        const b = document.createElement('button')
        b.type = 'button'
        b.textContent = '#' + k + ' (' + tags[k].length + ')'
        b.title = tags[k].map((x) => x.rel).join(', ')
        b.addEventListener('click', () => {
          const first = tags[k][0]
          if (first) void abrirArquivoNaAba(first.path)
        })
        tg.appendChild(b)
      }
    }
  }
}

async function abrirWikiLink(alvo) {
  if (!vaultRaiz) {
    alert('Abra um vault para resolver [[links]].')
    return
  }
  const r = await window.api.invoke('vault:resolver-link', alvo, abaAtiva || undefined)
  if (!r?.path) {
    alert('Nota não encontrada: [[' + alvo + ']]')
    return
  }
  await abrirArquivoNaAba(r.path)
  void atualizarPainelVault(r.path)
}

function adicionarPasta(path) {
  if (!pastasRecentes.includes(path)) pastasRecentes.push(path)
  renderizarPastas()
  salvarPastas()
  void renderizarProjects(true)
  void atualizarStatusBar(path)
}

function caminhoSobPasta(caminho, raiz) {
  const n = (s) => String(s || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  const root = n(raiz)
  const c = n(caminho)
  if (!root || !c) return false
  return c === root || c.startsWith(root + '\\')
}

function criarBotaoRemoverPasta(path) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'pasta-remover'
  btn.title = 'Remover da lista'
  btn.setAttribute('aria-label', 'Remover pasta ' + nomeArquivo(path))
  btn.textContent = '\u00D7'
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    void removerPasta(path)
  })
  return btn
}

function garantirEmptyStateChat() {
  const area = $('chat-messages')
  if (!area) return
  let empty = $('empty-state')
  if (!empty) {
    empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.id = 'empty-state'
    empty.innerHTML =
      '<h2>Bem-vindo ao DG Editor</h2>' +
      '<p>Abra uma pasta no Explorer. Chat e análise ficam neste painel; o código edita na aba Editor.</p>' +
      '<button id="btn-empty-open" class="btn-primary">Abrir pasta</button>'
    area.innerHTML = ''
    area.appendChild(empty)
    $('btn-empty-open')?.addEventListener('click', abrirPasta)
  } else {
    empty.classList.remove('hidden')
  }
}

async function removerPasta(path) {
  if (!path || !pastasRecentes.includes(path)) return
  const nome = nomeArquivo(path)
  if (
    !window.confirm(
      "Remover '" + nome + "' da lista?\n\nA pasta não será apagada do disco."
    )
  ) {
    return
  }
  const idx = pastasRecentes.indexOf(path)
  if (idx === -1) return
  pastasRecentes.splice(idx, 1)
  salvarPastas()

  // Fechar abas cujos arquivos estavam sob a pasta removida
  const paraFechar = abas.filter((a) => caminhoSobPasta(a.caminho, path)).map((a) => a.caminho)
  for (const c of paraFechar) {
    const i = abas.findIndex((x) => x.caminho === c)
    if (i >= 0) abas.splice(i, 1)
  }
  if (paraFechar.length) {
    if (!abaAtiva || !abas.some((a) => a.caminho === abaAtiva)) {
      abaAtiva = null
      editor?.limpar()
      histAbas = []
      histIdx = -1
      atualizarBotoesHist()
    }
    renderizarAbas()
    atualizarBreadcrumb()
    atualizarEmpty()
    persistirAbas()
  }

  if (pastaAtual === path) {
    pastaAtual = null
    const titulo = $('chat-title')
    if (titulo) titulo.textContent = 'Nenhuma pasta aberta'
    $('chat-send') && ($('chat-send').disabled = true)
    habilitarBotoesAnalise(false)
    garantirEmptyStateChat()
    histChat = null
  }

  await renderizarPastas()
  void renderizarProjects(true)
  if (typeof atualizarStatusBar === 'function') {
    void atualizarStatusBar(pastaAtual)
  }
}

function salvarPastas() {
  try {
    localStorage.setItem('dg-pastas', JSON.stringify(pastasRecentes))
  } catch (e) {
    console.warn('[pastas] falha ao salvar localStorage:', e)
  }
}

function carregarPastas() {
  const salvas = localStorage.getItem('dg-pastas')
  if (salvas) {
    try {
      const lista = JSON.parse(salvas)
      if (Array.isArray(lista)) {
        for (const p of lista) {
          if (typeof p === 'string' && p && !pastasRecentes.includes(p)) {
            pastasRecentes.push(p)
          }
        }
      }
    } catch { /* ignora */ }
  }
}

/** Garante a raiz do projeto no Explorer (evita "Nenhuma pasta" no primeiro boot). */
async function garantirPastaRaizProjeto() {
  try {
    const r = await window.api.invoke('app:raiz-projeto')
    if (!r?.ok || !r.raiz) return
    const raiz = String(r.raiz)
    // Remove caminhos truncados por bug de espaco (ex.: "D:\\CURSOR\\DG Edi")
    for (let i = pastasRecentes.length - 1; i >= 0; i--) {
      const p = String(pastasRecentes[i] || '')
      if (!p) {
        pastasRecentes.splice(i, 1)
        continue
      }
      if (p !== raiz && raiz.toLowerCase().startsWith(p.toLowerCase())) {
        pastasRecentes.splice(i, 1)
      }
    }
    if (!pastasRecentes.includes(raiz)) {
      pastasRecentes.unshift(raiz)
    }
    salvarPastas()
    await renderizarPastas()
    if (!pastaAtual) {
      await selecionarPasta(raiz)
    }
  } catch (e) {
    console.warn('[pastas] raiz projeto:', e)
  }
}

async function selecionarPasta(path) {
  console.time('selecionarPasta')
  pastaAtual = path
  void carregarOpcoesAgenteChat(path)
  ativarAbaCentro('chat')
  void atualizarStatusBar(path)
  $('chat-title').textContent = nomeArquivo(path)
  $('empty-state')?.remove()
  $('chat-send').disabled = false
  habilitarBotoesAnalise(true)

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

  // Trocar pasta: 1Âº clique volta a "Analisando..." (mesmo com cache)
  delete $('analysis-content').dataset.jaAnalisou
  if (cached) {
    renderizarAnalise(cached, true)
  } else {
    $('analysis-content').innerHTML =
      '<p class="muted">Pasta aberta. Escolha Análise rápida ou Análise completa quando quiser analisar.</p>'
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
 * muda só aqui â€” ao selecionar pasta raiz já expandida (clique no nome, não no chevron)
 * ou ao abrir um arquivo. Expandir/retrair árvore NÃO chama isto.
 */
function definirContextoPasta(p) {
  if (!p) return
  if (pastaAtual && pastaAtual !== p) {
    delete $('analysis-content')?.dataset.jaAnalisou
  }
  pastaAtual = p
  void carregarOpcoesAgenteChat(p)
  $('chat-title').textContent = nomeArquivo(p)
  $('chat-send').disabled = false
  habilitarBotoesAnalise(true)
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

async function renderizarArvoreEm(lista) {
  if (!lista) return
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
    header.appendChild(criarBotaoRemoverPasta(p))
    const chev = header.querySelector('.chevron')
    if (st.expandida) chev.classList.add('open')

    const children = document.createElement('div')
    children.className = 'tree-children' + (st.expandida ? ' open' : '')

    header.addEventListener('click', async (e) => {
      if (e.target.closest('.pasta-remover')) return
      if (carregandoNos.has(children)) return
      const noChevron = !e.target.closest('.chevron')
      // Pasta já expandida + clique no nome/ícone â†’ selecionarPasta (sem re-render).
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

function abaFilesVisivel() {
  return !!$('pane-files')?.classList.contains('active')
}

async function renderizarPastas() {
  console.time('renderizarPastas')
  try {
    await renderizarArvoreEm($('folder-list'))
    if (abaFilesVisivel()) {
      await renderizarArvoreEm($('files-list'))
      filesListaSuja = false
    } else {
      filesListaSuja = true
    }
  } finally {
    console.timeEnd('renderizarPastas')
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
  row.innerHTML = CHEV + '<span class="file-icon">ðŸ“</span><span>' + escapar(ent.nome) + '</span>'
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
  body.textContent = 'Carregandoâ€¦'
  panel.classList.remove('hidden')
  panel.setAttribute('aria-hidden', 'false')
  try {
    const r = await window.api.invoke('git:diff', raiz, rel)
    body.innerHTML = renderDiffHtml(r?.diff || r?.erro || '(vazio)')
  } catch (e) {
    body.textContent = String(e)
  }
}

/** @type {{ id: string, path: string, unifiedDiff: string, absPath: string, origem?: string }[]} */
let ocPendentes = []
/** @type {string | null} */
let ocPendenteAtivoId = null
/** @type {{ id: string, path: string, absPath?: string, unifiedDiff: string, origem?: string }[]} */
let agentPropostas = []
let agentProgressUnsub = null
/** @type {Set<number>} */
let ocHunksAceitos = new Set()

function fecharPainelDiff() {
  const panel = $('diff-panel')
  if (!panel) return
  panel.classList.add('hidden')
  panel.setAttribute('aria-hidden', 'true')
  ocPendenteAtivoId = null
  window.__dgApplyViaAgente = false
  ocHunksAceitos = new Set()
  const acoes = $('diff-panel-actions')
  if (acoes) acoes.hidden = true
  const lista = $('oc-pendentes-lista')
  if (lista) {
    lista.hidden = true
    lista.innerHTML = ''
  }
  const bar = $('diff-hunks-bar')
  if (bar) {
    bar.hidden = true
    bar.innerHTML = ''
  }
  if (editor && editor.limparDiff) editor.limparDiff()
}

/** Preview side-by-side no CodeMirror via propostas:preview (sem gravar disco). */
async function previewDiffNoEditor(pendente) {
  if (!pendente?.id || !editor || !editor.mostrarDiffProposta) return
  const r = await window.api.invoke('propostas:preview', pendente.id, pastasPermitidas())
  if (!r?.ok) {
    alert('Preview: ' + (r?.erro || 'falha'))
    return
  }
  // abre o arquivo no editor (antes) se ainda nao estiver
  const abs = r.absPath || pendente.absPath || pendente.path
  if (abs && abaAtiva !== abs) {
    try {
      await abrirArquivoNaAba(abs)
    } catch {
      /* */
    }
  }
  if (abs && editor.getCaminho && editor.getCaminho() !== abs && r.antes != null) {
    editor.abrir(abs, r.antes)
  } else if (r.antes != null && editor.getConteudo && editor.getConteudo() !== r.antes) {
    // alinha doc com o original do disco usado no preview
    editor.abrir(abs || editor.getCaminho(), r.antes)
  }
  editor.mostrarDiffProposta({
    linhasDel: r.linhasDel || [],
    linhasAdd: r.linhasAdd || [],
    depois: r.depois,
    caminho: abs
  })
}

async function carregarHunksDiff(pendenteId) {
  const bar = $('diff-hunks-bar')
  if (!bar) return
  bar.innerHTML = ''
  ocHunksAceitos = new Set()
  const r = await window.api.invoke('propostas:hunks', pendenteId)
  if (!r?.ok || !r.hunks?.length) {
    bar.hidden = true
    return
  }
  bar.hidden = false
  for (const h of r.hunks) {
    ocHunksAceitos.add(h.index)
    const row = document.createElement('div')
    row.className = 'diff-hunk-row'
    row.dataset.index = String(h.index)
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = true
    cb.setAttribute('aria-label', 'Aceitar hunk ' + (h.index + 1))
    cb.addEventListener('change', () => {
      if (cb.checked) {
        ocHunksAceitos.add(h.index)
        row.classList.remove('rejeitado')
      } else {
        ocHunksAceitos.delete(h.index)
        row.classList.add('rejeitado')
      }
    })
    const code = document.createElement('code')
    code.textContent = 'hunk ' + (h.index + 1) + ' ' + (h.resumo || '') + ' ' + (h.header || '')
    row.appendChild(cb)
    row.appendChild(code)
    bar.appendChild(row)
  }
}

function mostrarDiffOpenClaw(pendente) {
  const panel = $('diff-panel')
  const body = $('diff-panel-body')
  const title = $('diff-panel-title')
  const acoes = $('diff-panel-actions')
  if (!panel || !body || !pendente) return
  ocPendenteAtivoId = pendente.id
  const origem = pendente.origem || (window.__dgApplyViaAgente ? 'agent' : 'openclaw')
  if (title) title.textContent = origem + ': ' + (pendente.path || pendente.absPath)
  body.innerHTML = renderDiffHtml(pendente.unifiedDiff)
  if (acoes) acoes.hidden = false
  panel.classList.remove('hidden')
  panel.setAttribute('aria-hidden', 'false')
  const lista = $('oc-pendentes-lista')
  if (lista) {
    for (const btn of lista.querySelectorAll('button')) {
      btn.classList.toggle('active', btn.dataset.id === pendente.id)
    }
  }
  void carregarHunksDiff(pendente.id)
}

function renderListaPendentesOc() {
  const lista = $('oc-pendentes-lista')
  if (!lista) return
  lista.innerHTML = ''
  if (!ocPendentes.length) {
    lista.hidden = true
    return
  }
  lista.hidden = false
  for (const p of ocPendentes) {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.id = p.id
    b.textContent = nomeArquivo(p.path || p.absPath)
    b.title = p.absPath || p.path
    if (p.id === ocPendenteAtivoId) b.classList.add('active')
    b.addEventListener('click', () => mostrarDiffOpenClaw(p))
    lista.appendChild(b)
  }
}

async function pedirOpenClawUi() {
  const prompt = window.prompt('Pedido para o OpenClaw (edicoes voltam como diff para aprovacao):')
  if (prompt == null || !String(prompt).trim()) return
  const arquivosAbertos = []
  for (const a of abas) {
    const item = { path: a.caminho }
    if (a.caminho === abaAtiva && editor) {
      item.conteudo = editor.getConteudo()
      if (editor.getSelecao) {
        const sel = editor.getSelecao()
        if (sel) item.selecao = sel
      }
    }
    arquivosAbertos.push(item)
  }
  const r = await window.api.invoke('openclaw:pedir', {
    prompt: String(prompt).trim(),
    pastas: pastasPermitidas(),
    arquivosAbertos
  })
  if (!r?.ok) {
    alert('OpenClaw: ' + (r?.erro || 'erro'))
    return
  }
  ocPendentes = r.pendentes || []
  if (r.rejeitados?.length) {
    console.warn('[openclaw] paths rejeitados:', r.rejeitados)
  }
  if (!ocPendentes.length) {
    alert(r.mensagem || 'Nenhum diff proposto.')
    return
  }
  renderListaPendentesOc()
  mostrarDiffOpenClaw(ocPendentes[0])
}

async function finalizarApplyPendente(r, id) {
  const viaAgente = !!window.__dgApplyViaAgente
  ocPendentes = ocPendentes.filter((p) => p.id !== id)
  agentPropostas = agentPropostas.filter((p) => p.id !== id)
  mostrarPropostasAgent(agentPropostas)
  if (r.absPath && abaAtiva === r.absPath && editor) {
    const ler = await window.api.invoke('arquivo:ler', r.absPath, pastasPermitidas())
    if (ler?.ok) editor.abrir(r.absPath, ler.conteudo)
  }
  // fila unificada
  const rest = await window.api.invoke('propostas:listar')
  ocPendentes = (rest?.pendentes || []).map((p) => ({
    id: p.id,
    path: p.path,
    absPath: p.absPath,
    unifiedDiff: p.unifiedDiff,
    origem: p.origem
  }))
  agentPropostas = ocPendentes.slice()
  mostrarPropostasAgent(agentPropostas)
  if (ocPendentes.length) {
    renderListaPendentesOc()
    mostrarDiffOpenClaw(ocPendentes[0])
  } else {
    fecharPainelDiff()
    alert(viaAgente && r.checkpointId ? 'Diff aplicado (checkpoint ' + r.checkpointId + ').' : 'Diff aplicado.')
  }
}

async function aplicarPendenteOc() {
  if (!ocPendenteAtivoId) return
  if (!window.confirm('Aplicar este arquivo no disco?')) return
  const viaAgente = !!window.__dgApplyViaAgente
  const canal = viaAgente ? 'agente:aplicar-proposta' : 'openclaw:aplicar'
  const id = ocPendenteAtivoId
  const r = await window.api.invoke(canal, id, pastasPermitidas())
  if (!r?.ok) {
    alert('Falha ao aplicar: ' + (r?.erro || 'erro'))
    return
  }
  await finalizarApplyPendente(r, id)
}

async function aplicarHunksSelecionadosOc() {
  if (!ocPendenteAtivoId) return
  const indices = [...ocHunksAceitos].sort((a, b) => a - b)
  if (!indices.length) {
    alert('Nenhum hunk selecionado.')
    return
  }
  if (!window.confirm('Aplicar ' + indices.length + ' hunk(s) selecionado(s)?')) return
  const def = await window.api.invoke('propostas:definir-hunks', ocPendenteAtivoId, indices)
  if (!def?.ok) {
    alert('Falha ao filtrar hunks: ' + (def?.erro || ''))
    return
  }
  if (def.rejeitado) {
    alert('Todos os hunks rejeitados.')
    fecharPainelDiff()
    return
  }
  const viaAgente = !!window.__dgApplyViaAgente || def.pendente?.origem === 'agent'
  const canal = viaAgente ? 'agente:aplicar-proposta' : 'openclaw:aplicar'
  const id = ocPendenteAtivoId
  const r = await window.api.invoke(canal, id, pastasPermitidas())
  if (!r?.ok) {
    alert('Falha ao aplicar hunks: ' + (r?.erro || 'erro'))
    return
  }
  await finalizarApplyPendente(r, id)
}

async function rejeitarPendenteOc() {
  if (!ocPendenteAtivoId) return
  const viaAgente = !!window.__dgApplyViaAgente
  const canal = viaAgente ? 'agente:rejeitar-proposta' : 'openclaw:rejeitar'
  await window.api.invoke(canal, ocPendenteAtivoId)
  const id = ocPendenteAtivoId
  ocPendentes = ocPendentes.filter((p) => p.id !== id)
  if (viaAgente) {
    agentPropostas = agentPropostas.filter((p) => p.id !== id)
    mostrarPropostasAgent(agentPropostas)
  }
  if (ocPendentes.length) {
    renderListaPendentesOc()
    mostrarDiffOpenClaw(ocPendentes[0])
  } else {
    fecharPainelDiff()
  }
}

async function carregarConfigOpenClawUi() {
  const cfg = await window.api.invoke('openclaw:config-get')
  const st = await window.api.invoke('openclaw:token-status')
  if (cfg?.config) {
    const ep = $('oc-endpoint')
    const md = $('oc-model')
    if (ep) ep.value = cfg.config.endpoint || ''
    if (md) md.value = cfg.config.model || ''
  }
  const tok = $('oc-token')
  if (tok) tok.value = ''
  const status = $('oc-token-status')
  if (status) {
    status.textContent = st?.configurado
      ? 'Token gravado no cofre do SO (safeStorage).'
      : 'Nenhum token configurado.'
  }
}

async function salvarConfigOpenClawUi() {
  const endpoint = $('oc-endpoint')?.value?.trim()
  const model = $('oc-model')?.value?.trim()
  await window.api.invoke('openclaw:config-set', { endpoint, model })
  const token = $('oc-token')?.value
  if (token && token.trim()) {
    const r = await window.api.invoke('openclaw:token-set', token.trim())
    if (!r?.ok) {
      alert('Token nao salvo: ' + (r?.erro || 'erro'))
      return
    }
    const tok = $('oc-token')
    if (tok) tok.value = ''
  }
  await carregarConfigOpenClawUi()
  alert('OpenClaw salvo.')
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
  void renderizarProjects(true)
  void atualizarStatusBar(pastaAtual)
})
$('btn-git-refresh')?.addEventListener('click', () => {
  void atualizarGitStatusArvore()
  void renderizarProjects(true)
  void atualizarStatusBar(pastaAtual)
})

// ---------- Sidebar modos: Projects / Explorer ----------
let sidebarMode = 'explorer'

function tempoRelativoCommit(ts) {
  if (!ts || !Number.isFinite(ts)) return ''
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts))
  if (s < 60) return 'agora'
  if (s < 3600) return Math.floor(s / 60) + 'm'
  if (s < 86400) return Math.floor(s / 3600) + 'h'
  return Math.floor(s / 86400) + 'd'
}

function setSidebarMode(mode) {
  sidebarMode = mode === 'projects' ? 'projects' : 'explorer'
  const projects = $('projects-list')
  const folders = $('folder-list')
  const btnP = $('sidebar-mode-projects')
  const btnE = $('sidebar-mode-explorer')
  const isProjects = sidebarMode === 'projects'
  if (projects) projects.hidden = !isProjects
  if (folders) folders.hidden = isProjects
  btnP?.classList.toggle('active', isProjects)
  btnE?.classList.toggle('active', !isProjects)
  btnP?.setAttribute('aria-selected', isProjects ? 'true' : 'false')
  btnE?.setAttribute('aria-selected', isProjects ? 'false' : 'true')
  if (isProjects) void renderizarProjects()
}

/** Cache local do ultimo git:repos (main tambem cacheia 30s). */
let reposCacheLocal = { ts: 0, itens: [] }
const REPOS_CACHE_LOCAL_MS = 30000

async function obterReposGit(force) {
  if (
    !force &&
    reposCacheLocal.ts &&
    Date.now() - reposCacheLocal.ts <= REPOS_CACHE_LOCAL_MS
  ) {
    return reposCacheLocal.itens
  }
  try {
    const r = await window.api.invoke('git:repos', { pastas: [...pastasRecentes] })
    reposCacheLocal = { ts: Date.now(), itens: Array.isArray(r) ? r : [] }
  } catch (e) {
    console.warn('[projects] git:repos', e)
    reposCacheLocal = { ts: Date.now(), itens: [] }
  }
  return reposCacheLocal.itens
}

async function atualizarStatusBar(pasta) {
  const elBranch = $('sb-branch')
  const elPasta = $('sb-pasta')
  if (!elBranch || !elPasta) return
  if (!pasta) {
    elBranch.textContent = 'â€”'
    elPasta.textContent = 'â€”'
    return
  }
  const itens = await obterReposGit(false)
  const hit =
    itens.find((it) => it && it.pasta === pasta) ||
    itens.find(
      (it) =>
        it &&
        it.repo &&
        (pasta === it.pasta ||
          pasta.toLowerCase().startsWith(String(it.pasta).toLowerCase() + '\\') ||
          pasta.toLowerCase().startsWith(String(it.pasta).toLowerCase() + '/'))
    )
  if (hit && hit.repo) {
    elBranch.textContent = (hit.branch || 'HEAD') + (hit.dirty ? ' â—' : '')
    elPasta.textContent = hit.repo
  } else {
    elBranch.textContent = 'â€”'
    elPasta.textContent = nomeArquivo(pasta)
  }
}

async function renderizarProjects(force) {
  const lista = $('projects-list')
  if (!lista) return
  const t0 = performance.now()
  const itens = await obterReposGit(!!force)
  const ms = Math.round(performance.now() - t0)
  // Deduplicar por nome de repo (basename do toplevel); pastas sem repo somem
  const porRepo = new Map()
  for (const it of itens) {
    if (!it || !it.repo) continue
    if (!porRepo.has(it.repo)) porRepo.set(it.repo, it)
  }
  const unicos = [...porRepo.values()]
  lista.innerHTML = ''
  if (unicos.length === 0) {
    lista.innerHTML =
      '<p class="projects-empty">Nenhum repositório git nas pastas abertas.</p>'
    console.log('[projects] git:repos ' + ms + 'ms itens=0 pastas=' + pastasRecentes.length)
    void atualizarStatusBar(pastaAtual)
    return
  }
  for (const it of unicos) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'project-item' + (it.pasta === pastaAtual ? ' selected' : '')
    btn.dataset.path = it.pasta
    btn.title = it.pasta
    const nome = document.createElement('span')
    nome.className = 'project-name'
    nome.textContent = it.repo
    const branch = document.createElement('span')
    branch.className = 'project-branch'
    branch.textContent = '(' + (it.branch || '?') + ')'
    btn.appendChild(nome)
    btn.appendChild(branch)
    if (it.dirty) {
      const dot = document.createElement('span')
      dot.className = 'project-dirty'
      dot.title = 'Alterações não commitadas'
      btn.appendChild(dot)
    }
    const tempo = tempoRelativoCommit(it.ultimoCommitTs)
    if (tempo) {
      const t = document.createElement('span')
      t.className = 'project-time'
      t.textContent = tempo
      btn.appendChild(t)
    }
    btn.appendChild(criarBotaoRemoverPasta(it.pasta))
    btn.addEventListener('click', (e) => {
      if (e.target.closest('.pasta-remover')) return
      void selecionarPasta(it.pasta)
      setSidebarMode('explorer')
    })
    lista.appendChild(btn)
  }
  console.log(
    '[projects] git:repos ' +
      ms +
      'ms repos=' +
      unicos.length +
      ' pastas=' +
      pastasRecentes.length +
      ' dedup=' +
      (itens.filter((i) => i && i.repo).length - unicos.length)
  )
  void atualizarStatusBar(pastaAtual)
}

$('sidebar-mode-projects')?.addEventListener('click', () => setSidebarMode('projects'))
$('sidebar-mode-explorer')?.addEventListener('click', () => setSidebarMode('explorer'))
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
  // #tabbar fora de #app: esconde quando não há abas (Cursor)
  const tabbar = $('tabbar')
  if (tabbar) tabbar.style.display = abas.length ? 'flex' : 'none'
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
  t = t.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
    const parts = String(inner).split('|')
    const alvo = parts[0].trim()
    const label = (parts[1] || parts[0]).trim()
    const esc = (s) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
    return (
      '<a href="#" class="wiki-link" data-wiki-target="' +
      esc(alvo) +
      '">' +
      esc(label) +
      '</a>'
    )
  })
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

function atualizarBotoesHist() {
  const v = document.getElementById('tb-voltar')
  const a = document.getElementById('tb-avancar')
  const canBack = histIdx > 0
  const canFwd = histIdx >= 0 && histIdx < histAbas.length - 1
  if (v) {
    v.disabled = !canBack
    v.setAttribute('aria-disabled', canBack ? 'false' : 'true')
  }
  if (a) {
    a.disabled = !canFwd
    a.setAttribute('aria-disabled', canFwd ? 'false' : 'true')
  }
}

/** Empurra no histórico só se o caminho for diferente da posição atual (evita loop com irHistAbas). */
function registrarHistAba(caminho) {
  if (!caminho) return
  if (histAbas[histIdx] === caminho) {
    atualizarBotoesHist()
    return
  }
  histAbas = histAbas.slice(0, histIdx + 1)
  histAbas.push(caminho)
  histIdx = histAbas.length - 1
  if (histAbas.length > 100) {
    histAbas.shift()
    histIdx--
  }
  atualizarBotoesHist()
}

async function irHistAbas(delta) {
  const novo = histIdx + delta
  if (novo < 0 || novo >= histAbas.length) return
  const alvo = histAbas[novo]
  histIdx = novo
  try {
    await abrirArquivoNaAba(alvo)
    // arquivo apagado / falha de IPC: não ficou em abas
    if (!abas.some((a) => a.caminho === alvo)) {
      histAbas.splice(novo, 1)
      histIdx = Math.min(novo, histAbas.length - 1)
      if (histAbas.length === 0) histIdx = -1
    }
  } catch (e) {
    console.warn('[hist-abas]', e)
    histAbas.splice(novo, 1)
    histIdx = Math.min(novo, histAbas.length - 1)
    if (histAbas.length === 0) histIdx = -1
  }
  atualizarBotoesHist()
}

async function abrirArquivoNaAba(caminho) {
  ativarAbaCentro('editor')
  const existente = abas.find((a) => a.caminho === caminho)
  if (existente) {
    await ativarAba(caminho)
    return
  }
  if (ehImagemExt(caminho)) {
    syncDirtyAtiva()
    abas.push({ caminho, nome: nomeArquivo(caminho), dirty: false, imagem: true })
    abaAtiva = caminho
    registrarHistAba(caminho)
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
  registrarHistAba(caminho)
  ativarAbaCentro('editor')
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
  void atualizarPainelVault(caminho)
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
        // precisa ativar para salvar conteúdo atual no editor â€” se não é ativa e dirty, conteúdo perdido
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
      histAbas = []
      histIdx = -1
      atualizarBotoesHist()
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
  let r
  if (vaultRaiz && caminhoNoVault(abaAtiva) && ehMarkdown(abaAtiva)) {
    r = await window.api.invoke('vault:salvar', abaAtiva, conteudo, pastasPermitidas())
    if (r?.ok) void atualizarPainelVault(abaAtiva)
  } else {
    r = await window.api.invoke('arquivo:salvar', abaAtiva, conteudo, pastasPermitidas())
  }
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
function habilitarBotoesAnalise(habilitar) {
  const rapida = $('btn-analise-rapida')
  const completa = $('btn-analise-completa')
  if (rapida) rapida.disabled = !habilitar
  if (completa) completa.disabled = !habilitar
}

async function solicitarDialogoEscopoAnalise(modo) {
  const resposta = await window.api.invoke('analysis:choose-scope', modo)
  if (resposta?.ok !== true || !Number.isInteger(resposta.response)) {
    throw new Error(resposta?.erro || 'Não foi possível abrir a escolha de escopo.')
  }
  return resposta.response
}

async function analisarCompleta(root, force = false) {
  try {
    const resposta = await solicitarDialogoEscopoAnalise('confirm-complete')
    if (resposta === 0) await rodarAnalise(root, 'completa', force)
  } catch (err) {
    mostrarToast('Não foi possível confirmar a análise completa: ' + String(err), 'erro')
  }
}

async function escolherEscopoAnalise(root, force = false) {
  try {
    const resposta = await solicitarDialogoEscopoAnalise('choose-scope')
    if (resposta === 0) await rodarAnalise(root, 'rapida', force)
    else if (resposta === 1) await analisarCompleta(root, force)
  } catch (err) {
    mostrarToast('Não foi possível escolher o escopo da análise: ' + String(err), 'erro')
  }
}

async function rodarAnalise(root, escopo = 'rapida', force = false) {
  $('analysis-progress').classList.remove('hidden')
  $('progress-text').textContent = force ? 'Analisando novamente...' : (escopo === 'completa' ? 'Analisando projeto inteiro...' : 'Analisando arquivos-chave...')
  $('analysis-content').innerHTML =
    '<p class="muted">' + (escopo === 'completa' ? 'Lendo o projeto inteiro' : 'Lendo os arquivos-chave') + ' e perguntando à IA...</p>'
  ativarAbaDireita('analise')
  try {
    const r = await window.api.analysisRun(root, force, escopo)
    if (r?.ok === false) {
      throw new Error(r.erro || 'falha na análise')
    }
    renderizarAnalise(r.report, r.fromCache)
    $('analysis-content').dataset.escopo = escopo
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
  html += secao('O que é', report.oQueE || 'â€”')
  html += secao('Stack', report.stack || 'â€”')
  html += secao('Estrutura', report.estrutura || 'â€”')
  html += secaoLista('Pontos de atenção', report.pontosAtencao)
  html += secaoLista('Sugestões', report.sugestoes)
  if (report.provider) {
    html +=
      '<p class="muted">Analisado por: ' +
      escapar(report.provider) +
      (report.model ? ' (' + escapar(report.model) + ')' : '') +
      ' â€” ' +
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
  if (!itens || itens.length === 0) return secao(titulo, 'â€”')
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
  const mensagens = Array.isArray(msgs)
    ? msgs
    : Array.isArray(msgs?.mensagens)
      ? msgs.mensagens
      : []
  for (const m of mensagens) adicionarBolha(m.role, m.content, m.provider)
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
  mostrarLoadingChat()
  let falhou = false
  let streamTexto = ''
  let streamBolha = null
  let streamSpan = null
  const offDelta = window.api.on('chat:delta', (_evt, payload) => {
    const p = payload || {}
    if (p.reset) {
      streamTexto = ''
      if (streamSpan) streamSpan.textContent = ''
      return
    }
    if (!p.delta) return
    const area = $('chat-messages')
    if (!streamBolha) {
      void removerLoadingChat({ imediato: true })
      streamBolha = adicionarBolha('assistant', '')
      streamSpan = streamBolha.querySelector('.msg-text')
    }
    streamTexto += p.delta
    if (streamSpan) streamSpan.textContent = streamTexto
    if (area) area.scrollTop = area.scrollHeight
  })
  try {
    const agenteSel = document.getElementById('chat-agent-select')
    const modoSel = document.getElementById('chat-mode-select')
    const agente = agenteSel?.value || 'auto'
    const modo = modoSel?.value || 'auto'
    const autoAprovar = (() => {
      try {
        return localStorage.getItem('dg-chat-autoapprove') === '1'
      } catch {
        return false
      }
    })()
    const r = await window.api.invoke('chat:send', pastaAtual, texto, { agente, modo, autoAprovar, anexos: chatAnexos, arquivo: abaAtiva || '' })
    chatAnexos = []
    renderizarAnexosChat()
    const ok = r && r.ok !== false && r.message && r.message.content
    const conteudo = ok
      ? r.message.content
      : r?.message?.content || 'Não consegui responder.'
    falhou = !ok || (r.message && r.message.provider === 'erro')
    if (!streamBolha) await removerLoadingChat({ erro: falhou })
    else await removerLoadingChat({ imediato: true })
    let bolha = streamBolha
    if (bolha && streamSpan) {
      streamSpan.textContent = conteudo
      if (r?.message?.provider && !bolha.querySelector('.msg-provider')) {
        const tag = document.createElement('span')
        tag.className = 'msg-provider'
        tag.textContent = r.message.provider
        bolha.appendChild(tag)
      }
    } else {
      bolha = adicionarBolha('assistant', conteudo, r?.message?.provider)
    }
    if (!falhou) {
      histChat?.registrarMensagem('assistant', conteudo, r.message.provider)
      if (r.message.provider) atualizarBadgeProvedor(r.message.provider)
    }
    void bolha
  } catch (err) {
    falhou = true
    await removerLoadingChat({ erro: !streamBolha, imediato: !!streamBolha })
    if (!streamBolha) adicionarBolha('assistant', 'Não consegui responder.')
    else if (streamSpan && !streamTexto) streamSpan.textContent = 'Não consegui responder.'
    console.info('[chat] erro invoke:', err)
  } finally {
    if (typeof offDelta === 'function') offDelta()
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

/** Nova conversa: limpa UI e reseta estado do histórico (chat.js). */
function novaConversaUi() {
  if (histChat && typeof histChat.nova === 'function') {
    histChat.nova()
    return
  }
  $('empty-state')?.classList.add('hidden')
  renderizarChat([])
}

function abrirOrientadorPrompt() {
  const modal = $('modal-prompt-orientador')
  const input = $('prompt-orientador-input')
  const output = $('prompt-orientador-output')
  if (!modal || !input || !output) return
  input.value = $('chat-input')?.value?.trim() || ''
  output.value = ''
  modal.classList.remove('hidden')
  setTimeout(() => input.focus(), 0)
}

function fecharOrientadorPrompt(restaurarFoco = true) {
  const modal = $('modal-prompt-orientador')
  if (modal) modal.classList.add('hidden')
  if (restaurarFoco) $('btn-prompt-orientador')?.focus()
}

async function melhorarPromptLocal() {
  const input = $('prompt-orientador-input')
  const output = $('prompt-orientador-output')
  const btn = $('btn-prompt-melhorar')
  if (!input || !output || !btn) return
  const valor = input.value.trim()
  if (!valor) {
    output.value = 'Digite um prompt para melhorar.'
    return
  }
  btn.disabled = true
  btn.textContent = 'Melhorando...'
  let timeoutId
  try {
    const raiz = pastaAtual || pastasRecentes[0] || '.'
    const resposta = window.api.invoke('orientar:prompt', raiz, valor)
    const r = await Promise.race([
      resposta,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('timeout')), 32_000)
      })
    ])
    if (!r || r.ok !== true || typeof r.resultado !== 'string' || !r.resultado.trim()) {
      const erro = r?.erro === 'timeout' ? 'Tempo limite excedido nas duas tentativas.' : (r?.erro || 'Não foi possível melhorar o prompt.')
      output.value = erro
      mostrarToast(erro, 'erro')
      return
    }
    output.value = r.resultado
    const tokens = Number.isFinite(r.tokensGenerated) ? r.tokensGenerated + ' tokens' : 'tokens não informados'
    mostrarToast('Prompt refinado por ' + r.modelo + ' em ' + r.elapsedMs + ' ms (' + tokens + ').', 'ok')
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    const erro = /timeout/i.test(mensagem) ? 'Tempo limite excedido nas duas tentativas.' : 'Falha ao melhorar o prompt: ' + mensagem
    output.value = erro
    mostrarToast(erro, 'erro')
  } finally {
    clearTimeout(timeoutId)
    btn.disabled = false
    btn.textContent = 'Melhorar prompt'
  }
}

function usarPromptNoChat() {
  const output = $('prompt-orientador-output')
  const input = $('chat-input')
  if (!output || !input) return
  const valor = output.value.trim()
  if (!valor) return
  input.value = valor
  fecharOrientadorPrompt(false)
  input.focus()
  input.setSelectionRange(input.value.length, input.value.length)
}

async function copiarPromptOrientador() {
  const output = $('prompt-orientador-output')
  if (!output) return
  const valor = output.value.trim()
  if (!valor) return
  let copiado = false
  try {
    await navigator.clipboard.writeText(valor)
    copiado = true
  } catch {
    const campo = document.createElement('textarea')
    campo.value = valor
    document.body.appendChild(campo)
    campo.select()
    copiado = document.execCommand('copy')
    campo.remove()
  }
  mostrarToast(copiado ? 'Prompt copiado.' : 'Não foi possível copiar o prompt.', copiado ? 'ok' : 'erro')
}

$('btn-chat-nova')?.addEventListener('click', () => novaConversaUi())
$('chat-send')?.addEventListener('click', () => void enviarMensagem())
$('chat-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void enviarMensagem()
  }
})
$('btn-prompt-orientador')?.addEventListener('click', () => abrirOrientadorPrompt())
$('btn-prompt-fechar')?.addEventListener('click', () => fecharOrientadorPrompt())
$('btn-prompt-melhorar')?.addEventListener('click', () => void melhorarPromptLocal())
$('btn-prompt-usar')?.addEventListener('click', () => usarPromptNoChat())
$('btn-prompt-copiar')?.addEventListener('click', () => void copiarPromptOrientador())

// ---------- Janelas flutuantes (Config / Contas): arrastar + sempre à frente ----------let dgFloatZ = 20000

function trazerJanelaFrente(modalEl) {
  if (!modalEl) return
  dgFloatZ += 1
  modalEl.style.zIndex = String(dgFloatZ)
}

function limparPosicaoFloat(modalEl) {
  const box = modalEl?.querySelector('[data-float-box]')
  if (!box) return
  box.style.left = ''
  box.style.top = ''
}
function abrirJanelaFlutuante(modalEl) {
  if (!modalEl) return
  modalEl.classList.remove('hidden')
  trazerJanelaFrente(modalEl)
}

function ligarJanelaFlutuante(modalEl) {
  if (!modalEl || modalEl.dataset.floatBound) return
  modalEl.dataset.floatBound = '1'
  const box = modalEl.querySelector('[data-float-box]')
  const handle = modalEl.querySelector('[data-float-handle]')
  if (!box || !handle) return

  modalEl.addEventListener('mousedown', () => trazerJanelaFrente(modalEl), true)

  let dragging = false
  let ox = 0
  let oy = 0

  function onMove(e) {
    if (!dragging) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const rect = box.getBoundingClientRect()
    let left = e.clientX - ox
    let top = e.clientY - oy
    const minVisible = 48
    left = Math.min(Math.max(left, -rect.width + minVisible), vw - minVisible)
    top = Math.min(Math.max(top, 0), vh - minVisible)
    box.style.left = left + 'px'
    box.style.top = top + 'px'
  }

  function onUp() {
    if (!dragging) return
    dragging = false
    box.classList.remove('is-dragging')
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    if (e.target.closest('button, a, input, select, textarea')) return
    trazerJanelaFrente(modalEl)
    const rect = box.getBoundingClientRect()
    // fixa posição absoluta a partir do layout atual    box.style.left = rect.left + 'px'
    box.style.top = rect.top + 'px'
    ox = e.clientX - rect.left
    oy = e.clientY - rect.top
    dragging = true
    box.classList.add('is-dragging')
    handle.setPointerCapture?.(e.pointerId)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    e.preventDefault()
  })
}

ligarJanelaFlutuante($('modal-config'))
ligarJanelaFlutuante($('modal-contas'))

// ---------- Config / Contas ----------
async function abrirConfig() {
  abrirJanelaFlutuante($('modal-config'))
  const p = await window.api.invoke('system:get-profile')
  const forca = await window.api.invoke('system:profile-strength')
  const gb = (b) => (b / 1024 / 1024 / 1024).toFixed(1) + ' GB'
  $('config-profile').innerHTML =
    '<h4>Maquina</h4>' +
    escapar(p.hostname) +
    ' â€” ' +
    escapar(p.platform) +
    ' ' +
    escapar(p.arch) +
    '<br>' +
    (p.cpus ? p.cpus.length : '?') +
    ' nucleos â€” ' +
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
        ? 'Instalado e rodando â€” ' +
          o.models.length +
          ' modelo(s): ' +
          escapar(o.models.map((m) => m.name).join(', ') || 'â€”')
        : 'Instalado, mas parado. Rode: ollama serve'
      : 'Nao instalado. Baixe em ollama.com')
  await carregarConfigOpenClawUi()
  await atualizarPainelAdapta('adapta-status-cfg')
}

/** @type {object | null} */
let adaptaStatusCache = null

async function atualizarPainelAdapta(elId) {
  const el = $(elId)
  if (!el) return
  try {
    const st = await window.api.invoke('adapta:status', pastaAtual || undefined)
    adaptaStatusCache = st
    el.innerHTML =
      'Conta: <strong>digo85cs@gmail.com</strong><br>' +
      'Dossiê: ' +
      (st.dossieExiste ? 'ok' : 'ausente') +
      ' Â· Continuidade: ' +
      (st.continuidadeExiste ? 'ok' : 'ausente') +
      ' Â· MCP: ' +
      (st.mcpExiste ? 'compilado' : 'rode npm run build:mcp') +
      '<br><code style="font-size:11px">' +
      escapar(st.caminhoContinuidade || '') +
      '</code>'
  } catch (e) {
    el.textContent = 'Falha ao ler status Adapta: ' + String(e)
  }
}

async function copiarContinuidadeAdapta(regenerar) {
  const r = await window.api.invoke('adapta:ler-continuidade', !!regenerar)
  if (!r?.ok || !r.texto) {
    if (!regenerar) {
      const g = await window.api.invoke('adapta:gerar')
      if (!g?.ok) {
        alert('Continuidade indisponível: ' + (g?.erro || r?.erro || 'sem dossiê â€” use o chat primeiro'))
        return
      }
      return copiarContinuidadeAdapta(false)
    }
    alert('Continuidade indisponível: ' + (r?.erro || 'erro'))
    return
  }
  try {
    await navigator.clipboard.writeText(r.texto)
    alert('Continuidade copiada. No Adapta ONE: + â†’ Contextos â†’ cole.')
  } catch (e) {
    alert('Não foi possível copiar: ' + String(e))
  }
  await atualizarPainelAdapta('adapta-status')
  await atualizarPainelAdapta('adapta-status-cfg')
}

async function copiarMcpAdapta() {
  const st =
    adaptaStatusCache || (await window.api.invoke('adapta:status', pastaAtual || undefined))
  adaptaStatusCache = st
  if (!st?.mcpComando) {
    alert('Comando MCP indisponível')
    return
  }
  if (!st.mcpExiste) {
    alert('MCP ainda não compilado. Rode: npm run build:mcp\n\nO JSON será copiado mesmo assim.')
  }
  try {
    await navigator.clipboard.writeText(st.mcpComando)
    alert('JSON MCP copiado. Cole no conector MCP do Maestro (ver docs/adapta.md).')
  } catch (e) {
    alert('Não foi possível copiar: ' + String(e))
  }
}

async function abrirContas() {
  abrirJanelaFlutuante($('modal-contas'))
  $('contas-identidade').innerHTML = '<h4>Identidade</h4>Carregando...'
  $('contas-maquina').innerHTML = '<h4>Maquina</h4>Carregando...'
  $('contas-ia').innerHTML = '<h4>IA</h4>Carregando...'
  $('contas-guardian').innerHTML = '<h4>Guardiao de recursos</h4>Carregando...'
  void atualizarPainelAdapta('adapta-status')
  try {
    const s = await window.api.invoke('accounts:get-state')
    $('contas-identidade').innerHTML =
      '<h4>Identidade</h4>' +
      'Usuario: <strong>' +
      escapar(s.identidade.username || 'digo85cs') +
      '</strong> (device-token)<br>' +
      'E-mail: <strong>' +
      escapar(s.identidade.email || 'digo85cs@gmail.com') +
      '</strong><br>' +
      'Token: <code>' +
      escapar(s.identidade.tokenPrefix) +
      '...</code><br>' +
      'Desde: ' +
      (s.identidade.criadoEm ? new Date(s.identidade.criadoEm).toLocaleDateString('pt-BR') : 'â€”')
    $('contas-maquina').innerHTML =
      '<h4>Maquina</h4>' +
      escapar(s.maquina.hostname) +
      ' â€” ' +
      escapar(s.maquina.plataforma) +
      '<br>' +
      s.maquina.cpus +
      ' nucleos â€” ' +
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

/** CodeMirror: escuro â†’ oneDark; claro â†’ tema padrão (themeCompartment). Body já deve ter a classe. */
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
    { id: 'abrir-vault', titulo: 'Abrir vault Markdown', fn: () => abrirVault() },
    { id: 'fechar-vault', titulo: 'Fechar vault', fn: () => fecharVault() },
    { id: 'quick-open', titulo: 'Quick Open', atalho: 'Ctrl+P', fn: () => abrirPaletaArquivos() },
    { id: 'busca-global', titulo: 'Busca no projeto', atalho: 'Ctrl+Shift+F', fn: () => abrirBuscaGlobal() },
    { id: 'paleta-comandos', titulo: 'Paleta de comandos', atalho: 'Ctrl+Shift+P', fn: () => abrirPaletaComandos() },
    { id: 'analisar', titulo: 'Analisar sistema aberto', fn: () => pastaAtual && escolherEscopoAnalise(pastaAtual) },
    { id: 'analisar-completa', titulo: 'Analise completa do projeto', fn: () => pastaAtual && analisarCompleta(pastaAtual) },
    { id: 'reanalisar', titulo: 'Analisar novamente', fn: () => pastaAtual && escolherEscopoAnalise(pastaAtual, true) },
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
    { id: 'openclaw-pedir', titulo: 'Pedir ao OpenClaw', fn: () => void pedirOpenClawUi() },
    {
      id: 'agent-panel',
      titulo: 'Painel Agent',
      fn: () => {
        ativarAbaCentro('agent')
      }
    },
    {
      id: 'agent-undo',
      titulo: 'Desfazer último apply (checkpoint)',
      fn: async () => {
        const r = await window.api.invoke('agente:checkpoint-desfazer')
        alert(r?.ok ? 'Restaurado.' : r?.erro || 'falha')
      }
    },
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
      fn: () => {
        toggleRight(true)
        ativarAbaDireita('browser')
        void abrirNavegadorUi()
      }
    },
    {
      id: 'adapta-copiar',
      titulo: 'Adapta: copiar continuidade (ONE)',
      fn: () => void copiarContinuidadeAdapta(false)
    },
    {
      id: 'adapta-mcp',
      titulo: 'Adapta: copiar comando MCP (Maestro)',
      fn: () => void copiarMcpAdapta()
    },
    {
      id: 'adapta-maestro',
      titulo: 'Adapta: abrir Maestro',
      fn: () => void window.api.invoke('adapta:abrir', 'maestro')
    },
    {      id: 'recarregar',
      titulo: 'Recarregar janela',
      atalho: 'Ctrl+R',
      fn: () => void window.api.invoke('janela:recarregar', false)
    },
    {
      id: 'forcar-recarregar',
      titulo: 'Forçar recarregamento',
      atalho: 'Ctrl+Shift+R',
      fn: () => void window.api.invoke('janela:recarregar', true)
    },
    {
      id: 'zoom-in',
      titulo: 'Zoom: aumentar',
      atalho: 'Ctrl+=',
      fn: () => void window.api.invoke('janela:zoom', 'in')
    },
    {
      id: 'zoom-out',
      titulo: 'Zoom: diminuir',
      atalho: 'Ctrl+-',
      fn: () => void window.api.invoke('janela:zoom', 'out')
    },
    {
      id: 'zoom-reset',
      titulo: 'Zoom: padrão',
      atalho: 'Ctrl+0',
      fn: () => void window.api.invoke('janela:zoom', 'reset')
    },
    {
      id: 'tela-cheia',
      titulo: 'Tela cheia',
      atalho: 'F11',
      fn: () => void window.api.invoke('janela:tela-cheia')
    },
    {
      id: 'auditar',
      titulo: 'Auto auditoria',
      fn: () => void rodarAutoAuditoria()
    },
    {
      id: 'sair',
      titulo: 'Sair',
      fn: () => {
        try {
          window.api.quit()
        } catch {
          void window.api.invoke('janela:fechar')
        }
      }
    },
    {
      id: 'sobre',
      titulo: 'Sobre o DG Editor',
      fn: () => void mostrarSobreDgEditor()
    }
  ]
  for (const d of defs) registrarComando(d)
}

async function mostrarSobreDgEditor() {
  let ver = ''
  try {
    ver = (await window.api.getVersion?.()) || (await window.api.invoke('app:get-version')) || ''
  } catch {
    ver = ''
  }
  alert('DG Editor' + (ver ? ' v' + ver : '') + '\nEditor de sistemas com IA local.')
}

function acaoEditar(cmd) {
  try {
    document.execCommand(cmd)
  } catch (e) {
    console.warn('[menubar] editar:', cmd, e)
  }
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
  $('palette-input').placeholder = 'Quick Open â€” nome do arquivo...'
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
          const existente = cmds.find((x) => x.id === c.id)
          if (existente) {
            existente.hint = existente.hint || c.descricao || c.atalho || ''
          } else {
            cmds.push({ id: c.id, titulo: c.titulo, atalho: c.atalho, hint: c.descricao })
          }
        }
      }
    } catch {
      /* offline meta */
    }
    const fl = f.toLowerCase()
    cmds = cmds.filter((c) => !fl || (c.titulo || '').toLowerCase().includes(fl) || c.id.includes(fl))
    for (const c of cmds) {
        paletaItens.push({ tipo: 'cmd', id: c.id, label: c.titulo, hint: c.hint || c.atalho || '' })
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
    if (pastaAtual) void escolherEscopoAnalise(pastaAtual)
  } else if (id === 'analisar-completa') {
    if (pastaAtual) void analisarCompleta(pastaAtual)
  } else if (id === 'reanalisar') {
    if (pastaAtual) void escolherEscopoAnalise(pastaAtual, true)
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
  else if (id === 'orientar-prompt') abrirOrientadorPrompt()
  else if (id === 'navegador') {
    toggleRight(true)
    ativarAbaDireita('browser')
    void abrirNavegadorUi()
  } else if (id === 'regras-projeto') {
    if (pastaAtual) void mostrarRegrasUI(pastaAtual)
  }
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
    if (!s || typeof s !== 'object') return
    const freeMem = typeof s.freeMemory === 'number' ? s.freeMemory : (typeof s.dados?.freeMemory === 'number' ? s.dados.freeMemory : NaN)
    const freePct = typeof s.freePct === 'number' ? s.freePct : (typeof s.dados?.freePct === 'number' ? s.dados.freePct : NaN)
    const cpuPercent = typeof s.cpuPercent === 'number' ? s.cpuPercent : (typeof s.dados?.cpuPercent === 'number' ? s.dados.cpuPercent : NaN)
    const ramOk = typeof s.ramOk === 'boolean' ? s.ramOk : (typeof s.dados?.ramOk === 'boolean' ? s.dados.ramOk : true)
    const mb = Number.isFinite(freeMem) ? Math.round(freeMem / 1048576) : null
    const pct = Number.isFinite(freePct) ? freePct : null
    const cpu = Number.isFinite(cpuPercent) ? cpuPercent : null
    $('guardian-text').textContent =
      'Guardião: RAM ' +
      (mb === null ? '—' : mb + ' MB') +
      (pct === null ? '' : ' (' + pct + '%)') +
      ' - CPU ' +
      (cpu === null ? '—' : cpu + '%') +
      (ramOk ? '' : ' - PAUSADO')
    $('guardian-bar').classList.toggle('guardian-alerta', !ramOk)
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
      : 'â€”'
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
    mostrarToast('IA trocou de modelo: ' + de + ' â†’ ' + para, 'aviso')
    marcarProviderFallback()
    void atualizarBadgeProvedorReal(para)
    void window.api.invoke('brain:avaliar', para).then((r) => {
      const nota = r?.avaliacao?.nota
      if (typeof nota === 'number' && nota < 6) {
        mostrarToast(
          'Modelo ' + para + ' respondeu abaixo do esperado (nota ' + nota + '/10) â€” verifique',
          'aviso'
        )
      }
    }).catch(() => {})
  })
}

$('btn-brain-avaliar')?.addEventListener('click', async () => {
  mostrarToast('Avaliando modelo ativoâ€¦', 'aviso')
  try {
    const r = await window.api.invoke('brain:avaliar')
    if (!r?.ok) {
      mostrarToast('Avaliação falhou: ' + (r?.erro || 'erro'), 'erro')
      return
    }
    const a = r.avaliacao
    mostrarToast(
      'Nota ' + a.nota + '/10 (' + a.acertos + '/' + a.total + ') â€” ' + a.modelo,
      a.nota < 6 ? 'aviso' : 'ok'
    )
  } catch (e) {
    mostrarToast('Avaliação falhou: ' + String(e), 'erro')
  }
})

// ---------- Eventos ----------
$('btn-add-folder').addEventListener('click', abrirPasta)
$('btn-open-vault')?.addEventListener('click', () => void abrirVault())
$('btn-close-vault')?.addEventListener('click', () => void fecharVault())
$('md-preview')?.addEventListener('click', (ev) => {
  const a = ev.target?.closest?.('a.wiki-link')
  if (!a) return
  ev.preventDefault()
  const alvo = a.getAttribute('data-wiki-target')
  if (alvo) void abrirWikiLink(alvo)
})
$('btn-empty-open')?.addEventListener('click', abrirPasta)
$('btn-analise-rapida')?.addEventListener('click', () => {
  if (pastaAtual) void rodarAnalise(pastaAtual, 'rapida')
})
$('btn-analise-completa')?.addEventListener('click', () => {
  if (pastaAtual) void analisarCompleta(pastaAtual)
})
$('btn-config').addEventListener('click', abrirConfig)
$('btn-config-close').addEventListener('click', () => $('modal-config').classList.add('hidden'))
$('btn-oc-salvar')?.addEventListener('click', () => void salvarConfigOpenClawUi())
$('btn-oc-limpar-token')?.addEventListener('click', async () => {
  await window.api.invoke('openclaw:token-clear')
  await carregarConfigOpenClawUi()
})
$('btn-oc-preview-editor')?.addEventListener('click', () => {
  const p = ocPendentes.find((x) => x.id === ocPendenteAtivoId)
  if (p) void previewDiffNoEditor(p)
})
$('btn-oc-aplicar')?.addEventListener('click', () => void aplicarPendenteOc())
$('btn-oc-aplicar-hunks')?.addEventListener('click', () => void aplicarHunksSelecionadosOc())
$('btn-oc-rejeitar')?.addEventListener('click', () => void rejeitarPendenteOc())

// Chat agent/mode selector - respects DG Editor agents and serial queue
const chatModes = [
  { id: 'auto', label: 'Auto' },
  { id: 'code', label: 'Code' },
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

async function carregarOpcoesAgenteChat(raiz = pastaAtual) {
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
}

function initChatAgentSelector() {
  const bar = document.getElementById('chat-header-actions')
  if (!bar) return
  if (document.getElementById('chat-agent-select')) return
  const wrap = document.createElement('div')
  wrap.className = 'chat-header-selectors'
  const agentSel = document.createElement('select')
  agentSel.id = 'chat-agent-select'
  agentSel.className = 'chat-control-select'
  agentSel.setAttribute('aria-label', 'Agente')
  const modeSel = document.createElement('select')
  modeSel.id = 'chat-mode-select'
  modeSel.className = 'chat-control-select'
  modeSel.setAttribute('aria-label', 'Modo')
  for (const m of chatModes) {
    const o = document.createElement('option')
    o.value = m.id
    o.textContent = m.label
    modeSel.appendChild(o)
  }
  wrap.appendChild(agentSel)
  wrap.appendChild(modeSel)
  // Botão Mais opções estilo Kilo
  const maisWrap = document.createElement('div')
  maisWrap.className = 'chat-more-wrap'
  const btnMais = document.createElement('button')
  btnMais.type = 'button'
  btnMais.className = 'btn-small chat-more-toggle'
  btnMais.id = 'btn-chat-mais'
  btnMais.textContent = 'Mais opções'
  btnMais.setAttribute('aria-haspopup', 'menu')
  btnMais.setAttribute('aria-expanded', 'false')
  btnMais.setAttribute('aria-controls', 'chat-mais-menu')
  const menu = document.createElement('div')
  menu.id = 'chat-mais-menu'
  menu.className = 'chat-more-menu'
  menu.setAttribute('role', 'menu')
  menu.hidden = true
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
  const itemPrompt = document.createElement('button')
  itemPrompt.type = 'button'
  itemPrompt.className = 'chat-more-item'
  itemPrompt.setAttribute('role', 'menuitem')
  itemPrompt.textContent = 'Melhorar prompt'
  itemPrompt.addEventListener('click', (e) => {
    e.stopPropagation()
    setMenuOpen(false)
    try {
      if (typeof abrirOrientadorPrompt === 'function') abrirOrientadorPrompt()
      else document.getElementById('btn-prompt-orientador')?.click()
    } catch {}
  })
  menu.appendChild(itemAuto)
  menu.appendChild(itemPrompt)
  btnMais.addEventListener('click', (e) => {
    e.stopPropagation()
    const open = btnMais.getAttribute('aria-expanded') !== 'true'
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
  maisWrap.appendChild(btnMais)
  maisWrap.appendChild(menu)
  wrap.appendChild(maisWrap)
  bar.insertBefore(wrap, bar.firstChild)
  void carregarOpcoesAgenteChat()
  try {
    const vm = localStorage.getItem('dg-chat-mode')
    if (vm) modeSel.value = vm
  } catch {}
  agentSel.addEventListener('change', () => {
    try {
      localStorage.setItem('dg-chat-agent', agentSel.value)
    } catch {}
  })
  modeSel.addEventListener('change', () => {
    try {
      localStorage.setItem('dg-chat-mode', modeSel.value)
    } catch {}
  })
}
function atualizarStatusAgent(modelo, ms, fila) {
  const el = $('sb-agent')
  if (!el) return
  const partes = []
  if (modelo) partes.push(modelo)
  if (ms != null) partes.push(ms + 'ms')
  if (fila) {
    if (fila.ocupado) partes.push('filaâ—')
    else if (fila.tamanho) partes.push('fila:' + fila.tamanho)
  }
  el.textContent = partes.length ? 'Agent: ' + partes.join(' Â· ') : 'Agent: â€”'
}

async function carregarAgentesUi() {
  const sel = $('agent-select')
  if (!sel || !pastaAtual) return
  const r = await window.api.invoke('agente:listar', pastaAtual)
  const cur = sel.value
  sel.innerHTML = ''
  for (const a of r?.agentes || []) {
    const o = document.createElement('option')
    o.value = a.id
    o.textContent = a.nome || a.id
    sel.appendChild(o)
  }
  if (cur) sel.value = cur
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

function renderAgentTrace(passos) {
  const box = $('agent-trace')
  if (!box) return
  box.innerHTML = ''
  if (!passos || !passos.length) {
    box.innerHTML = '<span class="muted">Sem tool calls neste turno.</span>'
    return
  }
  for (const p of passos) {
    const div = document.createElement('div')
    div.className = 'step'
    if (p.tipo === 'tool') {
      div.textContent =
        'âš™ ' +
        (p.nome || 'tool') +
        (p.resultado ? ' â†’ ' + String(p.resultado).slice(0, 160) : '')
    } else {
      div.textContent = 'ðŸ’¬ ' + String(p.texto || '').slice(0, 200)
    }
    box.appendChild(div)
  }
  box.scrollTop = box.scrollHeight
}

function appendAgentTraceLive(line) {
  const box = $('agent-trace')
  if (!box) return
  if (box.querySelector('.muted')) box.innerHTML = ''
  const div = document.createElement('div')
  div.className = 'step'
  div.textContent = line
  box.appendChild(div)
  box.scrollTop = box.scrollHeight
}

function mostrarPropostasAgent(propostas) {
  agentPropostas = propostas || []
  const box = $('agent-propostas-resumo')
  if (!box) return
  if (!agentPropostas.length) {
    box.hidden = true
    box.innerHTML = ''
    box.removeAttribute('aria-label')
    return
  }
  box.hidden = false
  const n = agentPropostas.length
  const linhas = agentPropostas
    .map((p) => {
      const add = (String(p.unifiedDiff || '').match(/^\+/gm) || []).length
      const del = (String(p.unifiedDiff || '').match(/^-/gm) || []).length
      return (
        '<li><code>' +
        String(p.path || '').replace(/</g, '&lt;') +
        '</code> <span class="muted">+' +
        Math.max(0, add - 1) +
        '/âˆ’' +
        Math.max(0, del - 1) +
        '</span></li>'
      )
    })
    .join('')
  box.setAttribute('aria-label', n + ' proposta(s) de edição pendentes')
  box.innerHTML =
    '<div class="agent-propostas-titulo"><strong>' +
    n +
    ' proposta(s)</strong></div><ul class="agent-propostas-lista">' +
    linhas +
    '</ul>'
  const acoes = document.createElement('div')
  acoes.className = 'agent-propostas-acoes'
  const btnVer = document.createElement('button')
  btnVer.type = 'button'
  btnVer.className = 'btn-small'
  btnVer.textContent = 'Revisar diffs'
  btnVer.addEventListener('click', () => abrirFilaPropostasAgent())
  const btnAll = document.createElement('button')
  btnAll.type = 'button'
  btnAll.className = 'btn-small'
  btnAll.textContent = 'Aplicar todas'
  btnAll.addEventListener('click', () => void aplicarTodasPropostasAgent())
  acoes.appendChild(btnVer)
  acoes.appendChild(btnAll)
  box.appendChild(acoes)
}

function abrirFilaPropostasAgent() {
  if (!agentPropostas.length) return
  ocPendentes = agentPropostas.map((p) => ({
    id: p.id,
    path: p.path,
    absPath: p.absPath || p.path,
    unifiedDiff: p.unifiedDiff
  }))
  // reutilizar painel OpenClaw mas apply via agente:aplicar-proposta
  renderListaPendentesOc()
  mostrarDiffOpenClaw(ocPendentes[0])
  window.__dgApplyViaAgente = true
}

async function aplicarTodasPropostasAgent() {
  if (!agentPropostas.length) return
  if (!window.confirm('Aplicar ' + agentPropostas.length + ' arquivo(s)? Checkpoint será criado por arquivo.'))
    return
  for (const p of [...agentPropostas]) {
    const r = await window.api.invoke('agente:aplicar-proposta', p.id, pastasPermitidas())
    if (!r?.ok) {
      alert('Falha em ' + p.path + ': ' + (r?.erro || ''))
      break
    }
  }
  const rest = await window.api.invoke('agente:propostas')
  mostrarPropostasAgent(rest?.pendentes || [])
  alert('Apply concluído.')
}

function ligarProgressoAgent() {
  if (agentProgressUnsub) agentProgressUnsub()
  agentProgressUnsub = window.api.on('agente:progresso', (_e, ev) => {
    if (!ev || typeof ev !== 'object') return
    if (ev.tipo === 'status') appendAgentTraceLive('â€¦ ' + ev.texto)
    else if (ev.tipo === 'tool' && ev.fase === 'inicio') appendAgentTraceLive('âš™ ' + ev.nome + 'â€¦')
    else if (ev.tipo === 'tool' && ev.fase === 'fim')
      appendAgentTraceLive('âœ“ ' + ev.nome + (ev.detalhe ? ' â†’ ' + String(ev.detalhe).slice(0, 80) : ''))
    else if (ev.tipo === 'proposta') { appendAgentTraceLive('proposta ' + ev.path); if (ev.id) void previewDiffNoEditor({ id: ev.id, path: ev.path }) }
    else if (ev.tipo === 'texto-delta') {
      const out = $('agent-output')
      if (out) {
        if (out.dataset.stream !== '1') out.textContent = ''
        out.dataset.stream = '1'
        out.textContent += String(ev.texto || '')
      }
    }
    else if (ev.tipo === 'texto') {
      const out = $('agent-output')
      if (out) {
        out.textContent = String(ev.texto || '')
        delete out.dataset.stream
      }
    }
  })
}

function coletarAbasCtx() {
  const out = []
  for (const a of abas) {
    const item = { path: a.caminho, ativa: a.caminho === abaAtiva }
    if (a.caminho === abaAtiva && editor && editor.getConteudo) {
      try {
        item.conteudo = editor.getConteudo()
      } catch {
        /* */
      }
    }
    out.push(item)
  }
  return out
}

/** Erros/diagnostics recentes do agent (typecheck/test/manual) para o contexto. */
async function coletarErrosEditor() {
  try {
    const r = await window.api.invoke('agente:diagnosticos')
    const lista = (r?.recentes || r?.diagnosticos || []).filter((d) => d && d.ok === false && d.saida)
    if (!lista.length) return ''
    return lista
      .slice(0, 5)
      .map((d) => '[' + d.origem + '] ' + (d.resumo || '') + '\n' + String(d.saida || '').slice(0, 3000))
      .join('\n\n')
      .slice(0, 8000)
  } catch {
    return ''
  }
}

function renderPlanoChecklist(plano) {
  const box = $('agent-plano-checklist')
  if (!box) return
  const passos = plano?.passos || []
  if (!passos.length) {
    box.hidden = true
    box.innerHTML = ''
    return
  }
  box.hidden = false
  box.innerHTML = ''
  const titulo = document.createElement('div')
  titulo.innerHTML =
    '<strong>Plano</strong> <span class="muted">' +
    passos.filter((p) => p.feito).length +
    '/' +
    passos.length +
    '</span>'
  box.appendChild(titulo)
  for (const p of passos) {
    const lab = document.createElement('label')
    if (p.feito) lab.classList.add('feito')
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = !!p.feito
    cb.addEventListener('change', async () => {
      await window.api.invoke('agente:plano-marcar-passo', p.id, cb.checked)
      const r = await window.api.invoke('agente:plano-ler')
      renderPlanoChecklist(r?.plano)
    })
    const span = document.createElement('span')
    span.textContent = p.texto
    lab.appendChild(cb)
    lab.appendChild(span)
    box.appendChild(lab)
  }
}

async function refrescarPlanoUi() {
  const r = await window.api.invoke('agente:plano-ler')
  renderPlanoChecklist(r?.plano)
}

async function executarAgentUi(orquestrar) {
  if (!pastaAtual) {
    alert('Abra uma pasta primeiro.')
    return
  }
  const input = $('agent-input')
  const texto = input?.value?.trim()
  if (!texto) return
  const plan = $('agent-plan-mode')?.checked
  const verify = $('agent-verify-loop')?.checked
  const agente = $('agent-select')?.value || undefined
  const out = $('agent-output')
  const send = $('agent-send')
  if (send) send.disabled = true
  if (out) out.textContent = plan ? 'Gerando planoâ€¦' : 'Executandoâ€¦'
  renderAgentTrace([])
  mostrarPropostasAgent([])
  ligarProgressoAgent()
  let selecao = ''
  try {
    if (editor && editor.getSelecao) selecao = editor.getSelecao() || ''
  } catch {
    /* */
  }
  try {
    let r
    if (orquestrar) {
      r = await window.api.invoke('agente:orquestrar', pastaAtual, texto)
      if (out) {
        out.textContent = (r?.passos || [])
          .map((p) => '## ' + p.agente + (p.ok ? '' : ' (erro)') + '\n' + (p.texto || p.erro || ''))
          .join('\n\n')
      }
      const todos = []
      for (const p of r?.passos || []) {
        if (p.passos) todos.push(...p.passos)
      }
      renderAgentTrace(todos)
    } else {
      const errosEditor = await coletarErrosEditor()
      r = await window.api.invoke('agente:pedir', {
        raiz: pastaAtual,
        pergunta: texto,
        modo: plan ? 'plan' : 'agent',
        agente,
        pastas: pastasPermitidas(),
        selecao,
        arquivoAtivo: abaAtiva || undefined,
        proposeWrites: true,
        verificarApos: !!verify && !plan,
        abas: coletarAbasCtx(),
        incluirGit: true,
        errosEditor: errosEditor || undefined
      })
      if (!r?.ok) {
        if (out) out.textContent = 'Erro: ' + (r?.erro || 'falha')
        return
      }
      if (out) {
        out.textContent =
          (plan ? '[PLAN]\n\n' : '') +
          (r.texto || '') +
          (r.duracaoMs ? '\n\nâ€” ' + r.duracaoMs + ' ms Â· ' + (r.modelo || '') : '')
      }
      renderAgentTrace(r.passos || [])
      mostrarPropostasAgent(r.propostas || [])
      atualizarStatusAgent(r.modelo, r.duracaoMs, r.fila)
      if (plan || r.plano) renderPlanoChecklist(r.plano)
      else await refrescarPlanoUi()
    }
    await carregarAgentesUi()
  } catch (e) {
    if (out) out.textContent = 'Erro: ' + String(e)
  } finally {
    if (send) send.disabled = false
  }
}

$('agent-send')?.addEventListener('click', () => void executarAgentUi(false))
$('btn-agent-orquestrar')?.addEventListener('click', () => void executarAgentUi(true))
$('btn-agent-stop')?.addEventListener('click', async () => {
  const r = await window.api.invoke('agente:cancelar')
  appendAgentTraceLive('â–  cancelado (' + (r?.cancelados || 0) + ')')
  await carregarAgentesUi()
})
$('btn-agent-exec-plano')?.addEventListener('click', async () => {
  if (!pastaAtual) return
  ligarProgressoAgent()
  const out = $('agent-output')
  if (out) out.textContent = 'Executando plano salvoâ€¦'
  const r = await window.api.invoke('agente:executar-plano', {
    raiz: pastaAtual,
    pastas: pastasPermitidas(),
    soProximo: false
  })
  if (!r?.ok) {
    alert(r?.erro || 'falha')
    return
  }
  if (out) out.textContent = r.texto || ''
  renderAgentTrace(r.passos || [])
  mostrarPropostasAgent(r.propostas || [])
  atualizarStatusAgent(r.modelo, r.duracaoMs, null)
  renderPlanoChecklist(r.plano)
})
$('btn-agent-exec-passo')?.addEventListener('click', async () => {
  if (!pastaAtual) return
  ligarProgressoAgent()
  const out = $('agent-output')
  if (out) out.textContent = 'Executando próximo passoâ€¦'
  const r = await window.api.invoke('agente:executar-plano', {
    raiz: pastaAtual,
    pastas: pastasPermitidas(),
    soProximo: true
  })
  if (!r?.ok) {
    alert(r?.erro || 'falha')
    return
  }
  if (out) {
    out.textContent =
      (r.passoExecutado ? '[Passo] ' + r.passoExecutado.texto + '\n\n' : '') + (r.texto || '')
  }
  renderAgentTrace(r.passos || [])
  mostrarPropostasAgent(r.propostas || [])
  renderPlanoChecklist(r.plano)
})
$('btn-agent-verificar')?.addEventListener('click', async () => {
  if (!pastaAtual) return
  appendAgentTraceLive('â€¦ typecheck')
  const r = await window.api.invoke('agente:verificar', {
    raiz: pastaAtual,
    pastas: pastasPermitidas(),
    modo: 'typecheck'
  })
  const d = r?.diagnostico
  appendAgentTraceLive(d?.ok ? 'âœ“ typecheck ok' : 'âœ— ' + (d?.resumo || 'falha'))
  const out = $('agent-output')
  if (out && d && !d.ok) out.textContent = (out.textContent || '') + '\n\n[typecheck]\n' + (d.saida || '')
})
$('btn-agent-undo')?.addEventListener('click', async () => {
  const r = await window.api.invoke('agente:checkpoint-desfazer')
  alert(r?.ok ? 'Checkpoint restaurado (' + r.restaurados + ' arquivo(s)).' : 'Falha: ' + (r?.erro || ''))
})
$('agent-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void executarAgentUi(false)
  }
})
void refrescarPlanoUi()

$('btn-contas').addEventListener('click', abrirContas)
$('btn-diag').addEventListener('click', rodarDiagnostico)
$('btn-contas-close').addEventListener('click', () => $('modal-contas').classList.add('hidden'))
$('btn-adapta-copiar')?.addEventListener('click', () => void copiarContinuidadeAdapta(false))
$('btn-adapta-gerar')?.addEventListener('click', async () => {
  const g = await window.api.invoke('adapta:gerar')
  alert(g?.ok ? 'Continuidade gerada em:\n' + g.destino : 'Falha: ' + (g?.erro || ''))
  await atualizarPainelAdapta('adapta-status')
})
$('btn-adapta-mcp')?.addEventListener('click', () => void copiarMcpAdapta())
$('btn-adapta-one')?.addEventListener('click', () => void window.api.invoke('adapta:abrir', 'one'))
$('btn-adapta-maestro')?.addEventListener('click', () => void window.api.invoke('adapta:abrir', 'maestro'))
$('btn-adapta-docs')?.addEventListener('click', () => void window.api.invoke('adapta:abrir', 'docs'))
$('btn-adapta-copiar-cfg')?.addEventListener('click', () => void copiarContinuidadeAdapta(false))
$('btn-adapta-gerar-cfg')?.addEventListener('click', async () => {
  const g = await window.api.invoke('adapta:gerar')
  alert(g?.ok ? 'Continuidade gerada.' : 'Falha: ' + (g?.erro || ''))
  await atualizarPainelAdapta('adapta-status-cfg')
})
$('btn-adapta-mcp-cfg')?.addEventListener('click', () => void copiarMcpAdapta())
$('btn-adapta-one-cfg')?.addEventListener('click', () => void window.api.invoke('adapta:abrir', 'one'))
$('btn-adapta-maestro-cfg')?.addEventListener('click', () =>
  void window.api.invoke('adapta:abrir', 'maestro')
)
let chatAnexos = []
function renderizarAnexosChat() {
  const bar = document.getElementById('chat-anexos-preview')
  if (!bar) return
  if (!chatAnexos.length) {
    bar.style.display = 'none'
    bar.innerHTML = ''
    return
  }
  bar.style.display = 'flex'
  bar.innerHTML = ''
  for (let i = 0; i < chatAnexos.length; i++) {
    const a = chatAnexos[i]
    const el = document.createElement('div')
    el.style.cssText = 'display:flex;align-items:center;gap:6px;background:var(--panel);border:1px solid var(--border);padding:4px 6px;border-radius:6px'
    const txt = document.createElement('span')
    txt.textContent = a.nome + (a.tamanho ? ' (' + Math.round(a.tamanho / 1024) + 'KB)' : '')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'btn-ghost'
    btn.textContent = '×'
    btn.onclick = () => {
      chatAnexos.splice(i, 1)
      renderizarAnexosChat()
    }
    el.appendChild(txt)
    el.appendChild(btn)
    bar.appendChild(el)
  }
}
document.getElementById('btn-chat-anexar')?.addEventListener('click', () => {
  document.getElementById('chat-anexos-input')?.click()
})
document.getElementById('chat-anexos-input')?.addEventListener('change', async (e) => {
  const input = e.target
  const files = Array.from(input.files || [])
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer()
      const bytes = new Uint8Array(buf)
      let bin = ''
      const passo = 8192
      for (let i = 0; i < bytes.length; i += passo) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + passo))
      }
      const base64 = btoa(bin)
      chatAnexos.push({
        nome: f.name,
        tipo: f.type || '',
        tamanho: f.size,
        data: base64
      })
    } catch {}
  }
  input.value = ''
  renderizarAnexosChat()
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
  if (mod && key === 'p' && !e.shiftKey && !e.altKey) {
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
  if (mod && e.altKey && key === 'p') {
    e.preventDefault()
    abrirOrientadorPrompt()
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
  if (e.altKey && !mod && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'Left')) {
    e.preventDefault()
    void irHistAbas(-1)
    return
  }
  if (e.altKey && !mod && !e.shiftKey && (e.key === 'ArrowRight' || e.key === 'Right')) {
    e.preventDefault()
    void irHistAbas(1)
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
    if (!$('modal-prompt-orientador')?.classList.contains('hidden')) fecharOrientadorPrompt()
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
// Config/Contas flutuantes: não fecham ao clicar no fundo (só no ×)
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
    // Mesma regua do boot (autoAtualizar=false) â€” numeros OK/warn/erro identicos
    const r = await window.api.invoke('auditoria:rodar', {
      autoAtualizar: false,
      reiniciarAoFim: false
    })
    if (!r || r.erro) {
      console.warn('[auditoria] erro:', r && r.erro)
    } else {
      const falhas = (r.achados || []).filter(function (a) {
        return a.status === 'falhou'
      })
      const pend = (r.resumo && r.resumo.pendencias) || []
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
      if (pend.length) {
        msg +=
          '\n\nPendencias:\n' +
          pend
            .map(function (p) {
              return '- [' + p.severidade + '] ' + p.id + ' â€” ' + p.titulo
            })
            .join('\n')
      }
      if (falhas.length) {
        msg +=
          '\n\nFalhas:\n' +
          falhas
            .map(function (a) {
              return '- ' + a.titulo
            })
            .join('\n')
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

/** Diretório pai de um caminho (arquivo â†’ pasta). */
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

// ---------- Menubar (titlebar frameless) ----------
const MENUS_BARRA = {
  arquivo: [
    { id: 'abrir-pasta', label: 'Abrir pasta de trabalhoâ€¦', accel: 'Ctrl+O' },
    { id: 'abrir-vault', label: 'Abrir vault Markdownâ€¦' },
    { sep: true },
    { id: 'salvar', label: 'Salvar', accel: 'Ctrl+S' },
    { id: 'fechar-aba', label: 'Fechar aba', accel: 'Ctrl+W' },
    { sep: true },
    { id: 'navegador', label: 'Navegadorâ€¦', accel: 'Ctrl+Shift+N' },
    { sep: true },
    { id: 'sair', label: 'Sair', accel: 'Alt+F4' }
  ],
  editar: [
    { id: 'edit-undo', label: 'Desfazer', accel: 'Ctrl+Z', edit: 'undo' },
    { id: 'edit-redo', label: 'Refazer', accel: 'Ctrl+Y', edit: 'redo' },
    { sep: true },
    { id: 'edit-cut', label: 'Recortar', accel: 'Ctrl+X', edit: 'cut' },
    { id: 'edit-copy', label: 'Copiar', accel: 'Ctrl+C', edit: 'copy' },
    { id: 'edit-paste', label: 'Colar', accel: 'Ctrl+V', edit: 'paste' },
    { id: 'edit-selectAll', label: 'Selecionar tudo', accel: 'Ctrl+A', edit: 'selectAll' }
  ],
  ver: [
    { id: 'recarregar', label: 'Recarregar', accel: 'Ctrl+R' },
    { id: 'forcar-recarregar', label: 'Forçar recarregamento', accel: 'Ctrl+Shift+R' },
    { sep: true },
    { id: 'zoom-in', label: 'Zoom: aumentar', accel: 'Ctrl+=' },
    { id: 'zoom-out', label: 'Zoom: diminuir', accel: 'Ctrl+-' },
    { id: 'zoom-reset', label: 'Zoom: padrão', accel: 'Ctrl+0' },
    { sep: true },
    { id: 'toggle-sidebar', label: 'Alternar Explorer', accel: 'Ctrl+B' },
    { id: 'toggle-right', label: 'Alternar painel direito', accel: 'Ctrl+Alt+B' },
    { id: 'toggle-terminal', label: 'Alternar terminal', accel: 'Ctrl+`' },
    { id: 'tema', label: 'Alternar tema' },
    { sep: true },
    { id: 'tela-cheia', label: 'Tela cheia', accel: 'F11' }
  ],
  sistemas: [
    { id: 'paleta-comandos', label: 'Paleta de comandos', accel: 'Ctrl+Shift+P' },
    { id: 'quick-open', label: 'Quick Open', accel: 'Ctrl+P' },
    { sep: true },
    { id: 'contas', label: 'Contas e saúde' },
    { id: 'config', label: 'Configurações' },
    { id: 'analisar', label: 'Análise do sistema' },
    { id: 'auditar', label: 'Auto auditoria' },
    { id: 'regras-projeto', label: 'Regras do projeto (.dgrules)' },
    { sep: true },
    { id: 'navegador', label: 'Navegador embutido', accel: 'Ctrl+Shift+N' }
  ],
  ajuda: [{ id: 'sobre', label: 'Sobre o DG Editor' }]
}

function fecharMenubar() {
  const bar = document.getElementById('menubar')
  if (!bar) return
  bar.dataset.open = ''
  bar.querySelectorAll('.mb-btn').forEach((b) => b.setAttribute('aria-expanded', 'false'))
  bar.querySelectorAll('.mb-dropdown').forEach((p) => {
    p.hidden = true
  })
}

function abrirMenuPainel(nome) {
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
    acaoEditar(editCmd)
    return
  }
  if (executarComandoLocal(id)) return
  executarComando(id)
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

function initMenubar() {
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

// ---------- Boot ----------
carregarLayout()
sincronizarBotoesPainelDireito()
$('btn-right-collapse')?.addEventListener('click', () => toggleRight(false))
$('btn-right-expand')?.addEventListener('click', () => toggleRight(true))
carregarPastas()
initResizers()
initActivityBar()
bootstrapComandos()
initMenubar()
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
setSidebarMode('explorer')
// Centro: Chat se já houver mensagens; senão Editor
{
  const temConversa = !!document.querySelector(
    '#chat-messages .msg, #chat-messages .chat-msg, #chat-messages .bolha, #chat-messages .message'
  )
  ativarAbaCentro(temConversa ? 'chat' : 'editor')
}
renderizarPastas()
  .then(() => garantirPastaRaizProjeto())
  .then(() => restaurarAbas())
void renderizarProjects().then(() => atualizarStatusBar(pastaAtual || pastasRecentes[0] || null))
void atualizarStatusBar(pastaAtual || pastasRecentes[0] || null)
atualizarGuardiao()
setInterval(atualizarGuardiao, 5000)
void atualizarBadgeProvedorReal()

document.addEventListener('DOMContentLoaded', function () {
  var btn = document.getElementById('btn-auditar')
  if (btn) btn.addEventListener('click', rodarAutoAuditoria)
  var bMin = document.getElementById('tb-min')
  var bMax = document.getElementById('tb-max')
  var bClose = document.getElementById('tb-close')
  var bVoltar = document.getElementById('tb-voltar')
  var bAvancar = document.getElementById('tb-avancar')
  if (bVoltar) bVoltar.addEventListener('click', function () {
    void irHistAbas(-1)
  })
  if (bAvancar) bAvancar.addEventListener('click', function () {
    void irHistAbas(1)
  })
  atualizarBotoesHist()
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
  initMenubar()
})




