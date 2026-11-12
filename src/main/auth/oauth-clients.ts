import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export type OAuthClientConfig = {
  googleClientId?: string
  microsoftClientId?: string
  githubClientId?: string
  githubClientSecret?: string
  appleClientId?: string
}

function pathCfg() {
  const dir = join(app.getPath('userData'), 'auth')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'oauth-clients.json')
}

export function lerOAuthClients(): OAuthClientConfig {
  const env: OAuthClientConfig = {
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    microsoftClientId: process.env.MICROSOFT_CLIENT_ID || '',
    githubClientId: process.env.GITHUB_CLIENT_ID || '',
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    appleClientId: process.env.APPLE_CLIENT_ID || ''
  }
  try {
    if (!existsSync(pathCfg())) return env
    const j = JSON.parse(readFileSync(pathCfg(), 'utf8')) as OAuthClientConfig
    return {
      googleClientId: j.googleClientId || env.googleClientId,
      microsoftClientId: j.microsoftClientId || env.microsoftClientId,
      githubClientId: j.githubClientId || env.githubClientId,
      githubClientSecret: j.githubClientSecret || env.githubClientSecret,
      appleClientId: j.appleClientId || env.appleClientId
    }
  } catch {
    return env
  }
}

export function salvarOAuthClients(parcial: OAuthClientConfig): { ok: boolean; erro?: string } {
  try {
    const atual = lerOAuthClients()
    const next = { ...atual, ...parcial }
    writeFileSync(pathCfg(), JSON.stringify(next, null, 2), 'utf8')
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

export function googleClientId(): string {
  return String(lerOAuthClients().googleClientId || '').trim()
}
export function microsoftClientId(): string {
  return String(lerOAuthClients().microsoftClientId || '').trim()
}
export function githubClientId(): string {
  return String(lerOAuthClients().githubClientId || '').trim()
}
export function githubClientSecret(): string {
  return String(lerOAuthClients().githubClientSecret || '').trim()
}