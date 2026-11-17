// repos-status.js — cache de git:repos + statusbar (branch/pasta).
// Extraído de app.js. renderizarProjects permanece no app.js pois depende de
// criarBotaoRemoverPasta/selecionarPasta/setSidebarMode.
import { state } from '../../state/app-state.js'

const $ = (id) => document.getElementById(id)

function nomeBase(p) {
  const s = String(p || '').replace(/\//g, '\\')
  const i = s.lastIndexOf('\\')
  return i >= 0 ? s.slice(i + 1) : s
}

/** Cache local do ultimo git:repos (main tambem cacheia 30s). */
let reposCacheLocal = { ts: 0, itens: [] }
const REPOS_CACHE_LOCAL_MS = 30000

export async function obterReposGit(force) {
  if (
    !force &&
    reposCacheLocal.ts &&
    Date.now() - reposCacheLocal.ts <= REPOS_CACHE_LOCAL_MS
  ) {
    return reposCacheLocal.itens
  }
  try {
    const r = await window.api.invoke('git:repos', { pastas: [...state.pastasRecentes] })
    reposCacheLocal = { ts: Date.now(), itens: Array.isArray(r) ? r : [] }
  } catch (e) {
    console.warn('[projects] git:repos', e)
    reposCacheLocal = { ts: Date.now(), itens: [] }
  }
  return reposCacheLocal.itens
}

export async function atualizarStatusBar(pasta) {
  const elBranch = $('sb-branch')
  const elPasta = $('sb-pasta')
  if (!elBranch || !elPasta) return
  if (!pasta) {
    elBranch.textContent = '—'
    elPasta.textContent = '—'
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
    elBranch.textContent = (hit.branch || 'HEAD') + (hit.dirty ? ' ●' : '')
    elPasta.textContent = hit.repo
  } else {
    elBranch.textContent = '—'
    elPasta.textContent = nomeBase(pasta)
  }
}
