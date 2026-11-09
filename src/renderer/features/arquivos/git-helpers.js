import { escapar } from '../../utils/dom.js'

/** @type {Map<string, string>} caminho relativo (posix) -> status git */
export const gitStatusMap = new Map()

/** @param {string} abs @param {string} raiz */
export function relPosix(abs, raiz) {
  const a = String(abs || '').replace(/\\/g, '/')
  const r = String(raiz || '').replace(/\\/g, '/').replace(/\/$/, '')
  if (a.toLowerCase().startsWith(r.toLowerCase() + '/')) return a.slice(r.length + 1)
  return a.split('/').pop() || a
}

export function corGit(st) {
  if (st === 'M') return '#c9a227'
  if (st === 'A') return '#2e7d4f'
  if (st === 'D') return '#b33a3a'
  return '#888'
}

/** @param {string | null | undefined} st */
export function badgeGitHtml(st) {
  if (!st) return ''
  const cor = corGit(st)
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
