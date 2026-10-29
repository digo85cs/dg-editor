/** Extrai alvos de [[wiki links]] (ignora display alias após |). */
export function extrairWikiLinks(texto: string): string[] {
  const out: string[] = []
  const re = /\[\[([^\]]+)\]\]/g
  let m: RegExpExecArray | null
  const src = String(texto || '')
  while ((m = re.exec(src))) {
    const raw = m[1].trim()
    if (!raw) continue
    const alvo = raw.split('|')[0].trim()
    if (alvo) out.push(alvo)
  }
  return out
}

export function normalizarAlvoLink(alvo: string): string {
  let a = String(alvo || '').trim().replace(/\\/g, '/')
  if (a.toLowerCase().endsWith('.md')) a = a.slice(0, -3)
  return a
}

export type EntradaResolucao = {
  path: string
  rel: string
  basename: string
  aliases: string[]
}

/**
 * Resolve [[alvo]] por basename (sem .md); empate prefere pasta da nota origem.
 * Fallback: path relativo (quando o alvo contém '/').
 */
export function resolverLink(
  alvo: string,
  notas: EntradaResolucao[],
  notaOrigemRel?: string
): string | null {
  const n = normalizarAlvoLink(alvo)
  if (!n) return null

  const origemDir = notaOrigemRel
    ? notaOrigemRel.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
    : ''

  function desempatar(candidatos: EntradaResolucao[]): string {
    if (candidatos.length === 1) return candidatos[0].path
    const copia = [...candidatos]
    copia.sort((a, b) => {
      const ra = a.rel.replace(/\\/g, '/')
      const rb = b.rel.replace(/\\/g, '/')
      const da = origemDir && ra.startsWith(origemDir + '/') ? 0 : 1
      const db = origemDir && rb.startsWith(origemDir + '/') ? 0 : 1
      if (da !== db) return da - db
      return ra.length - rb.length || ra.localeCompare(rb)
    })
    return copia[0].path
  }

  // 1) basename / alias
  const base = n.includes('/') ? n.split('/').pop()! : n
  const baseLower = base.toLowerCase()
  const porNome = notas.filter((x) => {
    const b = x.basename.replace(/\.md$/i, '').toLowerCase()
    if (b === baseLower) return true
    return x.aliases.some(
      (al) => al.toLowerCase() === baseLower || al.toLowerCase() === n.toLowerCase()
    )
  })
  if (porNome.length && !n.includes('/')) return desempatar(porNome)

  // 2) path relativo (fallback ou alvo com /)
  const porPath = notas.filter((x) => {
    const rel = x.rel.replace(/\\/g, '/')
    const relSem = rel.toLowerCase().endsWith('.md') ? rel.slice(0, -3) : rel
    return (
      relSem === n ||
      rel === n ||
      rel === n + '.md' ||
      relSem.toLowerCase() === n.toLowerCase()
    )
  })
  if (porPath.length) return desempatar(porPath)

  // 3) basename mesmo com path no alvo (ex.: pasta/Foo → Foo)
  if (porNome.length) return desempatar(porNome)
  return null
}
