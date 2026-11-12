/**
 * Handlers IPC para operacoes de analise
 * Extraido de src/main/index.ts
 */

import { ipcMain, BrowserWindow } from 'electron';
import { perguntarDialogo } from '../ui-dialog';
import { runAnalysis, getCachedAnalysis, invalidarCacheAnalise } from '../analyzer';
import { whereIs, formatWhereIs } from '../whereis';
import { checkOllama } from '../ollama-keeper';
import { readRules, rulesExist, createRulesTemplate, writeRules } from '../dgrules';
import { caminhoSeguro, exigirString, exigirBoolean, isErroPayload } from '../ipc-seguro';
import { dglog } from '../dglog';
import type { EscopoAnalise } from '@shared/types';
import { CodigoErro, criarErro, type ErroApp } from '@shared/erros';
import type { IpcResult } from './types';
import { normalizarRelatorio } from '@shared/schemas/relatorio';

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

function falha(codigo: CodigoErro, mensagem: string, acao?: string, detalhe?: string): { ok: false; erro: ErroApp; erroTexto: string } {
  const erro = criarErro(codigo, mensagem, acao, detalhe);
  return { ok: false, erro, erroTexto: erro.mensagem };
}

function mapearErroAnalise(e: unknown): { ok: false; erro: ErroApp; erroTexto: string } {
  const mensagem = String(e instanceof Error ? e.message : e);
  if (/timeout|abort/i.test(mensagem)) {
    dglog('[analysis] timeout retornado ao renderer');
    return falha(CodigoErro.ERR_LLM_TIMEOUT, 'A análise demorou demais.', 'Verifique se o Ollama/modelo está respondendo e tente novamente.', mensagem);
  }
  if (/modelo respondeu vazio/i.test(mensagem)) {
    return falha(CodigoErro.ERR_LLM_EMPTY_RESPONSE, 'A IA respondeu sem conteúdo útil.', 'Tente a análise rápida ou verifique o modelo ativo.', mensagem);
  }
  if (/resposta incompleta|report descartado|sem campos/i.test(mensagem)) {
    return falha(CodigoErro.ERR_ANALYSIS_EMPTY, 'A análise não retornou dados suficientes para exibir.', 'Tente novamente com análise rápida.', mensagem);
  }
  if (/parse|json|invalido/i.test(mensagem) && !/modelo/i.test(mensagem)) {
    return falha(CodigoErro.ERR_ANALYSIS_PARSE, 'Não foi possível interpretar a resposta da análise.', 'Tente novamente.', mensagem);
  }
  if (/model|modelo/i.test(mensagem) && /not found|missing|nao instalado|não instalado|pull/i.test(mensagem)) {
    return falha(CodigoErro.ERR_OLLAMA_MODEL_MISSING, 'O modelo de IA necessário não está instalado.', 'Instale o modelo no Ollama (ex.: ollama pull llama3.2).', mensagem);
  }
  dglog(`[analysis] erro: ${mensagem}`);
  return falha(CodigoErro.ERR_UNKNOWN, 'Não foi possível concluir a análise.', 'Tente novamente. Se persistir, confira o diagnóstico.', mensagem);
}

/**
 * Handler para executar analise
 */
