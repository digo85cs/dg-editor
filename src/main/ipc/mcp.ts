/**
 * Handlers IPC para MCP
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import { mcpAtivo, mcpHabilitado } from '../mcp/client';
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
): IpcResult & { ok: boolean; erro?: string; ativo?: boolean; habilitado?: boolean } {
  try {
    return { ok: true, ativo: mcpAtivo(), habilitado: mcpHabilitado() };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

export async function handleMcpSetHabilitado(
  _event: Electron.IpcMainInvokeEvent,
  valor: unknown
): Promise<IpcResult & { ok: boolean; habilitado?: boolean; erro?: string }> {
  try {
    const { setMcpHabilitado } = await import('../mcp/client');
    return await setMcpHabilitado(valor === true);
  } catch (e: unknown) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

export async function handleMcpSmoke(
  _event: Electron.IpcMainInvokeEvent
): Promise<IpcResult & {
  ok: boolean
  habilitado?: boolean
  conectado?: boolean
  tools?: number
  nomes?: string[]
  erro?: string
}> {
  try {
    const { smokeMcp } = await import('../mcp/client');
    return await smokeMcp();
  } catch (e: unknown) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de MCP
 */
export async function handleConectoresListar(
  _event: Electron.IpcMainInvokeEvent
): Promise<IpcResult & { ok: boolean; conectores?: unknown[]; erro?: string }> {
  try {
    const { listarConectores } = await import('../conectores-status');
    const conectores = await listarConectores();
    return { ok: true, conectores };
  } catch (e: unknown) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e), conectores: [] };
  }
}

export function registrarHandlersMcp(): void {
  dglog('[ipc:mcp] registrando handlers...');

  ipcMain.handle('mcp:tools', handleMcpTools);
  ipcMain.handle('mcp:status', handleMcpStatus);
  ipcMain.handle('mcp:set-habilitado', handleMcpSetHabilitado);
  ipcMain.handle('mcp:smoke', handleMcpSmoke);
  ipcMain.handle('conectores:listar', handleConectoresListar);

  dglog('[ipc:mcp] handlers registrados!');
}
