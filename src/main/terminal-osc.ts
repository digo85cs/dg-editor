/**
 * Extrai o diretorio atual informado pelo shell via OSC 7 (file://) ou
 * OSC 9;9 (ConEmu/Windows Terminal). Funcoes puras, sem dependencias.
 */

export function normalizarCwdOsc(payload: string): string | null {
  let p = String(payload || '').replace(/[\x00\x07]/g, '').trim()
  if (!p) return null
  if (p.startsWith('file://')) {
    const sem = p.slice('file://'.length)
    const slash = sem.indexOf('/')
    if (slash < 0) return null
    p = sem.slice(slash)
    try {
      p = decodeURIComponent(p)
    } catch {
      /* mantem texto cru */
    }
  }
  p = p.replace(/\\/g, '/')
  if (/^\/[a-zA-Z]:\//.test(p)) p = p.slice(1)
  if (!/^([a-zA-Z]:\/|\/)/.test(p)) return null
  if (p.length > 1) p = p.replace(/\/+$/, '')
  return p || null
}

/**
 * Retorna o ultimo cwd encontrado no texto (chunks podem conter varias
 * sequencias), ou null. Aceita terminadores BEL (\x07) e ST (\x1b\\).
 */
export function extrairCwdDeOsc(texto: string): string | null {
  const s = String(texto || '')
  const re = /\x1b\](?:7|9;9);([^\x07\x1b]*)(?:\x07|\x1b\\)/g
  let ultimo: string | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    const cwd = normalizarCwdOsc(m[1])
    if (cwd) ultimo = cwd
  }
  return ultimo
}
