/**
 * Handlers IPC para MCP
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE MCP
// ============================================================================

/**
 * Handler para listar tools do MCP
 */
export async function handleMcpTools(
  _event: Electron.IpcMainInvokeEvent
): Promise<IpcResult & { ok: boolean; erro?: string; tools?: Array<{ name: string; description: string }> }> {
  try {
    const { listarTools } = await import('../mcp/client');
    const tools = await listarTools();
    return { ok: true, tools: tools.map((t) => ({ name: t.name, description: t.description || '' })) };
  } catch (e: unknown) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Handler para status do MCP
 */
export function handleMcpStatus(
  _event: Electron.IpcMainInvokeEvent
): IpcResult & { ok: boolean; erro?: string; ativo?: boolean } {
  try {
    const { mcpAtivo } = require('../mcp/client');
    return { ok: true, ativo: mcpAtivo() };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de MCP
 */
export function registrarHandlersMcp(): void {
  dglog('[ipc:mcp] registrando handlers...');

  ipcMain.handle('mcp:tools', handleMcpTools);
  ipcMain.handle('mcp:status', handleMcpStatus);

  dglog('[ipc:mcp] handlers registrados!');
}
