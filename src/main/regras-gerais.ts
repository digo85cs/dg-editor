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

function regrasPadraoCursor(): Regra[] {
  const agora = new Date().toISOString()
  return [
    {
      id: 'cursor-resultado',
      titulo: 'Como o Cursor',
      descricao:
        'Pedido → ferramentas → resultado no mesmo turno. Nunca só prometer. Mostre o que as tools devolveram.',
      ativo: true,
      criadoEm: agora
    },
    {
      id: 'direto',
      titulo: 'Resposta direta',
      descricao: 'Sempre responder direto ao ponto, sem enrolação.',
      ativo: true,
      criadoEm: agora
    },
    {
      id: 'acao',
      titulo: 'Ação direta',
      descricao:
        'Executar o que foi pedido sem pedir confirmação para leitura, listagem, status ou diagnóstico.',
      ativo: true,
      criadoEm: agora
    },
    {
      id: 'pratico',
      titulo: 'Foco prático',
      descricao: 'Priorizar solução funcional e objetiva.',
      ativo: true,
      criadoEm: agora
    }
  ]
}

export function listarRegrasGerais(): Regra[] {
  try {
    const p = regrasPath()
    if (!existsSync(p)) {
      const def = regrasPadraoCursor()
      writeFileSync(p, JSON.stringify(def, null, 2), 'utf8')
      return def
    }
    const atuais = JSON.parse(readFileSync(p, 'utf8')) as Regra[]
    if (!Array.isArray(atuais)) return regrasPadraoCursor()
    if (!atuais.some((r) => r.id === 'cursor-resultado')) {
      const mesclado = [...regrasPadraoCursor().filter((d) => d.id === 'cursor-resultado'), ...atuais]
      writeFileSync(p, JSON.stringify(mesclado, null, 2), 'utf8')
      return mesclado
    }
    return atuais
  } catch {
    return regrasPadraoCursor()
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
