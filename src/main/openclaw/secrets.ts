import { app, safeStorage } from 'electron'
import { randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'

function tokenPath(): string {
  return join(app.getPath('userData'), 'openclaw-token.bin')
}

export function tokenConfigurado(): boolean {
  return existsSync(tokenPath())
}

export function salvarToken(token: string): { ok: boolean; erro?: string } {
  if (!token || typeof token !== 'string' || !token.trim()) {
    return { ok: false, erro: 'token vazio' }
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return {
      ok: false,
      erro: 'safeStorage indisponivel — nao e seguro gravar token em texto plano'
    }
  }
  try {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const buf = safeStorage.encryptString(token.trim())
    writeFileSync(tokenPath(), buf)
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: String((e as Error).message || e) }
  }
}

export function limparToken(): { ok: boolean } {
  try {
    if (existsSync(tokenPath())) unlinkSync(tokenPath())
  } catch {
    /* ignore */
  }
  return { ok: true }
}

export function lerToken(): string | null {
  try {
    if (!existsSync(tokenPath())) return null
    if (!safeStorage.isEncryptionAvailable()) return null
    const buf = readFileSync(tokenPath())
    return safeStorage.decryptString(buf)
  } catch {
    return null
  }
}

/** Gera e grava token se ainda não houver (gateway local). */
export function garantirToken(): { ok: boolean; criado: boolean; prefixo?: string; erro?: string } {
  const atual = lerToken()
  if (atual && atual.trim()) {
    return { ok: true, criado: false, prefixo: atual.slice(0, 8) }
  }
  const token = 'oc_' + randomBytes(24).toString('hex')
  const r = salvarToken(token)
  if (!r.ok) return { ok: false, criado: false, erro: r.erro }
  return { ok: true, criado: true, prefixo: token.slice(0, 8) }
}
