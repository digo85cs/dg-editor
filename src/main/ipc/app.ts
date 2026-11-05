/**
 * Handlers IPC para operacoes de aplicacao
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain, app as electronApp } from 'electron';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE APLICACAO
// ============================================================================

/**
 * Handler para obter raiz do projeto
 */
export async function handleAppRaizProjeto(
  _event: Electron.IpcMainInvokeEvent
): Promise<IpcResult & { raiz?: string; fonte?: string; ok: boolean; erro?: string }> {
  try {
    const { resolverRaizProjeto, fonteRaizResolvida } = await import('../paths');
    const raiz = resolverRaizProjeto();
    return { ok: true, raiz, fonte: fonteRaizResolvida() };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para fechar aplicacao
 */
export function handleAppQuit(
  _event: Electron.IpcMainInvokeEvent
): void {
  dglog('[ipc:app] quit solicitado');
  electronApp.quit();
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de aplicacao
 */
export function registrarHandlersApp(): void {
  dglog('[ipc:app] registrando handlers...');

  ipcMain.handle('app:raiz-projeto', handleAppRaizProjeto);
  ipcMain.on('app:quit', handleAppQuit);

  dglog('[ipc:app] handlers registrados!');
}
