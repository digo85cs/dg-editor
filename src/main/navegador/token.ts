/**
 * Token local do servidor de controle do navegador embutido.
 * Gravado em .dg-editor/nav-token (gitignore). Nunca hardcodar.
 */
import { randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { projectStateDir, resolverRaizProjeto } from '../paths'

export function caminhoNavToken(raiz?: string): string {
  const root = raiz || resolverRaizProjeto()
  return join(projectStateDir(root), 'nav-token')
}

export function garantirNavToken(raiz?: string): string {
  const p = caminhoNavToken(raiz)
  const dir = join(p, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  if (existsSync(p)) {
    const t = readFileSync(p, 'utf8').trim()
    if (t.length >= 32) return t
  }
  const novo = randomBytes(32).toString('hex')
  writeFileSync(p, novo, { encoding: 'utf8', mode: 0o600 })
  return novo
}

export function lerNavToken(raiz?: string): string | null {
  const p = caminhoNavToken(raiz)
  if (!existsSync(p)) return null
  const t = readFileSync(p, 'utf8').trim()
  return t.length >= 32 ? t : null
}
