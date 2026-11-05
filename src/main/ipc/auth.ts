/**
 * Handlers IPC para autenticacao
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE AUTENTICACAO
// ============================================================================

/**
 * Handler para obter estado de autenticacao
 */
export function handleAuthGetState(
  _event: Electron.IpcMainInvokeEvent
): IpcResult & { ok: boolean; erro?: string } {
  try {
    const { getAuthStore } = require('../auth');
    return getAuthStore().getState();
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para garantir identidade do dispositivo
 */
export function handleAuthEnsureIdentity(
  _event: Electron.IpcMainInvokeEvent
): IpcResult & { ok: boolean; erro?: string } {
  try {
    const { getAuthStore } = require('../auth');
    return getAuthStore().ensureDeviceIdentity();
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para logout
 */
export function handleAuthLogout(
  _event: Electron.IpcMainInvokeEvent
): IpcResult & { ok: boolean; erro?: string } {
  try {
    const { getAuthStore } = require('../auth');
    getAuthStore().logout();
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de autenticacao
 */
export function registrarHandlersAuth(): void {
  dglog('[ipc:auth] registrando handlers...');

  ipcMain.handle('auth:get-state', handleAuthGetState);
  ipcMain.handle('auth:ensure-identity', handleAuthEnsureIdentity);
  ipcMain.handle('auth:logout', handleAuthLogout);

  dglog('[ipc:auth] handlers registrados!');
}
