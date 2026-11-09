export function renderGuardianText(snap) {
  const s = snap || {}
  const freeMB = Math.round((Number(s.freeMemory) || 0) / 1024 / 1024)
  const totalMB = Math.round((Number(s.totalMemory) || 0) / 1024 / 1024)
  const usedMB = Math.max(0, totalMB - freeMB)
  const usedPct = totalMB > 0 ? Math.round((usedMB / totalMB) * 100) : 0
  const cpu = Number.isFinite(Number(s.cpuPercent)) ? Math.round(Number(s.cpuPercent)) : null
  return 'RAM usada: ' + usedMB + ' MB (' + usedPct + '% de ' + totalMB + ' MB) · CPU: ' + (cpu == null ? '—' : cpu + '%')
}
