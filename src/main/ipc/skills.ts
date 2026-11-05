/**
 * Handlers IPC para skills
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import { caminhoSeguro, exigirString, isErroPayload } from '../ipc-seguro';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE SKILLS
// ============================================================================

/**
 * Handler para listar skills
 */
export async function handleSkillsListar(
  _event: Electron.IpcMainInvokeEvent,
  raiz: unknown
): Promise<IpcResult & { ok: boolean; erro?: string; skills?: Array<{ id: string; titulo: string; gatilho: string }> }> {
  const r = exigirString(raiz, 'raiz');
  if (isErroPayload(r)) return r;
  const { listarSkills } = await import('../brain/skills');
  return {
    ok: true,
    skills: listarSkills(r.valor).map((s: { id: string; titulo: string; gatilho: string }) => ({ id: s.id, titulo: s.titulo, gatilho: s.gatilho }))
  };
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de skills
 */
export function registrarHandlersSkills(): void {
  dglog('[ipc:skills] registrando handlers...');

  ipcMain.handle('skills:listar', handleSkillsListar);

  dglog('[ipc:skills] handlers registrados!');
}
