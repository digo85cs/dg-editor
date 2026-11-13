/**
 * Handlers IPC para operacoes de janela
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain, BrowserWindow } from 'electron';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// ============================================================================
// ESTADO
// ============================================================================

let mainWindowRef: BrowserWindow | null = null;

/**
 * Define a janela principal
 */
export function setJanelaMainWindow(window: BrowserWindow | null): void {
  mainWindowRef = window;
}

// ============================================================================
// HANDLERS DE JANELA
// ============================================================================

/**
 * Handler para minimizar janela
 */
export function handleJanelaMinimizar(
  _event: Electron.IpcMainInvokeEvent
): void {
  mainWindowRef?.minimize();
}

/**
 * Handler para maximizar janela
 */
export function handleJanelaMaximizar(
  _event: Electron.IpcMainInvokeEvent
): boolean {
  if (!mainWindowRef) return false;
  if (mainWindowRef.isMaximized()) { mainWindowRef.unmaximize(); } else { mainWindowRef.maximize(); }
  return mainWindowRef.isMaximized();
}

/**
 * Handler para fechar janela
 */
export function handleJanelaFechar(
  _event: Electron.IpcMainInvokeEvent
): void {
  mainWindowRef?.close();
}

/**
 * Handler para obter estado da janela
 */
export function handleJanelaEstado(
  _event: Electron.IpcMainInvokeEvent
): { maximizado: boolean } {
  return { maximizado: !!mainWindowRef?.isMaximized() };
}

/**
 * Handler para recarregar janela
 */
export function handleJanelaRecarregar(
  _event: Electron.IpcMainInvokeEvent,
  forcar: unknown
): IpcResult & { ok: boolean } {
  const wc = mainWindowRef?.webContents;
  if (!wc) return { ok: false };
  if (forcar === true) wc.reloadIgnoringCache();
  else wc.reload();
  return { ok: true };
}

/**
 * Handler para zoom da janela
 */
export function handleJanelaZoom(
  _event: Electron.IpcMainInvokeEvent,
  op: unknown
): IpcResult & { ok: boolean; fator?: number } {
  const wc = mainWindowRef?.webContents;
  if (!wc) return { ok: false, fator: 1 };
  const atual = wc.getZoomFactor();
  let prox = atual;
  const operacao = typeof op === 'string' ? op : '';
  if (operacao === 'in') prox = Math.min(3, Math.round((atual + 0.1) * 100) / 100);
  else if (operacao === 'out') prox = Math.max(0.5, Math.round((atual - 0.1) * 100) / 100);
  else prox = 1;
  wc.setZoomFactor(prox);
  return { ok: true, fator: prox };
}

/**
 * Handler para aplicar um fator de zoom exato (preferência de acesso).
 */
export function handleJanelaZoomFator(
  _event: Electron.IpcMainInvokeEvent,
  fator: unknown
): IpcResult & { ok: boolean; fator: number } {
  const wc = mainWindowRef?.webContents;
  if (!wc) return { ok: false, fator: 1 };
  const n = Number(fator);
  const prox = Number.isFinite(n)
    ? Math.min(2, Math.max(0.5, Math.round(n * 100) / 100))
    : 1;
  wc.setZoomFactor(prox);
  return { ok: true, fator: prox };
}

/**
 * Handler para ler o fator de zoom atual.
 */
export function handleJanelaZoomEstado(): IpcResult & { ok: boolean; fator: number } {
  const wc = mainWindowRef?.webContents;
  if (!wc) return { ok: false, fator: 1 };
  return { ok: true, fator: wc.getZoomFactor() };
}

/**
 * Handler para tela cheia
 */
export function handleJanelaTelaCheia(
  _event: Electron.IpcMainInvokeEvent
): IpcResult & { ok: boolean; cheia?: boolean } {
  if (!mainWindowRef) return { ok: false, cheia: false };
  const cheia = !mainWindowRef.isFullScreen();
  mainWindowRef.setFullScreen(cheia);
  return { ok: true, cheia };
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de janela
 */
export function registrarHandlersJanela(): void {
  dglog('[ipc:janela] registrando handlers...');

  ipcMain.handle('janela:minimizar', handleJanelaMinimizar);
  ipcMain.handle('janela:maximizar', handleJanelaMaximizar);
  ipcMain.handle('janela:fechar', handleJanelaFechar);
  ipcMain.handle('janela:estado', handleJanelaEstado);
  ipcMain.handle('janela:recarregar', handleJanelaRecarregar);
  ipcMain.handle('janela:zoom', handleJanelaZoom);
  ipcMain.handle('janela:zoom-fator', handleJanelaZoomFator);
  ipcMain.handle('janela:zoom-estado', handleJanelaZoomEstado);
  ipcMain.handle('janela:tela-cheia', handleJanelaTelaCheia);

  dglog('[ipc:janela] handlers registrados!');
}
