/**
 * Handlers IPC para contas
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE CONTAS
// ============================================================================

/**
 * Handler para obter estado das contas
 */
export async function handleAccountsGetState(
  _event: Electron.IpcMainInvokeEvent
): Promise<IpcResult & { ok: boolean; erro?: string }> {
  try {
    const { getAccountsState } = await import('../accounts');
    return getAccountsState();
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de contas
 */
export function registrarHandlersAccounts(): void {
  dglog('[ipc:accounts] registrando handlers...');

  ipcMain.handle('accounts:get-state', handleAccountsGetState);

  dglog('[ipc:accounts] handlers registrados!');
}
