/**
 * Handlers IPC para operacoes de pasta/folder
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain, dialog } from 'electron';
import { dglog } from '../dglog';
import { caminhoSeguro, exigirString, isErroPayload } from '../ipc-seguro';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE PASTA
// ============================================================================

/**
 * Handler para escanear pasta
 */
export async function handleFolderScan(
  _event: Electron.IpcMainInvokeEvent,
  root: unknown
): Promise<IpcResult & { ok: boolean; erro?: string }> {
  const r = exigirString(root, 'root');
  if (isErroPayload(r)) return r;
  const seg = caminhoSeguro(r.valor, r.valor);
  if (!seg.ok) return { ok: false, erro: seg.erro };

  try {
    const { scanFolder } = await import('../scanner');
    return scanFolder(seg.abs);
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para formatar sumario de pasta
 */
export function handleFolderFormatSummary(
  _event: Electron.IpcMainInvokeEvent,
  result: unknown
): IpcResult & { ok: boolean; erro?: string } {
  try {
    const { formatScanSummary } = require('../scanner');
    return formatScanSummary(result);
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para seleccionar pasta via dialogo
 */
export async function handleFolderSelect(
  _event: Electron.IpcMainInvokeEvent
): Promise<{ canceled: boolean; path?: string }> {
  let mainWindowRef: Electron.BrowserWindow | null = null;
  try {
    const { getMainWindow } = await import('./index');
    mainWindowRef = getMainWindow();
  } catch {
    // ignore
  }

  const window = mainWindowRef || null;
  const result = await dialog.showOpenDialog(window!, {
    title: 'Selecionar pasta de trabalho',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Selecionar pasta'
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }
  return { canceled: false, path: result.filePaths[0] };
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de pasta
 */
export function registrarHandlersFolder(): void {
  dglog('[ipc:folder] registrando handlers...');

  ipcMain.handle('folder:scan', handleFolderScan);
  ipcMain.handle('folder:format-summary', handleFolderFormatSummary);
  ipcMain.handle('folder:select', handleFolderSelect);

  dglog('[ipc:folder] handlers registrados!');
}
