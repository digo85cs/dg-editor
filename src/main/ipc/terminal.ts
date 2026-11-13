/**
 * Handlers IPC para operacoes de terminal
 * Extraido de src/main/index.ts
 */

import { ipcMain } from 'electron';
import {
  createTerminal,
  writeTerminal,
  resizeTerminal,
  killTerminal,
  killAllTerminals,
  shellAtivo,
} from '../terminal';
import { getShellCache, listarShells, lerShellPadrao, salvarShellPadrao } from '../shell-detect';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE TERMINAL
// ============================================================================

/**
 * Handler para criar terminal
 */
export function handleTerminalCreate(
  event: Electron.IpcMainInvokeEvent,
  id: string,
  opts?: { cwd?: string; cols?: number; rows?: number; shellExe?: string; shellId?: string }
): IpcResult & { ok: boolean; erro?: string; shell?: unknown; pid?: number; cwd?: string } {
  try {
    const r = createTerminal(String(id), opts || {}, event.sender);
    return { ok: true, shell: r.shell, pid: r.pid, cwd: r.cwd };
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    dglog(`[terminal:create] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para escrever no terminal
 */
export function handleTerminalWrite(
  _event: Electron.IpcMainInvokeEvent,
  id: string,
  data: string
): IpcResult {
  try {
    writeTerminal(String(id), String(data ?? ''));
    return { ok: true };
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    dglog(`[terminal:write] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para redimensionar terminal
 */
export function handleTerminalResize(
  _event: Electron.IpcMainInvokeEvent,
  id: string,
  cols: number,
  rows: number
): IpcResult {
  try {
    resizeTerminal(String(id), Number(cols) || 80, Number(rows) || 24);
    return { ok: true };
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    dglog(`[terminal:resize] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para matar terminal
 */
export function handleTerminalKill(
  _event: Electron.IpcMainInvokeEvent,
  id: string
): IpcResult {
  try {
    killTerminal(String(id));
    return { ok: true };
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    dglog(`[terminal:kill] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para obter shell ativo
 */
export function handleTerminalShell(): IpcResult & { shell?: unknown } {
  try {
    const shell = shellAtivo() || getShellCache();
    return { ok: true, shell };
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    dglog(`[terminal:shell] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para listar shells
 */
export function handleTerminalShells(): IpcResult & { shells?: unknown[] } {
  try {
    const shells = listarShells();
    return { ok: true, shells };
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    dglog(`[terminal:shells] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para obter shell padrao
 */
export function handleTerminalGetShellPadrao(): IpcResult & { shell?: unknown } {
  try {
    const shell = lerShellPadrao();
    return { ok: true, shell };
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    dglog(`[terminal:getShellPadrao] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para definir shell padrao
 */
export function handleTerminalSetShellPadrao(
  _event: Electron.IpcMainInvokeEvent,
  id: string | null
): IpcResult {
  try {
    salvarShellPadrao(id == null || id === '' ? null : String(id));
    return { ok: true };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    dglog(`[terminal:setShellPadrao] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de terminal
 */
export function registrarHandlersTerminal(): void {
  dglog('[ipc:terminal] registrando handlers...');

  ipcMain.handle('terminal:create', handleTerminalCreate);
  ipcMain.handle('terminal:write', handleTerminalWrite);
  ipcMain.handle('terminal:resize', handleTerminalResize);
  ipcMain.handle('terminal:kill', handleTerminalKill);
  ipcMain.handle('terminal:shell', handleTerminalShell);
  ipcMain.handle('terminal:shells', handleTerminalShells);
  ipcMain.handle('terminal:getShellPadrao', handleTerminalGetShellPadrao);
  ipcMain.handle('terminal:setShellPadrao', handleTerminalSetShellPadrao);

  dglog('[ipc:terminal] handlers registrados com sucesso');
}

// ============================================================================
// FUNCOES DE CLEANUP
// ============================================================================

/**
 * Funcao para matar todos os terminais (usada no before-quit)
 */
export function cleanupTerminal(): void {
  killAllTerminals();
}
