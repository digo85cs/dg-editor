/**
 * .dgrules vale sempre. Arquivos em .dg-editor/regras entram por glob ou por mencao.
 */
import { existsSync, readdirSync, readFileSync } from 'fs'
import { basename, join } from 'path'
import { readRules } from './dgrules'
import { contextoLinguagensFree } from './linguagens-contexto'

function casaGlob(glob: string, rel: string): boolean {
  const g = glob.trim().replace(/\\/g, '/')
  const r = rel.replace(/\\/g, '/')
  if (!g) return false
  if (g.startsWith('**/')) return casaGlob(g.slice(3), basename(r)) || casaGlob(g.slice(3), r)
  if (g.startsWith('*.')) return r.endsWith(g.slice(1))
  return r === g || r.endsWith('/' + g)
}

export function regrasParaContexto(
  raiz: string,
  arquivos: string[],
  texto: string,
  maxChars: number
): string {
  const sempre = readRules(raiz).slice(0, Math.min(maxChars, 1800))
  let out = ''
  if (sempre.trim()) out += '\nREGRAS DO PROJETO (.dgrules - respeite):\n' + sempre + '\n'
  const budgetLang = Math.min(900, Math.max(200, Math.floor(maxChars * 0.25)))
  out += contextoLinguagensFree(arquivos, texto, budgetLang)
  const dir = join(raiz, '.dg-editor', 'regras')
  if (!existsSync(dir)) return out.slice(0, maxChars)
  let nomes: string[] = []
  try { nomes = readdirSync(dir).filter((n) => n.endsWith('.md')) } catch { return out.slice(0, maxChars) }
  const rels = arquivos.map((a) => a.replace(/\\/g, '/'))
  const pedido = (texto || '').toLowerCase()
  for (const nome of nomes) {
    if (out.length >= maxChars) break
    let bruto = ''
    try { bruto = readFileSync(join(dir, nome), 'utf8') } catch { continue }
    let globs: string[] = []
    let mencao = ''
    let corpo = bruto
    const fm = bruto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
    if (fm) {
      corpo = fm[2]
      const g = fm[1].match(/globs:\s*(.+)/i)
      if (g) globs = g[1].split(',').map((s) => s.trim()).filter(Boolean)
      const men = fm[1].match(/mencao:\s*(.+)/i)
      if (men) mencao = men[1].trim().toLowerCase()
    }
    if (mencao && !pedido.includes(mencao)) continue
    if (globs.length && !rels.some((rel) => globs.some((g) => casaGlob(g, rel)))) continue
    out += '\nREGRA ' + nome.replace(/\.md$/, '') + ':\n' + corpo.trim().slice(0, 800) + '\n'
  }
  return out.slice(0, maxChars)
}
