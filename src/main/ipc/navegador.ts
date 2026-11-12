/**
 * Handlers IPC para operacoes de navegador
 * Extraido de src/main/index.ts
 */

import { ipcMain, BrowserWindow } from 'electron';
import {
  criarJanelaNavegador,
  fecharJanelaNavegador,
  destruirJanelaNavegador,
  lerUltimaUrlNavegador,
  definirJanelaPrincipalNavegador,
  mostrarNavegadorEmbutido,
  layoutNavegador,
  statusEmbedNavegador,
  navegadorVoltar,
  navegadorAvancar,
  navegadorRecarregar,
} from '../navegador/janela';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// ============================================================================
// ESTADO DO NAVEGADOR
// ============================================================================

let mainWindow: BrowserWindow | null = null;

/**
 * Define a janela principal (chamado do index.ts)
 */
export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
  if (mainWindow && !mainWindow.isDestroyed()) {
    definirJanelaPrincipalNavegador(mainWindow);
  }
}

// ============================================================================
// HANDLERS DE NAVEGADOR
// ============================================================================

/**
 * Handler para abrir navegador
 */
export function handleNavegadorAbrir(
  _event: Electron.IpcMainInvokeEvent,
  url?: string
): IpcResult & { ok: boolean } {
  const dest = (url && String(url).trim()) || lerUltimaUrlNavegador() || 'about:blank';
  dglog('[navegador] abrir embutido url=' + dest);
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      definirJanelaPrincipalNavegador(mainWindow);
    }
    criarJanelaNavegador(dest, { mostrar: true });
    mostrarNavegadorEmbutido(true);
    try {
      mainWindow?.webContents?.send('navegador:aberto');
    } catch {
      // ignore
    }
    return { ok: true };
  } catch (e) {
    dglog('[navegador] abrir falhou: ' + String(e instanceof Error ? e.message : e));
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para status do navegador embutido
 */
export function handleNavegadorEmbedStatus(): IpcResult & { ok: boolean } & Record<string, unknown> {
  return { ok: true, ...statusEmbedNavegador() };
}

/**
 * Handler para definir bounds do navegador
 */
export function handleNavegadorBounds(
  _event: Electron.IpcMainInvokeEvent,
  b: unknown
): void {
  if (!b || typeof b !== 'object') return;
  const o = b as Record<string, unknown>;
  if (
    typeof o.x !== 'number' ||
    typeof o.y !== 'number' ||
    typeof o.width !== 'number' ||
    typeof o.height !== 'number'
  ) {
    return;
  }
  layoutNavegador({
    x: o.x,
    y: o.y,
    width: o.width,
    height: o.height,
  });
}

/**
 * Handler para mostrar/ocultar navegador
 */
export function handleNavegadorMostrar(
  _event: Electron.IpcMainInvokeEvent,
  mostrar: unknown
): void {
  mostrarNavegadorEmbutido(
    mostrar === true || mostrar === 'true' || mostrar === 1
  );
}

/**
 * Handler para fechar navegador
 */
export function handleNavegadorFechar(): IpcResult & { ok: boolean } {
  fecharJanelaNavegador();
  try {
    mainWindow?.webContents?.send('navegador:fechado');
  } catch {
    // ignore
  }
  return { ok: true };
}

export function handleNavegadorVoltar(): IpcResult & { ok: boolean } {
  return navegadorVoltar();
}

export function handleNavegadorAvancar(): IpcResult & { ok: boolean } {
  return navegadorAvancar();
}

export function handleNavegadorRecarregar(): IpcResult & { ok: boolean } {
  return navegadorRecarregar();
}

// ============================================================================
// EVENTOS DO NAVEGADOR
// ============================================================================

/**
 * Evento recouvado do navegador (para enviar ao renderer)
 */
export function emitNavegadorEvent(event: 'aberto' | 'fechado'): void {
  try {
    mainWindow?.webContents?.send(`navegador:${event}`);
  } catch {
    // ignore
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de navegador
 */
export function registrarHandlersNavegador(): void {
  dglog('[ipc:navegador] registrando handlers...');

  ipcMain.handle('navegador:abrir', handleNavegadorAbrir);
  ipcMain.handle('navegador:embed-status', handleNavegadorEmbedStatus);
  ipcMain.handle('navegador:fechar', handleNavegadorFechar);
  ipcMain.handle('navegador:voltar', handleNavegadorVoltar);
  ipcMain.handle('navegador:avancar', handleNavegadorAvancar);
  ipcMain.handle('navegador:recarregar', handleNavegadorRecarregar);

  ipcMain.on('navegador:bounds', handleNavegadorBounds);
  ipcMain.on('navegador:mostrar', handleNavegadorMostrar);

  dglog('[ipc:navegador] handlers registrados com sucesso');
}

// ============================================================================
// FUNCOES DE CLEANUP
// ============================================================================

/**
 * Funcao para destruir navegador (usada no window-all-closed)
 */
export function cleanupNavegador(): void {
  destruirJanelaNavegador();
}
