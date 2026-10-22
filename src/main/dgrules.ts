import { existsSync, readFileSync, writeFileSync } from 'fs'
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