export async function handleAnaliseRun(
  _event: Electron.IpcMainInvokeEvent,
  root: unknown,
  forceOrOptions: unknown,
  options?: unknown
): Promise<IpcResult & { result?: unknown }> {
  const r = exigirString(root, 'root');
  if (isErroPayload(r)) return falha(CodigoErro.ERR_UNKNOWN, r.erro, undefined, r.erro);

  const optionsValue = options && typeof options === 'object'
    ? options
    : forceOrOptions && typeof forceOrOptions === 'object'
      ? forceOrOptions
      : null;

  const forceValue = typeof forceOrOptions === 'boolean' ? forceOrOptions : undefined;
  const f = exigirBoolean(forceValue, 'force', false);
  if (isErroPayload(f)) return falha(CodigoErro.ERR_UNKNOWN, f.erro, undefined, f.erro);

  let escopoValue: unknown;
  if (optionsValue && 'escopo' in (optionsValue as object)) {
    escopoValue = (optionsValue as Record<string, unknown>).escopo;
  }

  const escopo: EscopoAnalise = escopoValue === 'completa' ? 'completa' : 'rapida';

  const seg = caminhoSeguro(r, r);
  if (!seg.ok) return falha(CodigoErro.ERR_UNKNOWN, seg.erro, undefined, seg.erro);

  dglog('[analysis] handler acionado escopo=' + escopo);

  try {
    const { ensureOllama } = await import('../ollama-keeper');
    const ollama = await ensureOllama().then(async (ativo) => {
      if (ativo) return { ativo: true, instalado: true };
      return checkOllama();
    });
    if (!ollama.ativo) {
      const temKey = !!(process.env.LLM_API_KEY || process.env.OPENAI_API_KEY);
      if (!temKey) {
        return falha(CodigoErro.ERR_OLLAMA_OFFLINE, 'O Ollama não está ativo.', 'Inicie "ollama serve" ou clique em Iniciar Ollama.');
      }
    }
    try {
      const { detectarModelosLocais } = await import('../brain/modelos-catalogo');
      await detectarModelosLocais(seg.abs);
    } catch { /* segue com catálogo atual */ }
    let result;
    try {
      result = await runAnalysis(seg.abs, escopo, f);
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      if (!/timeout|abort/i.test(msg)) throw e;
      dglog('[analysis] timeout — retry com modelo leve 1.5b');
      const { askOllama } = await import('../brain/ollama');
      const retry = await askOllama(
        'Analise o sistema de forma breve em portugues do Brasil. Responda com: o que e, stack e estrutura.',
        'raiz=' + seg.abs,
        'analise',
        {},
        { model: 'qwen2.5-coder:1.5b', numPredict: 400, timeoutMs: 180_000 }
      );
      if (!retry?.text?.trim()) throw e;
      result = {
        fromCache: false,
        changedFiles: [] as string[],
        report: {
          oQueE: retry.text.slice(0, 2000),
          stack: '',
          estrutura: '',
          raw: retry.text,
          analyzedAt: Date.now(),
          provider: retry.provider,
          model: retry.model
        }
      };
    }
    const safe = { ...result, report: normalizarRelatorio((result as any)?.report) };
    if (!String((safe.report as any).oQueE || (safe.report as any).stack || (safe.report as any).estrutura || '').trim() && !String((safe.report as any).raw || '').trim()) {
      return falha(CodigoErro.ERR_ANALYSIS_SHAPE, 'A análise retornou formato inválido/vazio.', 'Tente novamente.', 'report sem campos');
    }
    return { ok: true, result: safe };
  } catch (e) {
    return mapearErroAnalise(e);
  }
}

/**
 * Handler para escolher escopo de analise (dialog)
 */
export async function handleAnaliseChooseScope(
  _event: Electron.IpcMainInvokeEvent,
  mode: unknown
): Promise<IpcResult & { response?: number }> {
  if (mode !== 'choose-scope' && mode !== 'confirm-complete') {
    return falha(CodigoErro.ERR_UNKNOWN, 'Modo de escolha de análise inválido.', undefined, String(mode));
  }

  const options =
    mode === 'choose-scope'
      ? {
          type: 'question' as const,
          title: 'Escopo da análise',
          message: 'Escolha o tipo de análise:',
          detail:
            'Análise rápida = apenas arquivos-chave (rápida)\nAnálise completa = projeto inteiro (pode demorar)',
          buttons: ['Análise rápida', 'Análise completa', 'Cancelar'],
          defaultId: 0,
          cancelId: 2
        }
      : {
          type: 'warning' as const,
          title: 'Análise completa',
          message: 'Analisar o projeto inteiro pode levar vários minutos. Continuar?',
          buttons: ['Continuar', 'Cancelar'],
          defaultId: 0,
          cancelId: 1
        };

  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;

  try {
    const response = await perguntarDialogo(parent, options);
    dglog('[analysis] dialog mode=' + mode + ' response=' + response);
    return { ok: true, response };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    dglog(`[analysis:choose-scope] erro: ${msg}`);
    return falha(CodigoErro.ERR_UNKNOWN, 'Não foi possível abrir a escolha de escopo.', 'Tente novamente.', msg);
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
