/**
 * Handlers IPC para modelos
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import { caminhoSeguro, exigirString, isErroPayload } from '../ipc-seguro';
import { listarModelosOllama, pullEmAndamento, estadoPull, pullModelo } from '../ollama-keeper';
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
): Promise<IpcResult & { ok: boolean; erro?: string; modelo?: string | null; motivo?: string }> {
  const t = exigirString(tarefa, 'tarefa');
  if (isErroPayload(t)) return t;
  try {
    const { resolverRaizProjeto } = await import('../paths');
    const { modeloParaTarefaComMotivo } = await import('../brain/modelos-catalogo');
    const r = modeloParaTarefaComMotivo(resolverRaizProjeto(), t);
    return { ok: true, modelo: r.modelo, motivo: r.motivo };
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

/**
 * Handler para baixar um modelo Ollama com progresso incremental.
 * Retorna imediatamente e emite `ollama:pull-progresso` no webContents chamador.
 */
export async function handleOllamaPull(
  event: Electron.IpcMainInvokeEvent,
  modelo: unknown
): Promise<IpcResult & { iniciado?: boolean; modelo?: string; modelos?: string[] }> {
  const m = exigirString(modelo, 'modelo');
  if (isErroPayload(m)) return m;
  if (!/^[a-zA-Z0-9._:/-]+$/.test(m)) return { ok: false, erro: 'Nome de modelo inválido.' };
  const emCurso = pullEmAndamento();
  if (emCurso) return { ok: false, erro: 'Já existe um download em andamento: ' + emCurso };
  const enviar = (p: unknown) => {
    try { event.sender.send('ollama:pull-progresso', p); } catch { /* janela fechou */ }
  };
  void pullModelo(m, enviar).then(async (r) => {
    const modelos = await listarModelosOllama().catch(() => []);
    enviar({ modelo: m, fase: r.ok ? 'sucesso' : 'erro', percentual: r.ok ? 100 : null, status: r.ok ? 'concluído' : (r.erro || 'falhou'), erro: r.erro, modelos });
  });
  return { ok: true, iniciado: true, modelo: m };
}

/** Status de downloads e modelos locais (para refrescar a UI ao abrir). */
export async function handleOllamaPullStatus(): Promise<IpcResult & { modelo: string | null; estado: unknown; modelos: string[] }> {
  try {
    const modelos = await listarModelosOllama();
    return { ok: true, modelo: pullEmAndamento(), estado: estadoPull(), modelos };
  } catch (e: unknown) {
    return { ok: false, modelo: null, estado: null, modelos: [], erro: String(e) };
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
  ipcMain.handle('ollama:pull', handleOllamaPull);
  ipcMain.handle('ollama:pull-status', handleOllamaPullStatus);

  dglog('[ipc:modelos] handlers registrados!');
}
