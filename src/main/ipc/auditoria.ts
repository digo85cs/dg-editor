/**
 * Handlers IPC para auditoria
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import type { RelatorioAuditoria } from '../auto-auditoria';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE AUDITORIA
// ============================================================================

/**
 * Handler para rodar auditoria
 */
export async function handleAuditoriaRodar(
  _event: Electron.IpcMainInvokeEvent,
  opcoes: unknown
): Promise<RelatorioAuditoria | { ok: false; erro: string }> {
  try {
    const mod = await import('../auto-auditoria');
    const opts = opcoes as Record<string, unknown>;
    return await mod.rodarAuditoria({
      ...mod.OPCOES_AUDITORIA_PADRAO,
      autoAtualizar: opts?.autoAtualizar === true,
      reiniciarAoFim: opts?.reiniciarAoFim === true,
      bootLeve: opts?.bootLeve === true
    });
  } catch (e: unknown) {
    return { ok: false, erro: String((e as Error)?.message || e) };
  }
}

/**
 * Handler para auditoria periodica
 */
export async function handleAuditoriaPeriodica(
  _event: Electron.IpcMainInvokeEvent,
  ativar: boolean
): Promise<IpcResult & { ok: boolean; erro?: string }> {
  try {
    const mod = await import('../auto-auditoria');
    if (ativar) { mod.iniciarAuditoriaPeriodica(); } else { mod.pararAuditoriaPeriodica(); }
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, erro: String((e as Error)?.message || e) };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de auditoria
 */
export function registrarHandlersAuditoria(): void {
  dglog('[ipc:auditoria] registrando handlers...');

  ipcMain.handle('auditoria:rodar', handleAuditoriaRodar);
  ipcMain.handle('auditoria:periodica', handleAuditoriaPeriodica);

  dglog('[ipc:auditoria] handlers registrados!');
}
