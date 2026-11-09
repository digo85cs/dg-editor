import { escapar } from '../../utils/dom.js'

export function normalizarMensagensChat(msgs) {
  if (Array.isArray(msgs)) return msgs
  if (Array.isArray(msgs?.mensagens)) return msgs.mensagens
  return []
}

/** Pure HTML parts for a chat bubble (content escaped). DOM insertion/scroll/animation stay in app.js. */
export function bolhaHtml(role, content, provider) {
  const cls = 'msg ' + String(role || '')
  const text = '<span class="msg-text">' + escapar(content) + '</span>'
  const tag = provider ? '<span class="msg-provider">' + escapar(provider) + '</span>' : ''
  return { cls, html: text + tag }
}
