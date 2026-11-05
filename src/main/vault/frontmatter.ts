import type { FrontmatterVault } from './tipos'

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function extrairFrontmatter(texto: string): {
  frontmatter: FrontmatterVault
  corpo: string
} {
  const m = String(texto || '').match(FM_RE)
  if (!m) {
    return {
      frontmatter: { raw: '', aliases: [], tags: [], extras: {} },
      corpo: String(texto || '')
    }
  }
  const raw = m[1]
  return {
    frontmatter: parsearFrontmatterRaw(raw),
    corpo: String(texto || '').slice(m[0].length)
  }
}

function parseListaYamlSimples(val: string): string[] {
  const v = val.trim()
  if (!v) return []
  if (v.startsWith('[') && v.endsWith(']')) {
    return v
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean)
  }
  return [v.replace(/^["']|["']$/g, '')].filter(Boolean)
}

export function parsearFrontmatterRaw(raw: string): FrontmatterVault {
  const extras: Record<string, string> = {}
  let titulo: string | undefined
  const aliases: string[] = []
  const tags: string[] = []
  const lines = String(raw || '').split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (!kv) {
      i++
      continue
    }
    const key = kv[1].toLowerCase()
    let val = kv[2]
    if (val === '' || val === '|' || val === '>') {
      const bloco: string[] = []
      i++
      while (i < lines.length && /^\s+/.test(lines[i])) {
        const item = lines[i].match(/^\s+-\s+(.+)$/)
        if (item) bloco.push(item[1].trim().replace(/^["']|["']$/g, ''))
        else bloco.push(lines[i].trim())
        i++
      }
      if (key === 'tags') tags.push(...bloco.filter(Boolean))
      else if (key === 'aliases' || key === 'alias') aliases.push(...bloco.filter(Boolean))
      else if (key === 'title' || key === 'titulo') titulo = bloco.join(' ').trim() || undefined
      else extras[key] = bloco.join('\n')
      continue
    }
    if (key === 'title' || key === 'titulo') titulo = val.replace(/^["']|["']$/g, '').trim()
    else if (key === 'aliases' || key === 'alias') aliases.push(...parseListaYamlSimples(val))
    else if (key === 'tags' || key === 'tag') tags.push(...parseListaYamlSimples(val))
    else extras[key] = val.replace(/^["']|["']$/g, '')
    i++
  }
  return { raw: String(raw || ''), titulo, aliases, tags, extras }
}

/** Monta arquivo completo sem alterar o raw do FM se o corpo for o único mudado. */
export function montarDocumento(frontmatterRaw: string, corpo: string): string {
  const body = String(corpo || '')
  if (!frontmatterRaw) return body
  const sep = body.startsWith('\n') || body === '' ? '' : '\n'
  return `---\n${frontmatterRaw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')}---\n${sep}${body}`
}
