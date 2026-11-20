/**
 * .dgrules vale sempre. Arquivos em .dg-editor/regras entram por glob ou por mencao.
 */
import { existsSync, readdirSync, readFileSync } from 'fs'
import { basename, join } from 'path'
import { readRules, readComplementaryRules } from './dgrules'
import { dirEmpacotado } from './paths'
import { contextoLinguagensFree } from './linguagens-contexto'
import { mapaRepositorio } from './agent/repo-mapa'

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
  const compativeis = readComplementaryRules(raiz)
  if (compativeis) out += '\n' + compativeis.slice(0, Math.min(4000, maxChars)) + '\n'
  try {
    const pri = arquivos.slice(0, 6)
    const mapa = mapaRepositorio(raiz, pri)
    if (mapa) out += '\n' + mapa.trimEnd().slice(0, Math.min(5000, maxChars)) + '\n'
  } catch {
    /* mapa auxiliar — nunca quebra o chat */
  }
  const budgetLang = Math.min(900, Math.max(200, Math.floor(maxChars * 0.25)))
  out += contextoLinguagensFree(arquivos, texto, budgetLang)
  // Local + defaults empacotados (app instalado: raiz=userData sem .dg-editor).
  const dirs = [join(raiz, '.dg-editor', 'regras')]
  const emb = dirEmpacotado('regras')
  if (emb) dirs.push(emb)
  const nomes: string[] = []
  const dirsValidos = dirs.filter((d) => existsSync(d))
  if (!dirsValidos.length) return out.slice(0, maxChars)
  const vistos = new Set<string>()
  for (const d of dirsValidos) {
    try {
      for (const n of readdirSync(d).filter((x) => x.endsWith('.md'))) {
        if (!vistos.has(n)) { vistos.add(n); nomes.push(n) }
      }
    } catch { /* segue */ }
  }
  // Guardar o dir de cada nome para leitura (local vence: dirs[0] primeiro)
  const dirPorNome = new Map<string, string>()
  for (const d of dirsValidos) {
    for (const n of nomes) {
      if (!dirPorNome.has(n) && existsSync(join(d, n))) dirPorNome.set(n, d)
    }
  }
  const rels = arquivos.map((a) => a.replace(/\\/g, '/'))
  const pedido = (texto || '').toLowerCase()
  for (const nome of nomes) {
    if (out.length >= maxChars) break
    const dirArquivo = dirPorNome.get(nome)
    if (!dirArquivo) continue
    let bruto = ''
    try { bruto = readFileSync(join(dirArquivo, nome), 'utf8') } catch { continue }
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
