/**
 * Handlers IPC para operacoes de agente
 * Extraido de src/main/index.ts
 */

import { ipcMain } from 'electron';
import { executarAgente, escolherModelo, historico } from '../brain/agent';
import { emSafeMode } from '../safe-mode';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE AGENTE
// ============================================================================

/**
 * Handler para executar agente
 */
export async function handleAgenteExecutar(
  _event: Electron.IpcMainInvokeEvent,
  root: string,
  pergunta: string,
  modeloOuOpcoes?: string | { modelo?: string; modo?: string; agente?: string; contextoExtra?: string }
): Promise<IpcResult & {
  texto?: string;
  modelo?: string;
  passos?: unknown[];
  duracaoMs?: number;
  modo?: string;
  erro?: string;
}> {
  if (emSafeMode()) {
    return { ok: false, erro: 'safe-mode' };
  }

  try {
    const opcoes =
      typeof modeloOuOpcoes === 'string'
        ? { modeloForcado: modeloOuOpcoes }
        : modeloOuOpcoes && typeof modeloOuOpcoes === 'object'
          ? {
              modeloForcado: typeof modeloOuOpcoes.modelo === 'string' ? modeloOuOpcoes.modelo : undefined,
              modo: modeloOuOpcoes.modo === 'plan' ? ('plan' as const) : ('agent' as const),
              agente: typeof modeloOuOpcoes.agente === 'string' ? modeloOuOpcoes.agente : undefined,
              contextoExtra:
                typeof modeloOuOpcoes.contextoExtra === 'string' ? modeloOuOpcoes.contextoExtra : undefined,
            }
          : {};

    const r = await executarAgente(root, pergunta, opcoes);
    return {
      ok: true,
      texto: r.texto,
      modelo: r.modelo,
      passos: r.passos,
      duracaoMs: r.duracaoMs,
      modo: opcoes.modo || 'agent',
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    dglog('[agente:executar] falhou: ' + msg);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para obter modelo do agente
 */
export async function handleAgenteModelo(): Promise<IpcResult & { modelo?: string; erro?: string }> {
  if (emSafeMode()) {
    return { ok: false, erro: 'safe-mode' };
  }

  try {
    const modelo = await escolherModelo();
    return { ok: true, modelo };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para historico do agente
 */
export async function handleAgenteHistorico(
  _event: Electron.IpcMainInvokeEvent,
  root: string
): Promise<IpcResult & { mensagens?: unknown[]; erro?: string }> {
  if (emSafeMode()) {
    return { ok: false, erro: 'safe-mode' };
  }

  try {
    const mensagens = await historico(root);
    return { ok: true, mensagens };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de agente
 */
export function registrarHandlersAgent(): void {
  dglog('[ipc:agent] registrando handlers...');

  ipcMain.handle('agente:executar', handleAgenteExecutar);
  ipcMain.handle('agente:modelo', handleAgenteModelo);
  ipcMain.handle('agente:historico', handleAgenteHistorico);

  dglog('[ipc:agent] handlers registrados com sucesso');
}
