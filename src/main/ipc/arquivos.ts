/**
 * Handlers IPC para operacoes de arquivo
 * Extraido de src/main/index.ts
 */

import { ipcMain } from 'electron';
import {
  lerArquivo,
  lerArquivoBase64,
  salvarArquivo,
  listarDiretorio,
  arquivoExiste,
} from '../arquivos';
import { caminhoSeguro, isErroPayload, exigirString, exigirArrayStrings } from '../ipc-seguro';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE ARQUIVO
// ============================================================================

/**
 * Handler para ler arquivo
 */
export async function handleArquivoLer(
  _event: Electron.IpcMainInvokeEvent,
  caminho: unknown,
  pastas: unknown
): Promise<IpcResult & { conteudo?: string; erro?: string }> {
  const c = exigirString(caminho, 'caminho');
  if (isErroPayload(c)) return { ok: false, erro: c.erro };

  const p = exigirArrayStrings(pastas, 'pastas');
  if (isErroPayload(p)) return { ok: false, erro: p.erro };

  const seg = caminhoSeguro(c, p);
  if (!seg.ok) return { ok: false, erro: seg.erro };

  try {
    const result = await lerArquivo(seg.abs, p);
    if (result.ok) return { ok: true, conteudo: result.conteudo };
    return { ok: false, erro: result.erro || 'Erro ao ler arquivo' };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    dglog(`[arquivo:ler] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para ler arquivo em base64
 */
export async function handleArquivoLerBase64(
  _event: Electron.IpcMainInvokeEvent,
  caminho: unknown,
  pastas: unknown
): Promise<IpcResult & { dataUrl?: string; mime?: string; erro?: string }> {
  const c = exigirString(caminho, 'caminho');
  if (isErroPayload(c)) return { ok: false, erro: c.erro };

  const p = exigirArrayStrings(pastas, 'pastas');
  if (isErroPayload(p)) return { ok: false, erro: p.erro };

  const seg = caminhoSeguro(c, p);
  if (!seg.ok) return { ok: false, erro: seg.erro };

  try {
    const result = await lerArquivoBase64(seg.abs, p);
    if (result.ok) return { ok: true, dataUrl: result.dataUrl, mime: result.mime };
    return { ok: false, erro: result.erro || 'Erro ao ler arquivo' };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    dglog(`[arquivo:ler-base64] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para salvar arquivo
 */
export async function handleArquivoSalvar(
  _event: Electron.IpcMainInvokeEvent,
  caminho: unknown,
  conteudo: unknown,
  pastas: unknown
): Promise<IpcResult & { erro?: string }> {
  const c = exigirString(caminho, 'caminho');
  if (isErroPayload(c)) return { ok: false, erro: c.erro };

  const body = exigirString(conteudo, 'conteudo');
  if (isErroPayload(body)) return { ok: false, erro: body.erro };

  const p = exigirArrayStrings(pastas, 'pastas');
  if (isErroPayload(p)) return { ok: false, erro: p.erro };

  const seg = caminhoSeguro(c, p);
  if (!seg.ok) return { ok: false, erro: seg.erro };

  try {
    const result = await salvarArquivo(seg.abs, body, p);
    if (result.ok) {
      return { ok: true };
    }
    return { ok: false, erro: result.erro || 'Erro ao salvar arquivo' };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    dglog(`[arquivo:salvar] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para listar diretorio
 */
export async function handleArquivoListar(
  _event: Electron.IpcMainInvokeEvent,
  dir: unknown,
  pastas: unknown
): Promise<IpcResult & { entradas?: unknown; erro?: string }> {
  const d = exigirString(dir, 'dir');
  if (isErroPayload(d)) return { ok: false, erro: d.erro };

  const p = exigirArrayStrings(pastas, 'pastas');
  if (isErroPayload(p)) return { ok: false, erro: p.erro };

  const seg = caminhoSeguro(d, p);
  if (!seg.ok) return { ok: false, erro: seg.erro };

  try {
    const result = await listarDiretorio(seg.abs, p);
    if (result.ok) {
      return { ok: true, entradas: result.entradas };
    }
    return { ok: false, erro: result.erro || 'Erro ao listar diretorio' };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    dglog(`[arquivo:listar] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para verificar se arquivo existe
 */
export async function handleArquivoExiste(
  _event: Electron.IpcMainInvokeEvent,
  caminho: unknown,
  pastas: unknown
): Promise<IpcResult & { existe?: boolean; erro?: string }> {
  const c = exigirString(caminho, 'caminho');
  if (isErroPayload(c)) return { ok: false, erro: c.erro };

  const p = exigirArrayStrings(pastas, 'pastas');
  if (isErroPayload(p)) return { ok: false, erro: p.erro };

  const seg = caminhoSeguro(c, p);
  if (!seg.ok) return { ok: false, erro: seg.erro };

  try {
    const result = await arquivoExiste(seg.abs, p);
    return { ok: true, existe: result.existe };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    dglog(`[arquivo:existe] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de arquivo
 */
export function registrarHandlersArquivo(): void {
  dglog('[ipc:arquivos] registrando handlers...');

  ipcMain.handle('arquivo:ler', handleArquivoLer);
  ipcMain.handle('arquivo:ler-base64', handleArquivoLerBase64);
  ipcMain.handle('arquivo:salvar', handleArquivoSalvar);
  ipcMain.handle('arquivo:listar', handleArquivoListar);
  ipcMain.handle('arquivo:existe', handleArquivoExiste);

  dglog('[ipc:arquivos] handlers registrados com sucesso');
}
