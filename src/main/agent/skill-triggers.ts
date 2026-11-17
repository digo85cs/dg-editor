/**
 * Skill triggers — skills em .dg-editor/skills, .agents/skills, .kilo/skills
 * com frontmatter `triggers:` são injetadas no contexto quando a tarefa
 * contém palavras-chave do trigger (estilo Devin skills).
 */
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

interface SkillTrigger {
  nome: string
  gatilhos: string[]
  conteudo: string
}

const DIRS = ['.dg-editor/skills', '.agents/skills', '.kilo/skills']

function parseFrontmatter(txt: string): { meta: Record<string, string>; body: string } {
  const m = txt.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!m) return { meta: {}, body: txt }
  const meta: Record<string, string> = {}
  for (const linha of m[1].split('\n')) {
    const kv = linha.match(/^([\w-]+):\s*(.+)$/)
    if (kv) meta[kv[1].toLowerCase()] = kv[2].trim()
  }
  return { meta, body: m[2] }
}

export function listarSkillsComTriggers(raiz: string): SkillTrigger[] {
  const out: SkillTrigger[] = []
  for (const rel of DIRS) {
    const dir = join(raiz, rel)
    if (!existsSync(dir)) continue
    let arquivos: string[] = []
    try {
      arquivos = readdirSync(dir).filter((f) => f.endsWith('.md'))
    } catch {
      continue
    }
    for (const arq of arquivos.slice(0, 60)) {
      try {
        const txt = readFileSync(join(dir, arq), 'utf8')
        const { meta, body } = parseFrontmatter(txt)
        const bruto = meta.triggers || meta.trigger || ''
        const gatilhos = bruto
          .split(/[,;|]/)
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s.length >= 3)
        const nome = meta.name || arq.replace(/\.md$/, '')
        out.push({ nome, gatilhos, conteudo: body.trim().slice(0, 4000) })
      } catch {
        /* ignora skill inválida */
      }
    }
  }
  return out
}

/** Retorna skills cujo trigger casa com a tarefa (match por substring). */
export function skillsParaTarefa(raiz: string, tarefa: string, limite = 3): SkillTrigger[] {
  if (!tarefa || tarefa.trim().length < 4) return []
  const t = tarefa.toLowerCase()
  const skills = listarSkillsComTriggers(raiz)
  const casaram = skills.filter((s) => s.gatilhos.some((g) => t.includes(g)))
  // desempate: mais triggers casados primeiro
  casaram.sort(
    (a, b) =>
      b.gatilhos.filter((g) => t.includes(g)).length - a.gatilhos.filter((g) => t.includes(g)).length
  )
  return casaram.slice(0, limite)
}

export function blocoSkillsContexto(raiz: string, tarefa: string): string {
  const casadas = skillsParaTarefa(raiz, tarefa)
  if (!casadas.length) return ''
  const partes = casadas.map((s) => '#### Skill: ' + s.nome + '\n' + s.conteudo)
  return '### Skills ativadas por trigger\n' + partes.join('\n\n')
}
