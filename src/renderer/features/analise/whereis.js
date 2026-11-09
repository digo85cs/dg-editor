import { escapar } from '../../utils/dom.js'
import { renderizarErroHtml } from './render.js'

export function renderizarWhereisVazioHtml(termo) {
  return '<p class="muted">Nada encontrado para “' + escapar(termo) + '”.</p>'
}

export function renderizarWhereisErroHtml(erro) {
  return renderizarErroHtml(erro)
}

/** @param {any} result @param {string} termo */
export function renderizarWhereisMatchesHtml(result, termo) {
  const matches = Array.isArray(result?.matches) ? result.matches : []
  if (matches.length === 0) return renderizarWhereisVazioHtml(termo)
  const lis = matches.slice(0, 30).map((m) => {
    const file = String(m.file || '')
    const line = Number(m.line || 1)
    const snippet = String(m.snippet || '').slice(0, 200)
    return '<li><button type="button" class="btn-ghost whereis-hit-file" data-file="' + escapar(file) + '" data-line="' + line + '">' +
      escapar(file) + ':' + line + '</button><div><code>' + escapar(snippet) + '</code></div></li>'
  }).join('')
  return '<ul>' + lis + '</ul><div class="whereis-meta">' + matches.length + ' ocorrência(s) · ' +
    Number(result?.scannedFiles || 0) + ' arquivo(s) · ' + Number(result?.durationMs || 0) + ' ms</div>'
}
