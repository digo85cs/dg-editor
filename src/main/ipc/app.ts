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
 * Informa se a sessao roda em modo de QA (e2e/mock), para o renderer
 * evitar avisos transitorios que poluem capturas e testes.
 */
export function handleAppQaMode(): { ok: boolean; e2e: boolean; fakeLlm: boolean } {
  return {
    ok: true,
    e2e: process.env.DG_QA_E2E === '1',
    fakeLlm: process.env.DG_FAKE_LLM === '1'
  };
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
  ipcMain.handle('app:qa-mode', handleAppQaMode);
  ipcMain.on('app:quit', handleAppQuit);

  dglog('[ipc:app] handlers registrados!');
}
