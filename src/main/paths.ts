// paths.ts - resolucao centralizada de paths do DG Editor
// Estado do app (log, dossie, continuidade) -> userData
// Estado por projeto (cache, chat) -> pasta do projeto

import { join, resolve, relative, dirname, isAbsolute, normalize } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { RAIZ_WINDOWS_CANONICA } from '../shared/raiz-canonica'

export { RAIZ_WINDOWS_CANONICA } from '../shared/raiz-canonica'

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

export type FonteRaiz =
  | 'env:DG_ROOT'
  | 'fix:windows-canonica'
  | 'arquivo:.dg-root'
  | 'subida:package+dg-editor'
  | 'cwd'
  | 'falha'

let _raizCache: { raiz: string; fonte: FonteRaiz } | null = null
let _raizLogada = false

function ehRaizProjeto(dir: string): boolean {
  return existsSync(join(dir, 'package.json')) && existsSync(join(dir, '.dg-editor'))
}

/**
 * Cascata deterministica de raiz do projeto.
 * 0) Windows: D:\CURSOR\DG Editor SEMPRE que existir (pasta oficial permanente)
 * 1) process.env.DG_ROOT (se existir em disco)
 * 2) arquivo .dg-root na cwd (conteudo = caminho)
 * 3) subir a partir de __dirname ate achar package.json + .dg-editor/
 * 4) process.cwd() se for raiz valida
 * 5) erro explicito
 */
function fixarEnvEDgRoot(abs: string): void {
  try {
    process.env.DG_ROOT = abs
  } catch { /* ignore */ }
  try {
    writeFileSync(join(abs, '.dg-root'), abs + '\n', 'utf8')
  } catch { /* ignore */ }
}

export function resolverRaizProjeto(forcar = false): string {
  if (_raizCache && !forcar) return _raizCache.raiz

  // 0. Windows — pasta oficial permanente (ganha de tudo)
  if (process.platform === 'win32' && existsSync(join(RAIZ_WINDOWS_CANONICA, 'package.json'))) {
    const abs = resolve(RAIZ_WINDOWS_CANONICA)
    _raizCache = { raiz: abs, fonte: 'fix:windows-canonica' }
    fixarEnvEDgRoot(abs)
    logRaizUmaVez()
    return abs
  }

  // 1. env
  const env = (process.env.DG_ROOT || '').trim()
  if (env && existsSync(env)) {
    const abs = resolve(env)
    _raizCache = { raiz: abs, fonte: 'env:DG_ROOT' }
    logRaizUmaVez()
    return abs
  }

  // 1b. canonica tambem fora de win32 se a pasta existir (ex.: wine)
  if (existsSync(join(RAIZ_WINDOWS_CANONICA, 'package.json'))) {
    const abs = resolve(RAIZ_WINDOWS_CANONICA)
    _raizCache = { raiz: abs, fonte: 'fix:windows-canonica' }
    fixarEnvEDgRoot(abs)
    logRaizUmaVez()
    return abs
  }

  // 2. .dg-root (procura em cwd e sobe ate 4 niveis)
  let probe = process.cwd()
  for (let i = 0; i < 6; i++) {
    const marker = join(probe, '.dg-root')
    if (existsSync(marker)) {
      try {
        const conteudo = readFileSync(marker, 'utf8').trim().split(/\r?\n/)[0].trim()
        if (conteudo && existsSync(conteudo)) {
          const abs = resolve(conteudo)
          _raizCache = { raiz: abs, fonte: 'arquivo:.dg-root' }
          logRaizUmaVez()
          return abs
        }
      } catch { /* ignora */ }
    }
    const pai = dirname(probe)
    if (pai === probe) break
    probe = pai
  }

  // 3. subir a partir de __dirname
  let dir = resolve(__dirname)
  for (let i = 0; i < 10; i++) {
    if (ehRaizProjeto(dir)) {
      _raizCache = { raiz: dir, fonte: 'subida:package+dg-editor' }
      logRaizUmaVez()
      return dir
    }
    // tambem tenta pai imediato se __dirname for .../out/main ou .../bin/main
    const pai = dirname(dir)
    if (pai === dir) break
    dir = pai
  }

  // 4. cwd se valido
  const cwd = resolve(process.cwd())
  if (ehRaizProjeto(cwd)) {
    _raizCache = { raiz: cwd, fonte: 'cwd' }
    logRaizUmaVez()
    return cwd
  }

  // 5. falha
  _raizCache = { raiz: '', fonte: 'falha' }
  logRaizUmaVez()
  throw new Error('DG_ROOT nao resolvido: defina DG_ROOT, crie .dg-root, ou rode dentro do projeto com package.json+.dg-editor/')
}

export function fonteRaizResolvida(): FonteRaiz {
  if (!_raizCache) resolverRaizProjeto()
  return _raizCache!.fonte
}

function logRaizUmaVez(): void {
  if (_raizLogada || !_raizCache) return
  _raizLogada = true
  const msg = '[dg-paths] raiz=' + (_raizCache.raiz || '(vazia)') + ' fonte=' + _raizCache.fonte
  try {
    process.stderr.write(msg + '\n')
  } catch {
    console.error(msg)
  }
}

/**
 * Resolve caminho relativo/absoluto dentro da raiz.
 * Rejeita path traversal com erro claro.
 */
export function caminhoDentroDaRaiz(raiz: string, alvo: string): { abs: string; rel: string } {
  const abs = isAbsolute(alvo) ? normalize(resolve(alvo)) : normalize(resolve(raiz, alvo))
  const rel = relative(raiz, abs).replace(/\\/g, '/')
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('caminho fora da raiz do projeto: ' + alvo)
  }
  return { abs, rel }
}

/** True se o texto parece caminho de arquivo (tem / ou \\ ou extensao .ts/.js/.md). */
export function pareceCaminhoArquivo(s: string): boolean {
  const t = (s || '').trim()
  if (!t) return false
  if (/[\\/]/.test(t)) return true
  if (/\.(tsx?|jsx?|mjs|cjs|json|md)$/i.test(t)) return true
  return false
}
