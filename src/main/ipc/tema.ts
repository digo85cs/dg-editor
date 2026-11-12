/**
 * Handlers IPC para tema
 */

import { ipcMain } from 'electron'
import { dglog } from '../dglog'
import { lerTema, salvarTema } from '../tema'
import type { IpcResult } from './types'

export function handleTemaGet(
  _event: Electron.IpcMainInvokeEvent
): IpcResult & { ok: boolean; erro?: string; tema?: string } {
  try {
    return { ok: true, tema: lerTema() }
  } catch (e: unknown) {
    return { ok: false, erro: String(e) }
  }
}

export function handleTemaSet(
  _event: Electron.IpcMainInvokeEvent,
  tema: 'escuro' | 'claro'
): IpcResult & { ok: boolean; erro?: string; tema?: string } {
  try {
    salvarTema(tema === 'claro' ? 'claro' : 'escuro')
    return { ok: true, tema: lerTema() }
  } catch (e: unknown) {
    return { ok: false, erro: String(e) }
  }
}

export function registrarHandlersTema(): void {
  dglog('[ipc:tema] registrando handlers...')
  ipcMain.handle('tema:get', handleTemaGet)
  ipcMain.handle('tema:set', handleTemaSet)
  dglog('[ipc:tema] handlers registrados!')
}
