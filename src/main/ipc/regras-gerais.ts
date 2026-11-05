/**
 * Handlers IPC para regras gerais
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE REGRAS GERAIS
// ============================================================================

/**
 * Registra handlers de regras gerais
 */
export function registrarHandlersRegrasGerais(): void {
  dglog('[ipc:regras-gerais] registrando handlers...');

  try {
    const rg = require('../regras-gerais');
    ipcMain.handle('dg:regrasgerais:listar', () => ({ ok: true, regras: rg.listarRegrasGerais() }));
    ipcMain.handle('dg:regrasgerais:salvar', (_e: Electron.IpcMainInvokeEvent, r: unknown) => rg.salvarRegrasGerais(r));
    ipcMain.handle('dg:regrasgerais:ativas', () => ({ ok: true, texto: rg.obterRegrasAtivas() }));
    dglog('[ipc:regras-gerais] handlers registrados!');
  } catch (e: unknown) {
    dglog('[ipc:regras-gerais] erro ao registrar handlers: ' + String(e));
  }
}
