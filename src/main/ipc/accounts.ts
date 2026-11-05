/**
 * Handlers IPC para contas
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import type { AccountsState } from '@shared/types';

// ============================================================================
// HANDLERS DE CONTAS
// ============================================================================

/**
 * Handler para obter estado das contas
 */
export async function handleAccountsGetState(
  _event: Electron.IpcMainInvokeEvent
): Promise<AccountsState> {
  try {
    const { getAccountsState } = await import('../accounts');
    return getAccountsState();
  } catch (e: unknown) {
    throw e;
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
