/**
 * Parse / filtro / geração de unified diffs com múltiplos hunks.
 */

export type HunkInfo = {
  index: number
  header: string
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: string[]
  /** resumo curto para UI */
  resumo: string
}

/** Extrai hunks @@ de um unified diff. */
export function listarHunks(diff: string): HunkInfo[] {
  const diffLines = String(diff || '').replace(/\r\n/g, '\n').split('\n')
  const out: HunkInfo[] = []
  let i = 0
  while (i < diffLines.length) {
    const m = diffLines[i].match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@(.*)$/)
    if (!m) {
      i++
      continue
    }
    const header = diffLines[i]
    const oldStart = parseInt(m[1], 10)
    const oldCount = m[2] != null ? parseInt(m[2], 10) : 1
    const newStart = parseInt(m[3], 10)
    const newCount = m[4] != null ? parseInt(m[4], 10) : 1
    const body: string[] = []
    i++
    while (i < diffLines.length && !diffLines[i].startsWith('@@')) {
      if (
        diffLines[i].startsWith('diff ') ||
        diffLines[i].startsWith('index ') ||
        diffLines[i].startsWith('---') ||
        diffLines[i].startsWith('+++')
      ) {
        break
      }
      body.push(diffLines[i])
      i++
    }
    const add = body.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length
    const del = body.filter((l) => l.startsWith('-') && !l.startsWith('---')).length
    out.push({
      index: out.length,
      header,
      oldStart,
      oldCount,
      newStart,
      newCount,
      lines: body,
      resumo: '+' + add + '/−' + del
    })
  }
  return out
}

/** Prefixo ---/+++ do diff original. */
export function cabecalhoDiff(diff: string): string[] {
  const lines = String(diff || '').replace(/\r\n/g, '\n').split('\n')
  const head: string[] = []
  for (const ln of lines) {
    if (ln.startsWith('@@')) break
    head.push(ln)
  }
  return head
}

/** Reconstrói unified diff mantendo só os hunks cujo índice está em `aceitar`. */
export function filtrarHunks(diff: string, aceitar: number[]): string {
  const hunks = listarHunks(diff)
  const set = new Set(aceitar)
  const escolhidos = hunks.filter((h) => set.has(h.index))
  if (!escolhidos.length) return ''
  const head = cabecalhoDiff(diff)
  const parts = [...head]
  for (const h of escolhidos) {
    parts.push(h.header)
    parts.push(...h.lines)
  }
  let out = parts.join('\n')
  if (!out.endsWith('\n')) out += '\n'
  return out
}

/**
 * Diff unificado linha a linha com hunks agrupados (contexto = 3).
 * LCS para arquivos pequenos; fallback replace completo se > 4000 linhas.
 */
export function gerarDiffUnificado(pathLabel: string, antes: string, depois: string, contexto = 3): string {
  const aRaw = antes.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const bRaw = depois.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const a = aRaw === '' ? [] : aRaw.split('\n')
  const b = bRaw === '' ? [] : bRaw.split('\n')
  // strip trailing empty from split of files ending in newline — keep semantics via endsWith
  if (a.length && a[a.length - 1] === '' && aRaw.endsWith('\n')) a.pop()
  if (b.length && b[b.length - 1] === '' && bRaw.endsWith('\n')) b.pop()

  const head = ['--- a/' + pathLabel, '+++ b/' + pathLabel]

  if (a.length > 4000 || b.length > 4000) {
    const lines = [
      ...head,
      '@@ -1,' + Math.max(1, a.length) + ' +1,' + Math.max(1, b.length) + ' @@'
    ]
    for (const ln of a) lines.push('-' + ln)
    for (const ln of b) lines.push('+' + ln)
    return lines.join('\n') + '\n'
  }

  const ops = lcsOps(a, b)
  // Agrupa em hunks com contexto
  type Mark = { kind: 'eq' | 'del' | 'add'; text: string; ai: number; bi: number }
  const marks: Mark[] = []
  let ai = 0
  let bi = 0
  for (const op of ops) {
    if (op === 'eq') {
      marks.push({ kind: 'eq', text: a[ai], ai, bi })
      ai++
      bi++
    } else if (op === 'del') {
      marks.push({ kind: 'del', text: a[ai], ai, bi })
      ai++
    } else {
      marks.push({ kind: 'add', text: b[bi], ai, bi })
      bi++
    }
  }

  const changeIdx: number[] = []
  for (let i = 0; i < marks.length; i++) {
    if (marks[i].kind !== 'eq') changeIdx.push(i)
  }
  if (!changeIdx.length) {
    return head.join('\n') + '\n'
  }

  // intervalos [start,end] inclusive com contexto, mesclados
  type Range = { start: number; end: number }
  const ranges: Range[] = []
  for (const ci of changeIdx) {
    const start = Math.max(0, ci - contexto)
    const end = Math.min(marks.length - 1, ci + contexto)
    const last = ranges[ranges.length - 1]
    if (last && start <= last.end + 1) {
      last.end = Math.max(last.end, end)
    } else {
      ranges.push({ start, end })
    }
  }

  const out: string[] = [...head]
  for (const r of ranges) {
    const slice = marks.slice(r.start, r.end + 1)
    const oldStart = slice.find((m) => m.kind !== 'add')?.ai ?? slice[0].ai
    const newStart = slice.find((m) => m.kind !== 'del')?.bi ?? slice[0].bi
    let oldCount = 0
    let newCount = 0
    const body: string[] = []
    for (const m of slice) {
      if (m.kind === 'eq') {
        body.push(' ' + m.text)
        oldCount++
        newCount++
      } else if (m.kind === 'del') {
        body.push('-' + m.text)
        oldCount++
      } else {
        body.push('+' + m.text)
        newCount++
      }
    }
    out.push(
      '@@ -' +
        (oldCount === 0 ? oldStart : oldStart + 1) +
        ',' +
        oldCount +
        ' +' +
        (newCount === 0 ? newStart : newStart + 1) +
        ',' +
        newCount +
        ' @@'
    )
    out.push(...body)
  }
  return out.join('\n') + '\n'
}

/** LCS ops: sequência de 'eq'|'del'|'add'. */
function lcsOps(a: string[], b: string[]): Array<'eq' | 'del' | 'add'> {
  const n = a.length
  const m = b.length
  // DP compacto por linhas
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = (dp[i + 1][j + 1] + 1) as number
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]) as number
    }
  }
  const ops: Array<'eq' | 'del' | 'add'> = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push('eq')
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push('del')
      i++
    } else {
      ops.push('add')
      j++
    }
  }
  while (i < n) {
    ops.push('del')
    i++
  }
  while (j < m) {
    ops.push('add')
    j++
  }
  return ops
}
