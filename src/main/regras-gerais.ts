import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export type Regra = {
  id: string
  titulo: string
  descricao: string
  ativo: boolean
  criadoEm: string
}

function regrasPath() {
  const dir = join(app.getPath('userData'), 'config')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'regras-gerais.json')
}

export function listarRegrasGerais(): Regra[] {
  try {
    const p = regrasPath()
    if (!existsSync(p)) {
      const def: Regra[] = [
        { id: 'direto', titulo: 'Resposta direta', descricao: 'Sempre responder direto ao ponto, sem enrolação.', ativo: true, criadoEm: new Date().toISOString() },
        { id: 'acao', titulo: 'Ação direta', descricao: 'Executar o que foi pedido sem pedir confirmação desnecessária.', ativo: true, criadoEm: new Date().toISOString() },
        { id: 'pratico', titulo: 'Foco prático', descricao: 'Priorizar solução funcional e objetiva.', ativo: true, criadoEm: new Date().toISOString() }
      ]
      writeFileSync(p, JSON.stringify(def, null, 2), 'utf8')
      return def
    }
    return JSON.parse(readFileSync(p, 'utf8')) as Regra[]
  } catch {
    return []
  }
}

export function salvarRegrasGerais(regras: Regra[]): { ok: boolean } {
  try {
    writeFileSync(regrasPath(), JSON.stringify(regras, null, 2), 'utf8')
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export function obterRegrasAtivas(): string {
  const regras = listarRegrasGerais().filter(r => r.ativo)
  if (!regras.length) return ''
  return regras.map(r => '- ' + r.titulo + ': ' + r.descricao).join('\n')
}
