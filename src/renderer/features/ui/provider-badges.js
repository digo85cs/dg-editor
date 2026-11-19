// Helpers puros de badges/formatacao do modal de provedores.
// Extraidos de providers-ui.js (sem dependencia de DOM alem de esc()).

export function motivoDe(it) {
  return (it && it.motivo) || (it && it.disponivel ? 'ok' : 'sem-chave')
}

export function badgeTier(tier) {
  const cores = { 1: '#1e5a32', 2: '#5a4a1e', 3: '#6b1e1e' }
  const rotulos = { 1: 'gratuito', 2: 'pago', 3: 'local' }
  const cor = cores[tier] || '#555'
  return '<span style="display:inline-block;padding:1px 6px;border-radius:10px;font-size:11px;background:' + cor + ';color:#fff">' + (rotulos[tier] || 'tier ' + tier) + '</span>'
}

export function badgeDisponivel(it) {
  const motivo = motivoDe(it)
  const map = {
    ok: ['#1e5a32', 'disponível'],
    local: ['#1e5a32', 'local ok'],
    'sem-chave': ['#8b1e1e', 'sem chave'],
    'chave-invalida': ['#9a3412', 'chave inválida'],
    esgotado: ['#854d0e', 'cota esgotada'],
    desativado: ['#666', 'desativado']
  }
  const [cor, lab] = map[motivo] || ['#6b1e1e', it && it.disponivel ? 'disponível' : 'indisponível']
  const lat = it && it.latenciaMs != null ? ' · ' + it.latenciaMs + 'ms' : ''
  return '<span style="color:' + cor + '">● ' + lab + lat + '</span>'
}

export function formatarData(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('pt-BR', { hour12: false }) } catch { return iso }
}

// 2 casas se >= 0.01, 4 casas se > 0 e < 0.01 (evita "$0,00" enganoso)
export function formatarUsd(v) {
  const n = Number(v) || 0
  return n > 0 && n < 0.01 ? n.toFixed(4) : n.toFixed(2)
}
