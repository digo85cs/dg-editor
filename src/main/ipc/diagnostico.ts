/**
 * Handlers IPC para diagnostico
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import { caminhoSeguro, exigirString, isErroPayload } from '../ipc-seguro';
import type { DiagnosticoResultado } from '@shared/types';

// ============================================================================
// HANDLERS DE DIAGNOSTICO
// ============================================================================

/**
 * Handler para rodar diagnostico
 */
export async function handleDiagnosticoRodar(
  _event: Electron.IpcMainInvokeEvent,
  root: string | null
): Promise<DiagnosticoResultado> {
  try {
    const { diagnosticoCompleto } = await import('../diagnostico');
    return diagnosticoCompleto(root || '');
  } catch (e: unknown) {
    return {
      modulos: [{ id: 'diagnostico', nome: 'Diagnostico', ok: false, detalhe: String(e), ms: 0 }],
      ok: 0,
      total: 1,
      at: Date.now()
    };
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
