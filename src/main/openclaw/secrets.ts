import { app, safeStorage } from 'electron'
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
