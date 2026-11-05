/**
 * Handlers IPC para chat (complementares)
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE CHAT EXTRA
// ============================================================================

/**
 * Handler para enviar mensagem de chat
 * NOTE: Implementacao complexa - manter referencia no index.ts
 */
export async function handleChatSend(
  _event: Electron.IpcMainInvokeEvent,
  root: string,
  content: string,
  opts: unknown
): Promise<IpcResult & { ok: boolean; erro?: string }> {
  // TODO: Implementar logica completa
  // Por enquanto, manter implementacao do index.ts original
  dglog('[chat:send] handler a ser implementado');
  return { ok: false, erro: 'Implementacao a ser extraida' };
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de chat extra
 */
export function registrarHandlersChatExtra(): void {
  dglog('[ipc:chat-extra] registrando handlers...');

  ipcMain.handle('chat:send', handleChatSend);

  dglog('[ipc:chat-extra] handlers registrados!');
}
