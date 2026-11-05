/**
 * Mapa curto do projeto: arquivo e nomes, sem colar o corpo dos arquivos.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const PULAR = new Set(['node_modules', '.git', 'out', 'dist', 'dist-app', '.dg-editor', 'release'])

export function mapaCompacto(raiz: string, maxChars = 2200): string {
  const arquivos: string[] = []
  const walk = (dir: string, depth: number) => {
    if (depth > 3 || arquivos.length >= 40) return
    let nomes: string[] = []
    try { nomes = readdirSync(dir) } catch { return }
    for (const nome of nomes) {
      if (arquivos.length >= 40) return
      if (PULAR.has(nome)) continue
      const abs = join(dir, nome)
      let st
      try { st = statSync(abs) } catch { continue }
      if (st.isDirectory()) walk(abs, depth + 1)
      else if (/\.(ts|js|php|css|html|py)$/i.test(nome) && st.size < 400_000) arquivos.push(abs)
    }
  }
  walk(raiz, 0)
  const linhas: string[] = []
  const re = /\b(?:function|class)\s+([A-Za-z_][A-Za-z0-9_]*)|export\s+(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)|export\s+class\s+([A-Za-z_][A-Za-z0-9_]*)/g
  for (const abs of arquivos) {
    let txt = ''
    try { txt = readFileSync(abs, 'utf8').slice(0, 6000) } catch { continue }
    if (txt.includes('\0')) continue
    const nomes = new Set<string>()
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(txt)) && nomes.size < 8) {
      const n = m[1] || m[2] || m[3]
      if (n) nomes.add(n)
    }
    const rel = relative(raiz, abs).replace(/\\/g, '/')
    linhas.push(nomes.size ? rel + ': ' + [...nomes].join(', ') : rel)
    if (linhas.join('\n').length >= maxChars) break
  }
  return linhas.join('\n').slice(0, maxChars)
}
