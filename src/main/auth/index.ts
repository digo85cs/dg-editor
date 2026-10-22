import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { randomBytes } from 'crypto'
import { AuthState, AuthSession, AuthUser } from '@shared/types'

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function userDataPath(): string {
  return app.getPath('userData')
}

function identityPath(): string {
  return join(userDataPath(), 'identity.json')
}

function ensureDir(): void {
  if (!existsSync(userDataPath())) {
    mkdirSync(userDataPath(), { recursive: true })
  }
}

function readJson<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(path: string, data: unknown): void {
  ensureDir()
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
}

function randomToken(): string {
  return randomBytes(32).toString('hex')
}

export interface AuthStore {
  getState(): AuthState
  ensureDeviceIdentity(): AuthSession
  logout(): void
  validateSession(token: string): AuthState
  __resetForTests(): void
}

class AuthStoreImpl implements AuthStore {
  private identity: { token: string; createdAt: number } | null = null

  constructor() {
    this.identity = readJson(identityPath(), null)
  }

  private persistIdentity(): void {
    if (this.identity) {
      writeJson(identityPath(), this.identity)
    }
  }

  private buildSession(): AuthSession {
    const token = this.identity?.token ?? randomToken()
    const createdAt = this.identity?.createdAt ?? Date.now()
    const user: AuthUser = {
      username: 'owner',
      createdAt
    }
    return {
      authenticated: true,
      user,
      token,
      expiresAt: createdAt + SESSION_MAX_AGE_MS
    }
  }

  getState(): AuthState {
    if (!this.identity) return { authenticated: false }
    if (Date.now() - this.identity.createdAt > SESSION_MAX_AGE_MS) {
      this.identity = null
      this.persistIdentity()
      return { authenticated: false }
    }
    const session = this.buildSession()
    return { authenticated: true, user: session.user, session }
  }

  ensureDeviceIdentity(): AuthSession {
    if (!this.identity) {
      this.identity = { token: randomToken(), createdAt: Date.now() }
      this.persistIdentity()
    }
    return this.buildSession()
  }

  logout(): void {
    this.identity = null
    this.persistIdentity()
  }

  validateSession(token: string): AuthState {
    if (!token || !this.identity) return { authenticated: false }
    if (this.identity.token !== token) return { authenticated: false }
    if (Date.now() - this.identity.createdAt > SESSION_MAX_AGE_MS) {
      this.identity = null
      this.persistIdentity()
      return { authenticated: false }
    }
    const session = this.buildSession()
    return { authenticated: true, user: session.user, session }
  }

  __resetForTests(): void {
    this.identity = null
  }
}

let singleton: AuthStoreImpl | null = null

export function getAuthStore(): AuthStore {
  if (!singleton) singleton = new AuthStoreImpl()
  return singleton
}

export function __resetAuthStoreForTests(): void {
  singleton = null
}