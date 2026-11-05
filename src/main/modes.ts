import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export type CustomMode = {
  id: string
  nome: string
  systemPrompt: string
  tools: string[]
  modelo?: string
  cor?: string
  icone?: string
}

function modesPath(): string {
  const dir = join(app.getPath('userData'), 'dg-modes')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'modes.json')
}

export function listarModos(): CustomMode[] {
  try {
    const p = modesPath()
    if (!existsSync(p)) {
      // criar modos padrão
      const defaults: CustomMode[] = [
        { id: 'dg', nome: 'DG', systemPrompt: 'Você é o agente DG Editor. Seja prático e objetivo.', tools: ['read', 'edit', 'bash'], cor: '#4f9deb' },
        { id: 'analise', nome: 'Análise', systemPrompt: 'Analise apenas. Não edite arquivos.', tools: ['read'], cor: '#f59e0b' },
        { id: 'revisao', nome: 'Revisão', systemPrompt: 'Revise código e sugira melhorias sem aplicar mudanças.', tools: ['read'], cor: '#10b981' },
      ]
      writeFileSync(p, JSON.stringify(defaults, null, 2), 'utf8')
      return defaults
    }
    return JSON.parse(readFileSync(p, 'utf8')) as CustomMode[]
  } catch {
    return []
  }
}

export function salvarModos(modos: CustomMode[]): { ok: boolean } {
  try {
    writeFileSync(modesPath(), JSON.stringify(modos, null, 2), 'utf8')
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
