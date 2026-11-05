/**
 * Handlers IPC para operacoes hibrido
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import { caminhoSeguro, exigirString, isErroPayload } from '../ipc-seguro';
import type { BriefingHibrido } from '../brain/hibrido';
import type { RespostaAgente } from '../brain/agent';

// ============================================================================
// HANDLERS DE HIBRIDO
// ============================================================================

/**
 * Handler para analisar com hibrido
 */
export async function handleHibridoAnalisar(
  _event: Electron.IpcMainInvokeEvent,
  root: string,
  pedido: string,
  pastaAberta: string
): Promise<BriefingHibrido | { ok: false; erro: string }> {
  try {
    const { prepararBriefing } = await import('../brain/hibrido');
    return prepararBriefing(root || process.cwd(), pedido || 'status do workspace', pastaAberta);
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para executar hibrido
 */
export async function handleHibridoExecutar(
  _event: Electron.IpcMainInvokeEvent,
  root: string,
  pedido: string,
  opcoes: unknown
): Promise<(RespostaAgente & { briefing: BriefingHibrido }) | { ok: false; texto: string; modelo: string; passos: unknown[]; briefing: null }> {
  try {
    const opts = opcoes as Record<string, unknown>;
    const { executarHibrido } = await import('../brain/hibrido');
    return await executarHibrido(root, pedido, {
      force: opts?.force === true,
      modeloForcado: typeof opts?.modeloForcado === 'string' ? opts.modeloForcado : undefined,
      pastaAberta: typeof opts?.pastaAberta === 'string' ? opts.pastaAberta : undefined
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    dglog('[hibrido:executar] falhou: ' + msg);
    return { ok: false, texto: msg, modelo: '', passos: [], briefing: null };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de hibrido
 */
export function registrarHandlersHibrido(): void {
  dglog('[ipc:hibrido] registrando handlers...');

  ipcMain.handle('hibrido:analisar', handleHibridoAnalisar);
  ipcMain.handle('hibrido:executar', handleHibridoExecutar);

  dglog('[ipc:hibrido] handlers registrados!');
}
