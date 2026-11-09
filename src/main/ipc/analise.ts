/**
 * Handlers IPC para operacoes de analise
 * Extraido de src/main/index.ts
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import { runAnalysis, getCachedAnalysis, invalidarCacheAnalise } from '../analyzer';
import { whereIs, formatWhereIs } from '../whereis';
import { ensureOllama } from '../ollama-keeper';
import { readRules, rulesExist, createRulesTemplate, writeRules } from '../dgrules';
import { caminhoSeguro, exigirString, exigirBoolean, isErroPayload } from '../ipc-seguro';
import { dglog } from '../dglog';
import type { EscopoAnalise } from '@shared/types';
import type { IpcResult } from './types';

// ============================================================================
// ESTADO
// ============================================================================

let mainWindow: BrowserWindow | null = null;

export function setAnaliseMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

// ============================================================================
// HANDLERS DE ANALIS
// ============================================================================

/**
 * Handler para executar analise
 */
export async function handleAnaliseRun(
  _event: Electron.IpcMainInvokeEvent,
  root: unknown,
  forceOrOptions: unknown,
  options?: unknown
): Promise<IpcResult & { result?: unknown; erro?: string }> {
  const r = exigirString(root, 'root');
  if (isErroPayload(r)) return { ok: false, erro: r.erro };

  const optionsValue = options && typeof options === 'object'
    ? options
    : forceOrOptions && typeof forceOrOptions === 'object'
      ? forceOrOptions
      : null;

  const forceValue = typeof forceOrOptions === 'boolean' ? forceOrOptions : undefined;
  const f = exigirBoolean(forceValue, 'force', false);
  if (isErroPayload(f)) return { ok: false, erro: f.erro };

  let escopoValue: unknown;
  if (optionsValue && 'escopo' in (optionsValue as object)) {
    escopoValue = (optionsValue as Record<string, unknown>).escopo;
  }

  const escopo: EscopoAnalise = escopoValue === 'completa' ? 'completa' : 'rapida';

  const seg = caminhoSeguro(r, r);
  if (!seg.ok) return { ok: false, erro: seg.erro };

  dglog('[analysis] handler acionado escopo=' + escopo);

  try {
    await ensureOllama();
    const result = await runAnalysis(seg.abs, escopo, f);
    return { ok: true, result };
  } catch (e) {
    const mensagem = String(e instanceof Error ? e.message : e);
    if (/timeout|abort/i.test(mensagem)) {
      dglog('[analysis] timeout retornado ao renderer');
      return { ok: false, erro: 'A análise demorou demais (timeout). Verifique se o Ollama/modelo está respondendo e tente novamente.' };
    }
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|ollama|LLM/i.test(mensagem)) {
      dglog('[analysis] dependencia LLM/Ollama: ' + mensagem);
      return { ok: false, erro: 'Não foi possível falar com a IA (Ollama/LLM). Confirme que o Ollama está ativo e com modelo instalado, ou configure LLM_API_KEY.' };
    }
    dglog(`[analysis] erro: ${mensagem}`);
    return { ok: false, erro: mensagem };
  }
}

/**
 * Handler para escolher escopo de analise (dialog)
 */
