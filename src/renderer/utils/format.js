export function tempoRelativoCommit(ts) {
  if (!ts || !Number.isFinite(ts)) return ''
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts))
  if (s < 60) return 'agora'
  if (s < 3600) return Math.floor(s / 60) + 'm'
  if (s < 86400) return Math.floor(s / 3600) + 'h'
  return Math.floor(s / 86400) + 'd'
}
