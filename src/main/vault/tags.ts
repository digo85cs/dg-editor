/** Remove fenced code blocks para não capturar # dentro de código. */
function semCodeFences(texto: string): string {
  return String(texto || '').replace(/```[\s\S]*?```/g, '\n')
}

/** Tags inline estilo Obsidian (#tag), fora de code fences. */
export function extrairTagsInline(texto: string): string[] {
  const src = semCodeFences(texto)
  const out: string[] = []
  const re = /(^|[\s(])#([A-Za-z0-9][\w\-/]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    out.push(m[2])
  }
  return [...new Set(out)]
}

export function unirTags(...listas: string[][]): string[] {
  const s = new Set<string>()
  for (const lista of listas) {
    for (const t of lista) {
      const n = String(t || '').trim().replace(/^#/, '')
      if (n) s.add(n)
    }
  }
  return [...s].sort((a, b) => a.localeCompare(b))
}
