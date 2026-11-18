/** Helpers puros do histórico de chats (sem DOM). */

export function tituloDeMensagens(msgs) {
  const primeira = (msgs || []).find((m) => m.role === 'user' && m.content)
  const raw = String(primeira?.content || 'Nova conversa').replace(/\s+/g, ' ').trim()
  return raw.slice(0, 40) || 'Nova conversa'
}

export function novoIdChat() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function tempoRelativoChat(iso) {
  const t = Date.parse(String(iso || ''))
  if (!Number.isFinite(t)) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return Math.max(1, Math.floor(s)) + 's'
  if (s < 3600) return Math.floor(s / 60) + 'm'
  if (s < 86400) return Math.floor(s / 3600) + 'h'
  return Math.floor(s / 86400) + 'd'
}
