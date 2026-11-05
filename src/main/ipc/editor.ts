/**
 * Handlers IPC para editor
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE EDITOR
// ============================================================================

/**
 * Handler para completacao de codigo
 */
export async function handleEditorCompletar(
  _event: Electron.IpcMainInvokeEvent,
  prefixo: unknown,
  sufixo: unknown
): Promise<IpcResult & { ok: boolean; erro?: string; texto?: string }> {
  const pre = typeof prefixo === 'string' ? prefixo : '';
  const suf = typeof sufixo === 'string' ? sufixo : '';
  if (pre.trim().length < 2) return { ok: true, texto: '' };
  try {
    const { completarTrecho } = await import('../completar-tab');
    return { ok: true, texto: await completarTrecho(pre, suf) };
  } catch (e: unknown) {
    return { ok: false, texto: '', erro: e instanceof Error ? e.message : String(e) };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de editor
 */
export function registrarHandlersEditor(): void {
  dglog('[ipc:editor] registrando handlers...');

  ipcMain.handle('editor:completar', handleEditorCompletar);

  dglog('[ipc:editor] handlers registrados!');
}
