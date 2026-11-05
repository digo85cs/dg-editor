/**
 * Handlers IPC para operacoes de sistema
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE SISTEMA
// ============================================================================

/**
 * Handler para obter perfil do sistema
 */
export function handleSystemGetProfile(
  _event: Electron.IpcMainInvokeEvent
): IpcResult & { ok: boolean; erro?: string } {
  try {
    const { getSystemProfile } = require('../profile');
    return getSystemProfile();
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para obter forca do perfil
 */
export function handleSystemProfileStrength(
  _event: Electron.IpcMainInvokeEvent
): IpcResult & { ok: boolean; erro?: string } {
  try {
    const { getSystemProfile, profileStrength } = require('../profile');
    return profileStrength(getSystemProfile());
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de sistema
 */
export function registrarHandlersSystem(): void {
  dglog('[ipc:system] registrando handlers...');

  ipcMain.handle('system:get-profile', handleSystemGetProfile);
  ipcMain.handle('system:profile-strength', handleSystemProfileStrength);

  dglog('[ipc:system] handlers registrados!');
}
