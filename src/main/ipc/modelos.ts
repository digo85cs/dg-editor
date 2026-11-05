/**
 * Handlers IPC para modelos
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import { caminhoSeguro, exigirString, isErroPayload } from '../ipc-seguro';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE MODELOS
// ============================================================================

/**
 * Handler para listar modelos
 */
export async function handleModelosListar(
  _event: Electron.IpcMainInvokeEvent
): Promise<IpcResult & { ok: boolean; erro?: string; catalogo?: unknown; problemas?: unknown }> {
  try {
    const { resolverRaizProjeto } = await import('../paths');
    const { lerCatalogo, detectarModelosLocais, validarCatalogo } = await import('../brain/modelos-catalogo');
    const raiz = resolverRaizProjeto();
    try {
      const catalogo = await detectarModelosLocais(raiz);
      const v = validarCatalogo(catalogo);
      return { ok: true, catalogo, problemas: v.problemas };
    } catch {
      const catalogo = lerCatalogo(raiz);
      const v = validarCatalogo(catalogo);
      return { ok: true, catalogo, problemas: v.problemas };
    }
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para recarregar modelos
 */
export async function handleModelosRecarregar(
  _event: Electron.IpcMainInvokeEvent
): Promise<IpcResult & { ok: boolean; erro?: string; catalogo?: unknown; problemas?: unknown }> {
  try {
    const { resolverRaizProjeto } = await import('../paths');
    const { detectarModelosLocais, healthCheckModelos, validarCatalogo } = await import('../brain/modelos-catalogo');
    const raiz = resolverRaizProjeto();
    await detectarModelosLocais(raiz);
    const cat = await healthCheckModelos(raiz);
    const v = validarCatalogo(cat);
    return { ok: true, catalogo: cat, problemas: v.problemas };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para modelo para tarefa
 */
export async function handleModelosParaTarefa(
  _event: Electron.IpcMainInvokeEvent,
  tarefa: unknown
): Promise<IpcResult & { ok: boolean; erro?: string; modelo?: string | null }> {
  const t = exigirString(tarefa, 'tarefa');
  if (isErroPayload(t)) return t;
  try {
    const { resolverRaizProjeto } = await import('../paths');
    const { modeloParaTarefa } = await import('../brain/modelos-catalogo');
    return { ok: true, modelo: modeloParaTarefa(resolverRaizProjeto(), t) };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para versoes remotas
 */
export async function handleModelosVersoesRemotas(
  _event: Electron.IpcMainInvokeEvent
): Promise<IpcResult & { ok: boolean; erro?: string; catalogo?: unknown; problemas?: unknown }> {
  try {
    const { resolverRaizProjeto } = await import('../paths');
    const { marcarVersoesRemotas, validarCatalogo } = await import('../brain/modelos-catalogo');
    const cat = await marcarVersoesRemotas(resolverRaizProjeto());
    const v = validarCatalogo(cat);
    return { ok: true, catalogo: cat, problemas: v.problemas };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de modelos
 */
export function registrarHandlersModelos(): void {
  dglog('[ipc:modelos] registrando handlers...');

  ipcMain.handle('modelos:listar', handleModelosListar);
  ipcMain.handle('modelos:recarregar', handleModelosRecarregar);
  ipcMain.handle('modelos:para-tarefa', handleModelosParaTarefa);
  ipcMain.handle('modelos:versoes-remotas', handleModelosVersoesRemotas);

  dglog('[ipc:modelos] handlers registrados!');
}
