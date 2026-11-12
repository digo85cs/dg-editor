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
 * Handler para obter perfil do sistema (sempre { ok, ...campos } para o renderer).
 */
export function handleSystemGetProfile(
  _event: Electron.IpcMainInvokeEvent
): IpcResult & { ok: boolean; erro?: string; cpus?: unknown; totalMemory?: number; hostname?: string } {
  try {
    const { getSystemProfile } = require('../profile');
    const p = getSystemProfile();
    return { ok: true, ...p };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para obter forca do perfil — string estável (não objeto cru).
 */
export function handleSystemProfileStrength(
  _event: Electron.IpcMainInvokeEvent
): IpcResult & { ok: boolean; erro?: string; forca?: string; label?: string } {
  try {
    const { getSystemProfile, profileStrength } = require('../profile');
    const forca = profileStrength(getSystemProfile()) as string;
    const label =
      forca === 'strong' ? 'forte' : forca === 'medium' ? 'média' : forca === 'light' ? 'leve' : String(forca);
    return { ok: true, forca, label };
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
