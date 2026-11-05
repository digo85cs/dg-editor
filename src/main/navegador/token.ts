/**
 * Token de sessão do servidor de controle do navegador.
 * Gerado a cada boot (randomBytes(32)), removido no before-quit.
 * Nunca hardcodar; logar só os 8 primeiros chars.
 */
import { randomBytes, timingSafeEqual } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { projectStateDir, resolverRaizProjeto } from '../paths'
import { dglog } from '../dglog'

/** Token em memória da sessão atual (fonte da verdade para validação). */
let tokenSessao = ''

export function caminhoNavToken(raiz?: string): string {
  const root = raiz || resolverRaizProjeto()
  return join(projectStateDir(root), 'nav-token')
}

/** Sempre gera NOVO token, sobrescreve o arquivo. Nunca reaproveita. */
export function garantirTokenSessao(raiz?: string): string {
  const p = caminhoNavToken(raiz)
  const dir = join(p, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const novo = randomBytes(32).toString('hex')
  writeFileSync(p, novo, { encoding: 'utf8', mode: 0o600 })
  tokenSessao = novo
  dglog('[navegador] token sessão ' + novo.slice(0, 8) + '…')
  return novo
}

/** Alias legado → sempre rotação (não reaproveita arquivo antigo). */
export function garantirNavToken(raiz?: string): string {
  return garantirTokenSessao(raiz)
}

/** Remove arquivo e zera memória (idempotente). */
export function removerTokenSessao(raiz?: string): void {
  tokenSessao = ''
  try {
    const p = caminhoNavToken(raiz)
    if (existsSync(p)) unlinkSync(p)
  } catch {
    /* best-effort */
  }
}

export function getTokenSessao(): string {
  return tokenSessao
}

/** Comparação timing-safe. False se tamanhos diferirem ou token vazio. */
export function validarToken(recebido: string): boolean {
  if (!tokenSessao || !recebido) return false
  try {
    const a = Buffer.from(tokenSessao, 'utf8')
    const b = Buffer.from(String(recebido), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function lerNavToken(raiz?: string): string | null {
  const p = caminhoNavToken(raiz)
  if (!existsSync(p)) return null
  try {
    const t = readFileSync(p, 'utf8').trim()
    return t.length >= 32 ? t : null
  } catch {
    return null
  }
}
