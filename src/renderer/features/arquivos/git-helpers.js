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
  if (st === 'M') return 'var(--dg-git-m)'
  if (st === 'A') return 'var(--dg-git-a)'
  if (st === 'D') return 'var(--dg-git-d)'
  return 'var(--dg-git-outro)'
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
