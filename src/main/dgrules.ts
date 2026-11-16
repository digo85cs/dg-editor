import { existsSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'

const RULES_FILE = '.dgrules'

export const RULES_TEMPLATE = `# Regras do sistema (DG Editor)
# Instrucoes permanentes deste projeto. A analise e o chat SEMPRE respeitam estas regras.
# Escreva uma regra por linha. Exemplos:
# - Nunca alterar arquivos da pasta producao/
# - Padrao de nomes: camelCase em JS, snake_case em PHP
# - Idioma dos commits: portugues
`

export function rulesPath(root: string): string {
  return join(root, RULES_FILE)
}

export function rulesExist(root: string): boolean {
  return existsSync(rulesPath(root))
}

export function readRules(root: string): string {
  const p = rulesPath(root)
  if (!existsSync(p)) return ''
  try {
    return readFileSync(p, 'utf-8')
  } catch {
    return ''
  }
}

export function createRulesTemplate(root: string): boolean {
  const p = rulesPath(root)
  if (existsSync(p)) return false
  writeFileSync(p, RULES_TEMPLATE, 'utf-8')
  return true
}

/** Grava .dgrules na raiz aberta. A UI de regras usa isto. */
export function writeRules(root: string, texto: string): { ok: boolean; erro?: string } {
  if (typeof texto !== 'string') return { ok: false, erro: 'texto invalido' }
  if (texto.length > 200_000) return { ok: false, erro: 'regras grandes demais' }
  try {
    writeFileSync(rulesPath(root), texto, 'utf-8')
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Arquivos de regras de outros ferramentas/agents que o ecossistema usa
 * (padrão AGENTS.md, CLAUDE.md, .cursorrules, .clinerules, copilot).
 * Lidos como contexto complementar — nunca sobrescrevem .dgrules.
 */
const RULES_COMPATIVEIS = [
  'AGENTS.md',
  'CLAUDE.md',
  '.cursorrules',
  '.clinerules',
  '.windsurfrules',
  '.github/copilot-instructions.md'
]

const MAX_POR_ARQUIVO = 6000
const MAX_TOTAL_COMPATIVEIS = 16000

/**
 * Regras complementares de outros agentes/ferramentas presentes na raiz.
 * Retorna texto rotulado por arquivo, ou '' se nenhum existir.
 */
export function readComplementaryRules(root: string): string {
  const partes: string[] = []
  let total = 0
  for (const rel of RULES_COMPATIVEIS) {
    if (total >= MAX_TOTAL_COMPATIVEIS) break
    const p = join(root, rel)
    if (!existsSync(p)) continue
    try {
      const st = statSync(p)
      if (!st.isFile() || st.size > 100_000) continue
      const body = readFileSync(p, 'utf-8').trim()
      if (!body) continue
      const fatia = body.slice(0, MAX_POR_ARQUIVO)
      partes.push('### ' + rel + '\n' + fatia)
      total += fatia.length
    } catch {
      /* */
    }
  }
  return partes.join('\n\n')
}