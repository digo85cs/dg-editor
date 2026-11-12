/**
 * Handlers IPC para guardian
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import { guardianSnapshot, guardianResumo, estaBloqueado, guardianPodeOperar } from '../guardian';

// ============================================================================
// HANDLERS DE GUARDIAN
// ============================================================================

export function handleGuardianSnapshot(_event: Electron.IpcMainInvokeEvent) {
  return guardianSnapshot();
}

export function handleGuardianResumo(_event: Electron.IpcMainInvokeEvent) {
  return guardianResumo();
}

/** Status leve usado pela UI (alertas de pausa). */
export function handleDgStatus() {
  const snap = guardianSnapshot() as { ramOk?: boolean; freeMemory?: number }
  const paused = estaBloqueado() || !guardianPodeOperar()
  return {
    ok: true,
    paused,
    pausedReason: paused
      ? (estaBloqueado() ? 'Guardião bloqueou operações pesadas' : 'RAM baixa — operações pesadas pausadas')
      : undefined,
    ramOk: snap?.ramOk !== false,
    freeMemory: snap?.freeMemory
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
  ipcMain.handle('dg:status', handleDgStatus);

  dglog('[ipc:guardian] handlers registrados!');
}
