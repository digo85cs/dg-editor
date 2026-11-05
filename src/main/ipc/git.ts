/**
 * Handlers IPC para operacoes de Git
 * Extraido de src/main/index.ts
 */

import { ipcMain, dialog } from 'electron';
import { gitStatus, gitDiff, gitRepos } from '../git';
import { caminhoSeguro, exigirString, exigirArrayStrings, isErroPayload } from '../ipc-seguro';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE GIT
// ============================================================================

/**
 * Handler para status do git
 */
export async function handleGitStatus(
  _event: Electron.IpcMainInvokeEvent,
  raiz: unknown
): Promise<IpcResult & { status?: unknown; erro?: string }> {
  const r = exigirString(raiz, 'raiz');
  if (isErroPayload(r)) return { ok: false, erro: r.erro };

  const seg = caminhoSeguro(r, r);
  if (!seg.ok) return { ok: false, erro: seg.erro };

  try {
    const status = await gitStatus(seg.abs);
    return { ok: true, status };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    dglog(`[git:status] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para diff do git
 */
export async function handleGitDiff(
  _event: Electron.IpcMainInvokeEvent,
  raiz: unknown,
  caminho: unknown
): Promise<{ ok: boolean; diff?: string; erro?: string }> {
  const r = exigirString(raiz, 'raiz');
  if (isErroPayload(r)) return { ok: false, erro: r.erro };

  const c = exigirString(caminho, 'caminho');
  if (isErroPayload(c)) return { ok: false, erro: c.erro };

  const segRaiz = caminhoSeguro(r, r);
  if (!segRaiz.ok) return { ok: false, erro: segRaiz.erro };

  const segCaminho = caminhoSeguro(c, r);
  if (!segCaminho.ok) return { ok: false, erro: segCaminho.erro };

  try {
    const result = await gitDiff(segRaiz.abs, segCaminho.abs);
    return { ok: result.ok, diff: result.diff, erro: result.erro };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    dglog(`[git:diff] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para listar repos
 */
export async function handleGitRepos(
  _event: Electron.IpcMainInvokeEvent,
  payload: unknown
): Promise<IpcResult & { repos?: unknown[]; erro?: string }> {
  try {
    if (!payload || typeof payload !== 'object') {
      return { ok: true, repos: [] };
    }

    const o = payload as Record<string, unknown>;
    const pastas = exigirArrayStrings(o.pastas, 'pastas');
    if (isErroPayload(pastas)) return { ok: true, repos: [] };

    const repos = await gitRepos(pastas);
    return { ok: true, repos };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    dglog(`[git:repos] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de git
 */
export function registrarHandlersGit(): void {
  dglog('[ipc:git] registrando handlers...');

  ipcMain.handle('git:status', handleGitStatus);
  ipcMain.handle('git:diff', handleGitDiff);
  ipcMain.handle('git:repos', handleGitRepos);

  dglog('[ipc:git] handlers registrados com sucesso');
}
