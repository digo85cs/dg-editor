/**
 * IPC do construtor Apps (APK Android + instalador Windows).
 */
import { ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import {
  construirApps,
  instalarToolchainApps,
  pastaOneDriveApp,
  publicarApps,
  statusApps
} from '../apps'

let ocupado: string | null = null

export function registrarHandlersApps(): void {
  ipcMain.handle('apps:status', () => {
    try {
      return { ...statusApps(), ocupado }
    } catch (e) {
      return { ok: false, erro: String(e) }
    }
  })

  ipcMain.handle('apps:instalar', async () => {
    if (ocupado) return { ok: false, erro: 'já existe build em andamento: ' + ocupado }
    ocupado = 'toolchain'
    try {
      const r = await instalarToolchainApps()
      return { ok: r.ok, log: r.log, status: statusApps() }
    } catch (e) {
      return { ok: false, erro: String(e) }
    } finally {
      ocupado = null
    }
  })

  ipcMain.handle('apps:build', async (_e, payload?: unknown) => {
    const o = (payload || {}) as { tipo?: string }
    const tipo = o.tipo === 'apk' || o.tipo === 'win' ? o.tipo : 'tudo'
    if (ocupado) return { ok: false, erro: 'já existe build em andamento: ' + ocupado }
    ocupado = tipo
    try {
      const r = await construirApps(tipo)
      return { ok: r.ok, tipo, log: r.log, status: statusApps() }
    } catch (e) {
      return { ok: false, erro: String(e) }
    } finally {
      ocupado = null
    }
  })

  ipcMain.handle('apps:publicar', async () => {
    if (ocupado) return { ok: false, erro: 'já existe build em andamento: ' + ocupado }
    ocupado = 'publicar'
    try {
      const r = await publicarApps()
      return { ok: r.ok, log: r.log, status: statusApps() }
    } catch (e) {
      return { ok: false, erro: String(e) }
    } finally {
      ocupado = null
    }
  })

  ipcMain.handle('apps:abrir-pasta', async (_e, payload?: unknown) => {
    try {
      const o = (payload || {}) as { qual?: string }
      const destino = o.qual === 'dist' ? statusApps().pastas.dist : pastaOneDriveApp()
      if (!existsSync(destino)) return { ok: false, erro: 'pasta ainda não existe: ' + destino }
      const erro = await shell.openPath(destino)
      return erro ? { ok: false, erro } : { ok: true, caminho: destino }
    } catch (e) {
      return { ok: false, erro: String(e) }
    }
  })
}
