/**
 * Handlers IPC para tema
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE TEMA
// ============================================================================

/**
 * Handler para obter tema
 */
export function handleTemaGet(
  _event: Electron.IpcMainInvokeEvent
): IpcResult & { ok: boolean; erro?: string; tema?: string } {
  try {
    const { lerTema } = require('../tema');
    return { ok: true, tema: lerTema() };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para definir tema
 */
export function handleTemaSet(
  _event: Electron.IpcMainInvokeEvent,
  tema: 'escuro' | 'claro'
): IpcResult & { ok: boolean; erro?: string; tema?: string } {
  try {
    const { lerTema, salvarTema } = require('../tema');
    salvarTema(tema === 'claro' ? 'claro' : 'escuro');
    return { ok: true, tema: lerTema() };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de tema
 */
export function registrarHandlersTema(): void {
  dglog('[ipc:tema] registrando handlers...');

  ipcMain.handle('tema:get', handleTemaGet);
  ipcMain.handle('tema:set', handleTemaSet);

  dglog('[ipc:tema] handlers registrados!');
}
