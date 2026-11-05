/**
 * Handlers IPC para diagnostico
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import { caminhoSeguro, exigirString, isErroPayload } from '../ipc-seguro';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE DIAGNOSTICO
// ============================================================================

/**
 * Handler para rodar diagnostico
 */
export async function handleDiagnosticoRodar(
  _event: Electron.IpcMainInvokeEvent,
  root: string | null
): Promise<IpcResult & { ok: boolean; erro?: string }> {
  try {
    const { diagnosticoCompleto } = await import('../diagnostico');
    return diagnosticoCompleto(root || '');
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de diagnostico
 */
export function registrarHandlersDiagnostico(): void {
  dglog('[ipc:diagnostico] registrando handlers...');

  ipcMain.handle('diagnostico:rodar', handleDiagnosticoRodar);

  dglog('[ipc:diagnostico] handlers registrados!');
}
