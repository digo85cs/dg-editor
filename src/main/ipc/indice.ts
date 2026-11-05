/**
 * Handlers IPC para indice de arquivos
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import { caminhoSeguro, exigirString, isErroPayload } from '../ipc-seguro';
import { SAFE_MODE } from '../safe-mode';
import { emSafeMode } from '../safe-mode';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE INDICE
// ============================================================================

/**
 * Handler para iniciar/criar indice
 */
export function handleIndiceIniciar(
  _event: Electron.IpcMainInvokeEvent,
  root: unknown
): Promise<IpcResult & { ok: boolean; erro?: string; total?: number }> {
  if (SAFE_MODE || emSafeMode()) {
    dglog('[safe-mode] indice/watcher bloqueado');
    return Promise.resolve({ ok: false, total: 0, erro: 'safe-mode' });
  }
  const r = exigirString(root, 'root');
  if (isErroPayload(r)) return Promise.resolve(r);
  return import('../indice-arquivos').then((m) => m.iniciarIndice(r.valor));
}

/**
 * Handler para criar indice (alias para iniciar)
 */
export function handleIndiceCriar(
  _event: Electron.IpcMainInvokeEvent,
  root: unknown
): Promise<IpcResult & { ok: boolean; erro?: string }> {
  const r = exigirString(root, 'root');
  if (isErroPayload(r)) return Promise.resolve(r);
  return import('../indice-arquivos').then((m) => m.iniciarIndice(r.valor));
}

/**
 * Handler para listar indice
 */
export function handleIndiceListar(
  _event: Electron.IpcMainInvokeEvent,
  filtro: unknown
): Promise<IpcResult & { ok: boolean; itens?: unknown }> {
  const f = filtro == null ? '' : typeof filtro === 'string' ? filtro : '';
  return import('../indice-arquivos').then((m) => ({ ok: true, itens: m.listarIndice(f), ...m.statusIndice() }));
}

/**
 * Handler para status do indice
 */
export function handleIndiceStatus(
  _event: Electron.IpcMainInvokeEvent
): Promise<IpcResult & { ok: boolean }> {
  return import('../indice-arquivos').then((m) => ({ ok: true, ...m.statusIndice() }));
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de indice
 */
export function registrarHandlersIndice(): void {
  dglog('[ipc:indice] registrando handlers...');

  ipcMain.handle('indice:iniciar', handleIndiceIniciar);
  ipcMain.handle('indice:criar', handleIndiceCriar);
  ipcMain.handle('indice:listar', handleIndiceListar);
  ipcMain.handle('indice:status', handleIndiceStatus);

  dglog('[ipc:indice] handlers registrados!');
}
