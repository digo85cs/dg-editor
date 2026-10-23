// paths.ts - resolucao centralizada de paths do DG Editor
// Estado do app (log, dossie, continuidade) -> userData
// Estado por projeto (cache, chat) -> pasta do projeto

import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'

interface ElectronAppLike {
  getPath: (name: string) => string
}

/**
 * Tenta obter o app do Electron.
 * Dentro do Electron -> modulo real.
 * Em Node puro (servidor MCP via stdio) -> electron nao existe e cai no fallback.
 */
function getElectronApp(): ElectronAppLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron') as { app?: ElectronAppLike } | string
    if (typeof electron === 'object' && electron && electron.app && typeof electron.app.getPath === 'function') {
      return electron.app
    }
    return null
  } catch {
    return null
  }
}

function userDataFallback(): string {
  const ap = process.env.APPDATA
  if (ap) return join(ap, 'dg-editor')
  return join(homedir(), '.config', 'dg-editor')
}

function garantir(dir: string): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Diretorio raiz de estado do app. %APPDATA%/dg-editor no Windows. */
export function appDataDir(): string {
  const app = getElectronApp()
  const dir = app ? app.getPath('userData') : userDataFallback()
  return garantir(dir)
}

/** Diretorio de logs do app (independe do cwd). */
export function logDir(): string {
  return garantir(join(appDataDir(), 'logs'))
}

/** Diretorio de dossie/continuidade do app. */
export function dossieDir(): string {
  return garantir(join(appDataDir(), 'dossie'))
}

/** Diretorio de estado DENTRO do projeto analisado (.dg-editor). */
export function projectStateDir(root: string): string {
  return garantir(join(root, '.dg-editor'))
}

/** Aviso se o cwd e diferente da pasta do projeto (diagnostico). */
export function cwdDiagnostico(): { cwd: string; userData: string; divergente: boolean } {
  const cwd = process.cwd()
  const userData = appDataDir()
  return { cwd, userData, divergente: !cwd.startsWith(userData) }
}
