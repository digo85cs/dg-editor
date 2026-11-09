/**
 * Handlers IPC para guardian
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import { guardianSnapshot, guardianResumo } from '../guardian';

// ============================================================================
// HANDLERS DE GUARDIAN
// ============================================================================

export function handleGuardianSnapshot(_event: Electron.IpcMainInvokeEvent) {
  return guardianSnapshot();
}

export function handleGuardianResumo(_event: Electron.IpcMainInvokeEvent) {
  return guardianResumo();
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
