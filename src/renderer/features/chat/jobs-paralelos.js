/**
 * Jobs de Agent por repositório — paralelismo estilo Cursor.
 * Cada pasta pode ter um job ativo; a UI do bloco 2 mostra o da pasta atual.
 */

/** @typedef {{
 *   pasta: string
 *   chatId: string
 *   titulo: string
 *   iniciadoEm: number
 *   passo: string
 *   tituloCard: string
 *   stats: object
 *   logs: string[]
 *   abort?: () => void
 *   modelo?: string
 * }} JobChat */

const jobs = new Map()

function chave(pasta, chatId) {
  return String(pasta || '').toLowerCase() + '::' + String(chatId || 'default')
}

export function listarJobsAtivos() {
  return [...jobs.values()]
}

export function jobDaPasta(pasta) {
  const p = String(pasta || '').toLowerCase()
  for (const j of jobs.values()) {
    if (String(j.pasta || '').toLowerCase() === p) return j
  }
  return null
}

export function pastaTemJob(pasta) {
  return !!jobDaPasta(pasta)
}

export function registrarJob(job) {
  const k = chave(job.pasta, job.chatId)
  jobs.set(k, {
    ...job,
    iniciadoEm: job.iniciadoEm || Date.now(),
    logs: Array.isArray(job.logs) ? job.logs.slice(-40) : [],
    stats: job.stats || {}
  })
  return jobs.get(k)
}

export function atualizarJob(pasta, chatId, patch) {
  const k = chave(pasta, chatId)
  const cur = jobs.get(k)
  if (!cur) return null
  const next = { ...cur, ...patch }
  if (patch.log) {
    next.logs = [...(cur.logs || []), String(patch.log)].slice(-40)
    delete next.log
  }
  jobs.set(k, next)
  return next
}

export function removerJob(pasta, chatId) {
  jobs.delete(chave(pasta, chatId))
}

export function algumJobAtivo() {
  return jobs.size > 0
}

/**
 * Marca linhas da sidebar Agents com animação "working".
 * @param {() => string} getPastaAtiva
 */
export function pintarSidebarJobs(getPastaAtiva) {
  const ativos = new Set(
    listarJobsAtivos().map((j) => String(j.pasta || '').toLowerCase())
  )
  document.querySelectorAll('.agent-chat-group').forEach((g) => {
    const raiz = String(g.dataset.raiz || '').toLowerCase()
    const on = ativos.has(raiz)
    g.classList.toggle('is-working', on)
    const head = g.querySelector('.agent-chat-group-name')
    if (head) {
      let pulse = head.querySelector('.agent-repo-working')
      if (on && !pulse) {
        pulse = document.createElement('span')
        pulse.className = 'agent-repo-working'
        pulse.setAttribute('aria-hidden', 'true')
        pulse.title = 'Agent trabalhando neste repositório'
        head.appendChild(pulse)
      } else if (!on && pulse) {
        pulse.remove()
      }
    }
  })
  document.querySelectorAll('.agent-chat-row').forEach((row) => {
    const raiz = String(row.dataset.raiz || '').toLowerCase()
    const id = String(row.dataset.chatId || '')
    const j = jobs.get(chave(raiz, id)) || (ativos.has(raiz) ? jobDaPasta(raiz) : null)
    const on = !!(j && String(j.chatId) === id)
    row.classList.toggle('is-working', on)
    const item = row.querySelector('.agent-chat-item')
    if (!item) return
    let dot = item.querySelector('.agent-chat-working-dot')
    if (on && !dot) {
      dot = document.createElement('span')
      dot.className = 'agent-chat-working-dot'
      dot.setAttribute('aria-hidden', 'true')
      item.insertBefore(dot, item.firstChild)
    } else if (!on && dot) {
      dot.remove()
    }
  })
  void getPastaAtiva
}
