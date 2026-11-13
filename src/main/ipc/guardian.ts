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

/** Status leve usado pela UI (alertas de pausa). */
export function handleDgStatus() {
  const snap = guardianSnapshot()
  const paused = !snap.ramOk
  return {
    ok: true,
    paused,
    pausedReason: paused
      ? 'Recursos baixos: RAM livre ' + Math.round(snap.freeMemory / 1048576) + ' MB, CPU ' + snap.cpuPercent + '%'
      : undefined,
    ramOk: snap.ramOk,
    freeMemory: snap.freeMemory
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
