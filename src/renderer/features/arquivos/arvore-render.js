// Render da árvore de arquivos (Bloco 3) e lista de projetos (sidebar).
import { state } from '../../state/app-state.js'
import { obterHistChat } from '../chat/chat-core.js'
import { garantirLinhaFocavel } from './arvore-acoes.js'
import {
  renderizarArvoreEm as _renderizarArvoreEm,
  criarNoDir as _criarNoDir,
  criarNoFile as _criarNoFile
} from './tree-render.js'
import { carregarFilhos as _carregarFilhos } from './index.js'
import { gitStatusMap, relPosix, corGit } from './git-helpers.js'
import { nomeAmigavelArquivo } from '../../utils/nomes-amigaveis.js'
import { tempoRelativoCommit } from '../../utils/format.js'
import { abrirPainelDiff } from '../editor/diff-pendentes.js'
import { obterReposGit, atualizarStatusBar } from '../ui/repos-status.js'

const $ = (id) => document.getElementById(id)

let deps = {
  nomeArquivo: (p) => p,
  extIcon: () => '',
  sincronizarContextoPasta: async () => {},
  selecionarPasta: async () => {},
  definirContextoPasta: () => {},
  criarBotaoRemoverPasta: () => null,
  removerPasta: async () => {},
  escolherNovoCaminhoPasta: async () => {},
  abrirArquivoNaAba: async () => {},
  raizWorkspaceDe: () => null,
  setFilesListaSuja: () => {}
}

export function configurarArvoreRender(d) {
  deps = { ...deps, ...d }
}

function treeDeps() {
  return {
    renderizarPastas,
    carregarFilhos,
    selecionarPasta: deps.selecionarPasta,
    definirContextoPasta: deps.definirContextoPasta,
    raizWorkspaceDe: deps.raizWorkspaceDe,
    criarBotaoRemoverPasta: deps.criarBotaoRemoverPasta,
    nomeArquivo: deps.nomeArquivo
  }
}

export async function renderizarArvoreEm(lista) {
  const r = await _renderizarArvoreEm(lista, treeDeps())
  garantirLinhaFocavel(lista)
  return r
}

export function abaFilesVisivel() {
  return !!$('pane-files')?.classList.contains('active')
}

export async function renderizarPastas() {
  console.time('renderizarPastas')
  try {
    // Sidebar Repositórios = Cursor (pasta + chats). Sem árvore de arquivos.
    const hist = obterHistChat()
    if (hist && typeof hist.refrescarLista === 'function') {
      await hist.refrescarLista()
    } else if ($('folder-list')) {
      // Boot antes do hist: cabeçalhos das pastas
      const el = $('folder-list')
      el.innerHTML = ''
      for (const p of state.pastasRecentes || []) {
        const g = document.createElement('div')
        g.className = 'agent-chat-group' + (p === state.pastaAtual ? ' active' : '')
        g.innerHTML =
          '<div class="agent-chat-group-head-row"><button type="button" class="agent-chat-group-head" data-raiz="' +
          String(p).replace(/"/g, '') +
          '"><span class="agent-chat-folder-ico" aria-hidden="true">📁</span><span class="agent-chat-group-name"></span></button></div>' +
          '<div class="agent-chat-group-body"><p class="agent-chats-empty agent-chats-empty-sm">Sem conversas</p></div>'
        g.querySelector('.agent-chat-group-name').textContent = deps.nomeArquivo(p)
        g.querySelector('.agent-chat-group-head')?.addEventListener('click', () => {
          void deps.sincronizarContextoPasta(p, { forceAnalise: true })
        })
        el.appendChild(g)
      }
      if (!(state.pastasRecentes || []).length) {
        el.innerHTML = '<p class="agent-chats-empty">Nenhum repositório. Clique em + para adicionar.</p>'
      }
    }
    // Árvore de pastas/arquivos só no Bloco 3 → Arquivos
    if (abaFilesVisivel()) {
      await renderizarArvoreEm($('files-list'))
      deps.setFilesListaSuja(false)
    } else {
      deps.setFilesListaSuja(true)
    }
  } finally {
    console.timeEnd('renderizarPastas')
  }
}

export async function carregarFilhos(dir, container, nivel) {
  const r = await _carregarFilhos(dir, container, nivel, {
    removerPasta: deps.removerPasta,
    escolherNovoCaminhoPasta: deps.escolherNovoCaminhoPasta,
    criarNoDir,
    criarNoFile
  })
  garantirLinhaFocavel($('files-list'))
  return r
}

export function criarNoDir(ent, nivel) {
  return _criarNoDir(ent, nivel, { carregarFilhos })
}

export async function atualizarGitStatusArvore() {
  const raiz = state.pastaAtual
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
      badge.style.color = corGit(st)
    })
  } catch {
    /* */
  }
}

export function criarNoFile(ent, nivel) {
  return _criarNoFile(ent, nivel, {
    extIcon: deps.extIcon,
    nomeAmigavelArquivo,
    raizWorkspaceDe: deps.raizWorkspaceDe,
    definirContextoPasta: deps.definirContextoPasta,
    abrirArquivoNaAba: deps.abrirArquivoNaAba,
    abrirPainelDiff
  })
}

// ---------- Sidebar modos: Projects / Explorer ----------
let sidebarMode = 'explorer'

export function sidebarModeAtual() {
  return sidebarMode
}

export function setSidebarMode(mode) {
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

export async function renderizarProjects(force) {
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
    console.log('[projects] git:repos ' + ms + 'ms itens=0 pastas=' + state.pastasRecentes.length)
    void atualizarStatusBar(state.pastaAtual)
    return
  }
  for (const it of unicos) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'project-item' + (it.pasta === state.pastaAtual ? ' selected' : '')
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
    btn.appendChild(deps.criarBotaoRemoverPasta(it.pasta))
    btn.addEventListener('click', (e) => {
      if (e.target.closest('.pasta-remover')) return
      void deps.selecionarPasta(it.pasta)
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
      state.pastasRecentes.length +
      ' dedup=' +
      (itens.filter((i) => i && i.repo).length - unicos.length)
  )
  void atualizarStatusBar(state.pastaAtual)
}

export function ligarArvoreRender() {
  $('btn-refresh-tree')?.addEventListener('click', () => {
    for (const [, st] of state.estadoArvore) st.filhosCarregados = false
    renderizarPastas().then(() => atualizarGitStatusArvore())
    void renderizarProjects(true)
    void atualizarStatusBar(state.pastaAtual)
  })
  $('btn-git-refresh')?.addEventListener('click', () => {
    void atualizarGitStatusArvore()
    void renderizarProjects(true)
    void atualizarStatusBar(state.pastaAtual)
  })
  $('sidebar-mode-projects')?.addEventListener('click', () => setSidebarMode('projects'))
  $('sidebar-mode-explorer')?.addEventListener('click', () => setSidebarMode('explorer'))
}
