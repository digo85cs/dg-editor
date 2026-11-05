/**
 * Handlers IPC para dossie
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import { caminhoSeguro, exigirString, isErroPayload } from '../ipc-seguro';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE DOSSIE
// ============================================================================

/**
 * Handler para ler dossie
 */
export async function handleDossieLer(
  _event: Electron.IpcMainInvokeEvent
): Promise<IpcResult & { ok: boolean; erro?: string }> {
  try {
    const { lerDossie } = await import('../dossie');
    return lerDossie();
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para gravar dossie
 */
export async function handleDossieGravar(
  _event: Electron.IpcMainInvokeEvent,
  root: string
): Promise<IpcResult & { ok: boolean; erro?: string; caminho?: string }> {
  try {
    const { loadChat } = await import('../chatstore');
    const { gravarDossie } = await import('../dossie');
    const destino = await gravarDossie(loadChat(root), { root });
    return { ok: true, caminho: destino };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para snapshot do dossie
 */
export async function handleDossieSnapshot(
  _event: Electron.IpcMainInvokeEvent
): Promise<IpcResult & { ok: boolean; erro?: string }> {
  try {
    const { dossieSnapshot } = await import('../dossie');
    return dossieSnapshot();
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para caminho do dossie
 */
export function handleDossieCaminho(
  _event: Electron.IpcMainInvokeEvent
): IpcResult & { ok: boolean; erro?: string } {
  try {
    const { caminhoDossie } = require('../dossie');
    return { ok: true, caminho: caminhoDossie() };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de dossie
 */
export function registrarHandlersDossie(): void {
  dglog('[ipc:dossie] registrando handlers...');

  ipcMain.handle('dossie:ler', handleDossieLer);
  ipcMain.handle('dossie:gravar', handleDossieGravar);
  ipcMain.handle('dossie:snapshot', handleDossieSnapshot);
  ipcMain.handle('dossie:caminho', handleDossieCaminho);

  dglog('[ipc:dossie] handlers registrados!');
}
