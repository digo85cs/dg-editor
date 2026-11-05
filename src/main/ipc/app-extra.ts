/**
 * Handlers IPC para aplicacao (complementares)
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import { SAFE_MODE } from '../safe-mode';
import { emSafeMode } from '../safe-mode';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE APLICACAO EXTRA
// ============================================================================

/**
 * Handler para verificar se esta em safe mode
 */
export function handleAppIsSafeMode(
  _event: Electron.IpcMainInvokeEvent
): IpcResult & { ok: boolean; safeMode?: boolean } {
  return { ok: true, safeMode: emSafeMode() || SAFE_MODE };
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de aplicacao extra
 */
export function registrarHandlersAppExtra(): void {
  dglog('[ipc:app-extra] registrando handlers...');

  ipcMain.handle('app:is-safe-mode', handleAppIsSafeMode);

  dglog('[ipc:app-extra] handlers registrados!');
}
