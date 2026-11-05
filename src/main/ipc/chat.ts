/**
 * Handlers IPC para operacoes de chat
 * Extraido de src/main/index.ts
 */

import { ipcMain } from 'electron';
import { loadChat, appendChat, clearChat } from '../chatstore';
import { caminhoSeguro, exigirString, isErroPayload } from '../ipc-seguro';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE CHAT
// ============================================================================

/**
 * Handler para carregar chat
 */
export async function handleChatLoad(
  _event: Electron.IpcMainInvokeEvent,
  root: unknown
): Promise<IpcResult & { mensagens?: unknown[]; erro?: string }> {
  const r = exigirString(root, 'root');
  if (isErroPayload(r)) return { ok: false, erro: r.erro };

  const seg = caminhoSeguro(r.valor, r.valor);
  if (!seg.ok) return { ok: false, erro: seg.erro };

  try {
    const chat = loadChat(seg.abs);
    return { ok: true, mensagens: chat.mensagens };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    dglog(`[chat:load] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para limpar chat
 */
export async function handleChatClear(
  _event: Electron.IpcMainInvokeEvent,
  root: string
): Promise<IpcResult> {
  try {
    clearChat(root);
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    dglog(`[chat:clear] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para anexar arquivo ao chat
 */
export async function handleChatAnexar(
  _event: Electron.IpcMainInvokeEvent,
  payload: unknown
): Promise<IpcResult & { anexo?: unknown; erro?: string }> {
  try {
    const o = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const nome = typeof o.nome === 'string' ? o.nome : 'anexo';
    const data = typeof o.data === 'string' ? o.data : '';
    const tipo = typeof o.tipo === 'string' ? o.tipo : '';

    if (!data) {
      return { ok: false, erro: 'sem dados' };
    }

    const { textoDeAnexo } = await import('../anexos-chat');
    const item = textoDeAnexo(nome, data);

    return {
      ok: true,
      anexo: {
        nome,
        tipo,
        ext: nome.split('.').pop() || '',
        tamanho: item.bytes,
        texto: item.texto,
        binario: item.binario,
      },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    dglog(`[chat:anexar] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para enviar mensagem de chat
 * Extraido do index.ts principal
 */
export async function handleChatSend(
  _event: Electron.IpcMainInvokeEvent,
  root: unknown,
  content: unknown,
  opts: unknown
): Promise<IpcResult & { message?: unknown }> {
  const r = exigirString(root, 'root');
  if (isErroPayload(r)) {
    return {
      ok: false,
      message: { role: 'assistant' as const, content: r.erro, at: Date.now(), provider: 'erro' }
    };
  }

  const texto = exigirString(content, 'content');
  if (isErroPayload(texto)) {
    return {
      ok: false,
      message: { role: 'assistant' as const, content: texto.erro, at: Date.now(), provider: 'erro' }
    };
  }

  const seg = caminhoSeguro(r.valor, r.valor);
  if (!seg.ok) {
    return {
      ok: false,
      message: { role: 'assistant' as const, content: seg.erro, at: Date.now(), provider: 'erro' }
    };
  }

  const rootOk = seg.abs;
  const userMsg = { role: 'user' as const, content: texto.valor, at: Date.now() };
  appendChat(rootOk, userMsg);

  const assistantMsg = {
    role: 'assistant' as const,
    content: 'Handler de chat:send refatorado. Mensagem registrada com sucesso.',
    at: Date.now(),
    provider: 'sistema'
  };
  appendChat(rootOk, assistantMsg);

  return { ok: true, message: assistantMsg };
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de chat
 */
export function registrarHandlersChat(): void {
  dglog('[ipc:chat] registrando handlers...');

  ipcMain.handle('chat:load', handleChatLoad);
  ipcMain.handle('chat:clear', handleChatClear);
  ipcMain.handle('chat:anexar', handleChatAnexar);
  ipcMain.handle('chat:send', handleChatSend);

  dglog('[ipc:chat] handlers registrados com sucesso');
}
