import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, basename } from 'path'

export type SkillEntry = {
  id: string
  nome: string
  descricao: string
  origem: '.kilo' | '.agents' | 'custom'
  arquivo: string
  conteudo: string
  ativo?: boolean
}

function dirs() {
  const raiz = process.cwd()
  return [
    { tipo: '.kilo' as const, dir: join(raiz, '.kilo', 'skills') },
    { tipo: '.agents' as const, dir: join(raiz, '.agents', 'skills') }
  ]
}

function getHubPath() {
  const dir = join(app.getPath('userData'), 'dg-skills')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'hub.json')
}

export function listarSkillsHub(): SkillEntry[] {
  const out: SkillEntry[] = []
  for (const d of dirs()) {
    if (!existsSync(d.dir)) continue
    try {
      const ents = readdirSync(d.dir, { withFileTypes: true })
      for (const e of ents) {
        if (e.isFile() && (e.name.endsWith('.md') || e.name === 'SKILL.md')) {
          const full = join(d.dir, e.name)
          try {
            const txt = readFileSync(full, 'utf8')
            // tentar extrair nome/descricao simples
            const mNome = txt.match(/name:\s*(.+)/i) || txt.match(/^#\s+(.+)/m)
            const mDesc = txt.match(/description:\s*(.+)/i) || txt.match(/(?:^|\n)\*{0,2}(.{10,80})\*{0,2}(?:\n|$)/)
            out.push({
              id: basename(d.dir) + ':' + e.name.replace(/\.md$/i,''),
              nome: mNome ? mNome[1].trim() : e.name.replace(/\.md$/i,''),
              descricao: mDesc ? mDesc[1].trim() : '',
              origem: d.tipo,
              arquivo: full,
              conteudo: txt,
              ativo: true
            })
          } catch {}
        } else if (e.isDirectory()) {
          const full = join(d.dir, e.name, 'SKILL.md')
          if (existsSync(full)) {
            try {
              const txt = readFileSync(full, 'utf8')
              const mNome = txt.match(/name:\s*(.+)/i) || txt.match(/^#\s+(.+)/m)
              const mDesc = txt.match(/description:\s*(.+)/i)
              out.push({
                id: basename(d.dir) + ':' + e.name,
                nome: mNome ? mNome[1].trim() : e.name,
                descricao: mDesc ? mDesc[1].trim() : '',
                origem: d.tipo,
                arquivo: full,
                conteudo: txt,
                ativo: true
              })
            } catch {}
          }
        }
      }
    } catch {}
  }
  try {
    const hp = getHubPath()
    if (existsSync(hp)) {
      const saved = JSON.parse(readFileSync(hp,'utf8')) as SkillEntry[]
      const map = new Map(out.map(x=>[x.id,x]))
      for (const s of saved) {
        if (map.has(s.id)) map.set(s.id, {...map.get(s.id)!, ...s})
        else map.set(s.id, s)
      }
      return Array.from(map.values())
    }
  } catch {}
  return out
}

export function salvarSkillsHub(skills: SkillEntry[]): { ok: boolean } {
  try {
    writeFileSync(getHubPath(), JSON.stringify(skills,null,2), 'utf8')
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export function importarSkillMd(conteudo: string, nome?: string): { ok: boolean; skill?: SkillEntry } {
  try {
    const dir = join(process.cwd(), '.kilo', 'skills')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const fname = (nome && nome.replace(/[^a-z0-9\-_]+/gi,'-').toLowerCase()) || 'skill-importado'
    const full = join(dir, fname + '.md')
    writeFileSync(full, conteudo, 'utf8')
    return { ok: true, skill: { id: '.kilo:' + fname, nome: fname, descricao: '', origem: '.kilo', arquivo: full, conteudo, ativo: true } }
  } catch (e:any) {
    return { ok: false }
  }
}
