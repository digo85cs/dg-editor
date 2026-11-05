/**
 * Handlers IPC para Adapta
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain, shell } from 'electron';
import { dglog } from '../dglog';
import { caminhoSeguro, exigirString, isErroPayload } from '../ipc-seguro';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE ADAPTA
// ============================================================================

/**
 * Handler para status do Adapta
 */
export async function handleAdaptaStatus(
  _event: Electron.IpcMainInvokeEvent,
  raiz: unknown
): Promise<IpcResult & { ok: boolean; erro?: string }> {
  try {
    let r = typeof raiz === 'string' && raiz.trim() ? raiz.trim() : '';
    if (!r) {
      const { resolverRaizProjeto } = await import('../paths');
      r = resolverRaizProjeto();
    }
    const { statusAdapta } = await import('../bridge-adapta');
    return statusAdapta(r);
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para gerar continuidade
 */
export function handleAdaptaGerar(
  _event: Electron.IpcMainInvokeEvent
): IpcResult & { ok: boolean; erro?: string } {
  try {
    const { dossieDirDoApp, gerarContinuidade } = require('../bridge-adapta');
    return gerarContinuidade(dossieDirDoApp());
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para ler continuidade
 */
export function handleAdaptaLerContinuidade(
  _event: Electron.IpcMainInvokeEvent,
  regenerar: unknown
): IpcResult & { ok: boolean; erro?: string } {
  try {
    const { dossieDirDoApp, gerarContinuidade, lerContinuidade } = require('../bridge-adapta');
    if (regenerar === true) {
      const g = gerarContinuidade(dossieDirDoApp());
      if (!g.ok) return { ok: false, erro: g.erro };
    }
    return lerContinuidade();
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

/**
 * Handler para abrir URL do Adapta
 */
export async function handleAdaptaAbrir(
  _event: Electron.IpcMainInvokeEvent,
  alvo: unknown
): Promise<IpcResult & { ok: boolean; erro?: string; url?: string }> {
  let url = '';
  if (alvo === 'one') url = 'https://one.ai';
  else if (alvo === 'hub') url = 'https://hub.one.ai';
  else if (alvo === 'maestro') url = 'https://maestro.one.ai';
  else if (alvo === 'docs') url = 'https://docs.one.ai';
  else if (typeof alvo === 'string') url = alvo;
  else return { ok: false, erro: 'url nao permitida' };

  try {
    const { urlAdaptaPermitida, ADAPTA_URLS } = await import('../bridge-adapta');
    if (url === 'https://one.ai') url = ADAPTA_URLS.one;
    else if (url === 'https://hub.one.ai') url = ADAPTA_URLS.hub;
    else if (url === 'https://maestro.one.ai') url = ADAPTA_URLS.maestro;
    else if (url === 'https://docs.one.ai') url = ADAPTA_URLS.docs;

    if (!urlAdaptaPermitida(url)) {
      return { ok: false, erro: 'url nao permitida' };
    }
    await shell.openExternal(url);
    return { ok: true, url };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de Adapta
 */
export function registrarHandlersAdapta(): void {
  dglog('[ipc:adapta] registrando handlers...');

  ipcMain.handle('adapta:status', handleAdaptaStatus);
  ipcMain.handle('adapta:gerar', handleAdaptaGerar);
  ipcMain.handle('adapta:ler-continuidade', handleAdaptaLerContinuidade);
  ipcMain.handle('adapta:abrir', handleAdaptaAbrir);

  dglog('[ipc:adapta] handlers registrados!');
}
