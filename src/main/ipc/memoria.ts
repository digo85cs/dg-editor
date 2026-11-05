/**
 * Handlers IPC para memoria
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import { caminhoSeguro, exigirString, isErroPayload } from '../ipc-seguro';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE MEMORIA
// ============================================================================

/**
 * Handler para listar memorias
 */
export function handleMemoriaListar(
  _event: Electron.IpcMainInvokeEvent,
  root: unknown
): Promise<IpcResult & { ok: boolean; erro?: string; itens?: unknown }> {
  const r = exigirString(root, 'root');
  if (isErroPayload(r)) return Promise.resolve(r);
  const seg = caminhoSeguro(r.valor, r.valor);
  if (!seg.ok) return Promise.resolve({ ok: false, erro: seg.erro });
  return import('../memorias').then((m) => ({ ok: true, itens: m.listarMemorias(seg.abs) }));
}

/**
 * Handler para propor memoria
 */
export function handleMemoriaPropor(
  _event: Electron.IpcMainInvokeEvent,
  root: unknown,
  texto: unknown
): Promise<IpcResult> {
  const r = exigirString(root, 'root');
  if (isErroPayload(r)) return Promise.resolve(r);
  const seg = caminhoSeguro(r.valor, r.valor);
  if (!seg.ok) return Promise.resolve({ ok: false, erro: seg.erro });
  const t = typeof texto === 'string' ? texto : '';
  return import('../memorias').then((m) => m.proporMemoria(seg.abs, t));
}

/**
 * Handler para decidir memoria
 */
export function handleMemoriaDecidir(
  _event: Electron.IpcMainInvokeEvent,
  root: unknown,
  id: unknown,
  aceitar: unknown
): Promise<IpcResult> {
  const r = exigirString(root, 'root');
  if (isErroPayload(r)) return Promise.resolve(r);
  const seg = caminhoSeguro(r.valor, r.valor);
  if (!seg.ok) return Promise.resolve({ ok: false, erro: seg.erro });
  const mid = typeof id === 'string' ? id : '';
  return import('../memorias').then((m) => m.decidirMemoria(seg.abs, mid, aceitar === true));
}

/**
 * Handler para status da memoria
 */
export function handleMemoriaStatus(
  _event: Electron.IpcMainInvokeEvent,
  root: string
): IpcResult & { ok: boolean; erro?: string; turnos?: number; modelo?: string } {
  try {
    const { carregarIndice } = require('../memory/embeddings');
    const idx = carregarIndice(root);
    return { ok: true, turnos: idx.entradas.length, modelo: idx.modelo };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para indexar memoria
 */
export async function handleMemoriaIndexar(
  _event: Electron.IpcMainInvokeEvent,
  root: string,
  role: 'user' | 'assistant',
  texto: string
): Promise<IpcResult & { ok: boolean; erro?: string }> {
  try {
    const { indexarTurno } = await import('../memory/embeddings');
    await indexarTurno(root, role, texto);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de memoria
 */
export function registrarHandlersMemoria(): void {
  dglog('[ipc:memoria] registrando handlers...');

  ipcMain.handle('memoria:listar', handleMemoriaListar);
  ipcMain.handle('memoria:propor', handleMemoriaPropor);
  ipcMain.handle('memoria:decidir', handleMemoriaDecidir);
  ipcMain.handle('memoria:status', handleMemoriaStatus);
  ipcMain.handle('memoria:indexar', handleMemoriaIndexar);

  dglog('[ipc:memoria] handlers registrados!');
}
