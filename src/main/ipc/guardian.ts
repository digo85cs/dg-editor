/**
 * Handlers IPC para guardian
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE GUARDIAN
// ============================================================================

/**
 * Handler para obter snapshot do guardian
 */
export function handleGuardianSnapshot(
  _event: Electron.IpcMainInvokeEvent
): IpcResult & { ok: boolean; erro?: string } {
  try {
    const { guardianSnapshot } = require('../guardian');
    return guardianSnapshot();
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para obter resumo do guardian
 */
export function handleGuardianResumo(
  _event: Electron.IpcMainInvokeEvent
): IpcResult & { ok: boolean; erro?: string } {
  try {
    const { guardianResumo } = require('../guardian');
    return guardianResumo();
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de guardian
 */
export function registrarHandlersGuardian(): void {
  dglog('[ipc:guardian] registrando handlers...');

  ipcMain.handle('guardian:snapshot', handleGuardianSnapshot);
  ipcMain.handle('guardian:resumo', handleGuardianResumo);

  dglog('[ipc:guardian] handlers registrados!');
}
