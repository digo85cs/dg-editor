/**
 * Handlers IPC para QA
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { execFileSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE QA
// ============================================================================

/**
 * Handler para rodar QA
 */
export async function handleQaRun(
  _event: Electron.IpcMainInvokeEvent,
  opcoes: unknown
): Promise<IpcResult & { ok: boolean; erro?: string; saida?: string }> {
  try {
    const opts = opcoes as Record<string, unknown>;
    const suite = opts?.suite as string;
    const cmd = 'node';
    const script = './scripts/run-qa.cjs';
    const args = [];
    if (suite) args.push(`--suite=${suite}`);

    dglog(`[qa:run] executando: ${cmd} ${script} ${args.join(' ')}`);
    const saida = execFileSync(cmd, [script, ...args], { encoding: 'utf8', stdio: 'pipe' });
    return { ok: true, saida };
  } catch (e: unknown) {
    const erro = e as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, saida: erro.stdout || erro.stderr || String(erro.message || e) };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de QA
 */
export function registrarHandlersQa(): void {
  dglog('[ipc:qa] registrando handlers...');

  ipcMain.handle('qa:run', handleQaRun);

  dglog('[ipc:qa] handlers registrados!');
}