export async function handleAnaliseChooseScope(
  _event: Electron.IpcMainInvokeEvent,
  mode: unknown
): Promise<IpcResult & { response?: number; erro?: string }> {
  if (mode !== 'choose-scope' && mode !== 'confirm-complete') {
    return { ok: false, erro: 'modo de escolha de analise invalido' };
  }

  const options = mode === 'choose-scope'
    ? {
        type: 'question' as const,
        title: 'Escopo da analise',
        message: 'Escolha o tipo de analise:',
        detail: 'Analise rapida = apenas arquivos-chave (rapida)\nAnalise completa = projeto inteiro (pode demorar)',
        buttons: ['Analise rapida', 'Analise completa', 'Cancelar'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      }
    : {
        type: 'warning' as const,
        title: 'Analise completa',
        message: 'Analisar o projeto inteiro pode levar varios minutos. Continuar?',
        buttons: ['Continuar', 'Cancelar'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      };

  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;

  try {
    const result = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options);

    dglog('[analysis] dialog mode=' + mode + ' response=' + result.response);
    return { ok: true, response: result.response };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    dglog(`[analysis:choose-scope] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para analise cached
 */
export async function handleAnaliseCached(
  _event: Electron.IpcMainInvokeEvent,
  root: unknown
): Promise<IpcResult & { result?: unknown; erro?: string }> {
  const r = exigirString(root, 'root');
  if (isErroPayload(r)) return { ok: false, erro: r.erro };

  const seg = caminhoSeguro(r, r);
  if (!seg.ok) return { ok: false, erro: seg.erro };

  try {
    const cached = getCachedAnalysis(seg.abs);
    return { ok: true, result: cached };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    dglog(`[analysis:cached] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para whereis
 */
export async function handleWhereisAsk(
  _event: Electron.IpcMainInvokeEvent,
  root: unknown,
  query: unknown
): Promise<IpcResult & { result?: unknown; formatted?: string; erro?: string }> {
  const r = exigirString(root, 'root');
  if (isErroPayload(r)) return { ok: false, erro: r.erro };

  const q = exigirString(query, 'query');
  if (isErroPayload(q)) return { ok: false, erro: q.erro };

  const seg = caminhoSeguro(r, r);
  if (!seg.ok) return { ok: false, erro: seg.erro };

  try {
    const result = whereIs(seg.abs, q);
    return { ok: true, result, formatted: formatWhereIs(result) };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    dglog(`[whereis:ask] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para invalidar cache de analise
 */
export async function handleAnaliseInvalidar(
  _event: Electron.IpcMainInvokeEvent,
  root: unknown
): Promise<IpcResult> {
  const r = exigirString(root, 'root');
  if (isErroPayload(r)) return { ok: false, erro: r.erro };

  const seg = caminhoSeguro(r, r);
  if (!seg.ok) return { ok: false, erro: seg.erro };

  invalidarCacheAnalise(seg.abs);
  return { ok: true };
}

// ============================================================================
// HANDLERS DE REGRAS
// ============================================================================

/**
 * Handler para verificar se regras existam
 */
export async function handleRegrasExists(
  _event: Electron.IpcMainInvokeEvent,
  root: unknown
): Promise<IpcResult & { existe?: boolean; erro?: string }> {
  const r = exigirString(root, 'root');
  if (isErroPayload(r)) return { ok: false, erro: r.erro };

  const seg = caminhoSeguro(r, r);
  if (!seg.ok) return { ok: false, erro: seg.erro };

  try {
    const existe = rulesExist(seg.abs);
    return { ok: true, existe };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    dglog(`[rules:exists] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para ler regras
 */
export async function handleRegrasRead(
  _event: Electron.IpcMainInvokeEvent,
  root: unknown
): Promise<IpcResult & { texto?: string; erro?: string }> {
  const r = exigirString(root, 'root');
  if (isErroPayload(r)) return { ok: false, erro: r.erro };

  const seg = caminhoSeguro(r, r);
  if (!seg.ok) return { ok: false, erro: seg.erro };

  try {
    const texto = readRules(seg.abs);
    return { ok: true, texto };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    dglog(`[rules:read] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para criar template de regras
 */
export async function handleRegrasCreateTemplate(
  _event: Electron.IpcMainInvokeEvent,
  root: unknown
): Promise<IpcResult> {
  const r = exigirString(root, 'root');
  if (isErroPayload(r)) return { ok: false, erro: r.erro };

  const seg = caminhoSeguro(r, r);
  if (!seg.ok) return { ok: false, erro: seg.erro };

  try {
    const resultado = createRulesTemplate(seg.abs);
    return { ok: resultado };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    dglog(`[rules:create-template] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para escrever regras
 */
export async function handleRegrasWrite(
  _event: Electron.IpcMainInvokeEvent,
  root: unknown,
  texto: unknown
): Promise<IpcResult> {
  const r = exigirString(root, 'root');
  if (isErroPayload(r)) return { ok: false, erro: r.erro };

  if (typeof texto !== 'string') {
    return { ok: false, erro: 'texto invalido' };
  }

  const seg = caminhoSeguro(r, r);
  if (!seg.ok) return { ok: false, erro: seg.erro };

  try {
    const resultado = writeRules(seg.abs, texto);
    return { ok: resultado.ok, erro: resultado.erro };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    dglog(`[rules:write] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de analise
 */
export function registrarHandlersAnalise(): void {
  dglog('[ipc:analise] registrando handlers...');

  ipcMain.handle('analysis:run', handleAnaliseRun);
  ipcMain.handle('analysis:choose-scope', handleAnaliseChooseScope);
  ipcMain.handle('analysis:cached', handleAnaliseCached);
  ipcMain.handle('analysis:invalidar', handleAnaliseInvalidar);

  ipcMain.handle('whereis:ask', handleWhereisAsk);

  ipcMain.handle('rules:exists', handleRegrasExists);
  ipcMain.handle('rules:read', handleRegrasRead);
  ipcMain.handle('rules:create-template', handleRegrasCreateTemplate);
  ipcMain.handle('rules:write', handleRegrasWrite);

  dglog('[ipc:analise] handlers registrados com sucesso');
}
