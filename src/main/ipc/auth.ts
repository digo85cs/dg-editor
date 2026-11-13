/**
 * Handlers IPC para autenticacao (local + Google/Microsoft/GitHub/Apple/Adapta)
 */
import { ipcMain } from 'electron'
import { dglog } from '../dglog'
import type { IpcResult } from './types'
import { conectarAdapta, desconectarAdapta } from '../auth/adapta-oauth'
import { conectarGoogle, desconectarGoogle, getGoogleStatus } from '../auth/google-oauth'
import { conectarMicrosoft, desconectarMicrosoft, getMicrosoftStatus } from '../auth/microsoft-oauth'
import { conectarGithub, desconectarGithub, getGithubStatus } from '../auth/github-oauth'
import { conectarApple, desconectarApple, getAppleStatus } from '../auth/apple-oauth'
import { lerOAuthClients, salvarOAuthClients } from '../auth/oauth-clients'
import { getAuthStore } from '../auth'

export function handleAuthGetState(_event: Electron.IpcMainInvokeEvent) {
  try {
    return getAuthStore().getState()
  } catch (e: unknown) {
    return { ok: false, erro: String(e) }
  }
}

export function handleAuthEnsureIdentity(_event: Electron.IpcMainInvokeEvent) {
  try {
    return getAuthStore().ensureDeviceIdentity()
  } catch (e: unknown) {
    return { ok: false, erro: String(e) }
  }
}

export function handleAuthLogout(_event: Electron.IpcMainInvokeEvent): IpcResult {
  try {
    getAuthStore().logout()
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, erro: String(e) }
  }
}

export async function handleAdaptaConectar() {
  try { return await conectarAdapta() } catch (e: unknown) { return { ok: false, erro: String(e) } }
}
export function handleAdaptaDesconectar() {
  try { return desconectarAdapta() } catch (e: unknown) { return { ok: false, erro: String(e) } }
}

function adaptaStatus() {
  try {
    const { existsSync, readFileSync } = require('fs') as typeof import('fs')
    const { join } = require('path') as typeof import('path')
    const { app, safeStorage } = require('electron') as typeof import('electron')
    const base = join(app.getPath('userData'), 'auth', 'adapta.json')
    const penc = base + '.enc'
    let data: { email?: string; nome?: string } | null = null
    if (existsSync(penc) && safeStorage.isEncryptionAvailable()) {
      data = JSON.parse(safeStorage.decryptString(readFileSync(penc)))
    } else if (existsSync(base)) {
      data = JSON.parse(readFileSync(base, 'utf8'))
    }
    return data ? { conectado: true, email: data.email, nome: data.nome } : { conectado: false }
  } catch {
    return { conectado: false }
  }
}

export function registrarHandlersAuth(): void {
  dglog('[ipc:auth] registrando handlers...')

  ipcMain.handle('auth:get-state', handleAuthGetState)
  ipcMain.handle('auth:ensure-identity', handleAuthEnsureIdentity)
  ipcMain.handle('auth:logout', handleAuthLogout)
  ipcMain.handle('auth:adapta:conectar', handleAdaptaConectar)
  ipcMain.handle('auth:adapta:desconectar', handleAdaptaDesconectar)
  ipcMain.handle('auth:adapta:status', () => adaptaStatus())

  ipcMain.handle('auth:google:conectar', async () => conectarGoogle())
  ipcMain.handle('auth:google:desconectar', () => desconectarGoogle())
  ipcMain.handle('auth:google:status', () => getGoogleStatus())

  ipcMain.handle('auth:microsoft:conectar', async () => conectarMicrosoft())
  ipcMain.handle('auth:microsoft:desconectar', () => desconectarMicrosoft())
  ipcMain.handle('auth:microsoft:status', () => getMicrosoftStatus())

  ipcMain.handle('auth:github:conectar', async () => conectarGithub())
  ipcMain.handle('auth:github:desconectar', () => desconectarGithub())
  ipcMain.handle('auth:github:status', () => getGithubStatus())

  ipcMain.handle('auth:apple:conectar', async (_e, opts) => conectarApple(opts as { email?: string; nome?: string } | undefined))
  ipcMain.handle('auth:apple:desconectar', (_e, email) => desconectarApple(typeof email === 'string' ? email : undefined))
  ipcMain.handle('auth:apple:status', () => getAppleStatus())

  ipcMain.handle('auth:oauth-clients:get', () => ({ ok: true, ...lerOAuthClients() }))
  ipcMain.handle('auth:oauth-clients:set', (_e, parcial) => salvarOAuthClients((parcial || {}) as Record<string, string>))

  ipcMain.handle('auth:contas:listar', () => {
    const g = getGoogleStatus()
    const m = getMicrosoftStatus()
    const gh = getGithubStatus()
    const a = getAppleStatus()
    const ad = adaptaStatus()
    const contas: Array<{ provedor: string; conectado: boolean; email?: string; nome?: string; extras?: string[] }> = [
      { provedor: 'google', conectado: !!g.conectado, email: g.email, nome: g.nome },
      { provedor: 'microsoft', conectado: !!m.conectado, email: m.email, nome: m.nome },
      { provedor: 'github', conectado: !!gh.conectado, email: gh.email, nome: gh.nome || gh.usuario },
      { provedor: 'apple', conectado: !!a.conectado, email: a.email, nome: a.nome, extras: a.contas },
      { provedor: 'adapta', conectado: !!ad.conectado, email: ad.email, nome: ad.nome }
    ]
    return { ok: true, contas }
  })

  dglog('[ipc:auth] handlers registrados!')
}