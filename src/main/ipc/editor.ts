/**
 * Handlers IPC para editor
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE EDITOR
// ============================================================================

/**
 * Handler para completacao de codigo
 */
export async function handleEditorCompletar(
  _event: Electron.IpcMainInvokeEvent,
  prefixo: unknown,
  sufixo: unknown
): Promise<IpcResult & { ok: boolean; erro?: string; texto?: string }> {
  const pre = typeof prefixo === 'string' ? prefixo : '';
  const suf = typeof sufixo === 'string' ? sufixo : '';
  if (pre.trim().length < 2) return { ok: true, texto: '' };
  try {
    const { completarTrecho } = await import('../completar-tab');
    return { ok: true, texto: await completarTrecho(pre, suf) };
  } catch (e: unknown) {
    return { ok: false, texto: '', erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Remove cercas markdown ```lang ... ``` caso o modelo retorne formatado. */
export function extrairCodigoInline(bruto: string): string {
  const t = String(bruto || '').trim();
  if (!t) return '';
  const m = t.match(/^```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n```\s*$/);
  if (m) return m[1];
  const m2 = t.match(/```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n```/);
  if (m2) return m2[1];
  return t;
}

/**
 * Handler para edicao inline com IA (Ctrl+K no CodeMirror 6).
 */
export async function handleEditorEditarInline(
  _event: Electron.IpcMainInvokeEvent,
  payload: unknown
): Promise<IpcResult & { ok: boolean; codigo?: string; provider?: string; erro?: string }> {
  const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const instrucao = typeof p.instrucao === 'string' ? p.instrucao.trim().slice(0, 1200) : '';
  const selecao = typeof p.selecao === 'string' ? p.selecao.slice(0, 16_000) : '';
  const antes = typeof p.antes === 'string' ? p.antes.slice(-2400) : '';
  const depois = typeof p.depois === 'string' ? p.depois.slice(0, 1200) : '';
  const caminho = typeof p.caminho === 'string' ? p.caminho.slice(0, 300) : '';

  if (!instrucao) return { ok: false, erro: 'Informe o que alterar neste trecho.' };

  if (process.env.DG_FAKE_LLM === '1') {
    const base = selecao || '// linha atual';
    return {
      ok: true,
      codigo: base + '\n// [inline] ' + instrucao,
      provider: 'fake-inline'
    };
  }

  try {
    const { chamarComCascata } = await import('../brain/chamar-com-cascata');
    const system =
      'Voce e um editor inline de codigo no DG Editor. ' +
      'Retorne APENAS o codigo final que substitui o trecho selecionado, preservando indentacao e estilo. ' +
      'NAO explique, NAO inclua comentarios fora do pedido e NAO envolva em cercas markdown.';
    const user =
      (caminho ? `Arquivo: ${caminho}\n` : '') +
      (antes ? `--- CONTEXTO ANTES ---\n${antes}\n` : '') +
      `--- TRECHO SELECIONADO ---\n${selecao}\n` +
      (depois ? `--- CONTEXTO DEPOIS ---\n${depois}\n` : '') +
      `--- INSTRUCAO ---\n${instrucao}\n\nRetorne apenas o novo trecho:`;

    const r = await chamarComCascata(
      'codigo',
      [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      undefined
    );
    const codigo = extrairCodigoInline(r.content || '');
    if (!codigo) return { ok: false, erro: 'O modelo retornou resposta vazia.' };
    return { ok: true, codigo, provider: r.providerFinal };
  } catch (e: unknown) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de editor
 */
export function registrarHandlersEditor(): void {
  dglog('[ipc:editor] registrando handlers...');

  ipcMain.handle('editor:completar', handleEditorCompletar);
  ipcMain.handle('editor:editar-inline', handleEditorEditarInline);

  dglog('[ipc:editor] handlers registrados!');
}
