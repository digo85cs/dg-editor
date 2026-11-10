/**
 * Handlers IPC para configuracao e observacao de provedores de IA (FASE 3).
 * Nunca devolve valor de chave: apenas booleanos e metadados.
 */
import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import type { IpcResult } from './types';
import {
  listarProviders,
  obterProvider,
  configParaProvider,
  type ProviderDescriptor,
} from '../brain/providers-registry';
import { chaveConfigurada, salvarChave } from '../brain/segredos-providers';
import {
  statusCotas,
  estaEsgotado,
  resetarProvider,
  definirPermitirPago,
  definirTetoDiarioUSD,
  permitirPagoAtivo,
  gastoHoje,
  precoConhecido,
} from '../brain/roteador-cota';
import { chamarProvider, type ProviderConfig, type Message } from '../brain/providers';

// ============================================================================
// TIPOS DE RESULTADO
// ============================================================================

interface ProviderListItem {
  id: string;
  label: string;
  tier: number;
  formato: string;
  baseUrl: string;
  ativo: boolean;
  chaveConfigurada: boolean;
  esgotadoAte: string | null;
  modelos: string[];
}

interface FilaItem {
  ordem: number;
  id: string;
  tier: number;
  modelo: string;
  disponivel: boolean;
}

// ============================================================================
// HANDLERS
// ============================================================================

async function handleProvidersListar(): Promise<IpcResult & { providers?: ProviderListItem[] }> {
  try {
    const cotas = statusCotas();
    const providers: ProviderListItem[] = listarProviders().map((p) => {
      const modelo = p.modelos[0]?.id || '';
      const cota = cotas.find((c) => c.providerId === p.id && c.modelo === modelo);
      const esgotado = cota && estaEsgotado(p.id, modelo);
      return {
        id: p.id,
        label: p.label,
        tier: p.tier,
        formato: p.formato,
        baseUrl: p.baseUrl,
        ativo: p.ativo,
        chaveConfigurada: p.id === 'ollama-local' || chaveConfigurada(p.id),
        esgotadoAte: esgotado ? cota!.esgotadoAte : null,
        modelos: p.modelos.map((m) => m.id),
      };
    });
    return { ok: true, providers };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

async function handleProvidersConfigurar(
  _event: Electron.IpcMainInvokeEvent,
  payload: unknown
): Promise<IpcResult> {
  try {
    const p = (payload || {}) as { id?: string; chave?: string; ativo?: boolean };
    if (!p.id || typeof p.id !== 'string') {
      return { ok: false, erro: 'id do provider nao informado' };
    }
    const desc = obterProvider(p.id);
    if (!desc) {
      return { ok: false, erro: 'provider nao encontrado: ' + p.id };
    }
    if (p.chave !== undefined) {
      const salvo = salvarChave(p.id, p.chave);
      if (!salvo.ok) {
        return { ok: false, erro: salvo.erro || 'falha ao salvar chave' };
      }
    }
    if (p.ativo !== undefined) {
      const atualizado: ProviderDescriptor = { ...desc, ativo: !!p.ativo };
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { registrarProvider } = require('../brain/providers-registry');
      registrarProvider(atualizado);
    }
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

async function handleProvidersTestar(
  _event: Electron.IpcMainInvokeEvent,
  payload: unknown
): Promise<IpcResult & { latenciaMs?: number }> {
  try {
    const p = (payload || {}) as { id?: string };
    if (!p.id || typeof p.id !== 'string') {
      return { ok: false, erro: 'id do provider nao informado' };
    }
    const desc = obterProvider(p.id);
    if (!desc) {
      return { ok: false, erro: 'provider nao encontrado: ' + p.id };
    }
    if (desc.id !== 'ollama-local' && !chaveConfigurada(desc.id)) {
      return { ok: false, erro: 'chave nao configurada para este provider' };
    }
    const cfg = configParaProvider(desc, desc.modelos[0]?.id);
    cfg.numPredict = 1;
    cfg.timeoutMs = Math.min(cfg.timeoutMs, 15_000);
    const t0 = Date.now();
    await chamarProvider(cfg, [{ role: 'user', content: 'ping' }] as Message[]);
    return { ok: true, latenciaMs: Date.now() - t0 };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    dglog(`[providers:testar] ${String((payload as { id?: string }).id)} erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

async function handleProvidersCotas(): Promise<IpcResult & { cotas: unknown[] }> {
  try {
    return { ok: true, cotas: statusCotas() };
  } catch (e: unknown) {
    return { ok: false, erro: String(e), cotas: [] };
  }
}

async function handleProvidersResetar(
  _event: Electron.IpcMainInvokeEvent,
  payload: unknown
): Promise<IpcResult> {
  try {
    const p = (payload || {}) as { id?: string };
    if (!p.id || typeof p.id !== 'string') {
      return { ok: false, erro: 'id do provider nao informado' };
    }
    resetarProvider(p.id);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

async function handleProvidersFila(): Promise<IpcResult & { fila?: FilaItem[] }> {
  try {
    const agora = new Date();
    const fila: FilaItem[] = listarProviders()
      .filter((p) => p.ativo)
      .sort((a, b) => a.ordem - b.ordem)
      .map((p) => {
        const modelo = p.modelos[0]?.id || '';
        const temChave = p.id === 'ollama-local' || chaveConfigurada(p.id);
        const disponivel = temChave && !estaEsgotado(p.id, modelo, agora);
        return { ordem: p.ordem, id: p.id, tier: p.tier, modelo, disponivel };
      });
    return { ok: true, fila };
  } catch (e: unknown) {
    return { ok: false, erro: String(e), fila: [] };
  }
}

async function handleProvidersPermitirPago(
  _event: Electron.IpcMainInvokeEvent,
  payload: unknown
): Promise<IpcResult> {
  try {
    const p = (payload || {}) as { v?: boolean };
    if (typeof p.v !== 'boolean') {
      return { ok: false, erro: 'campo v (boolean) nao informado' };
    }
    definirPermitirPago(p.v);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

async function handleProvidersGasto(): Promise<IpcResult & { usd: number; teto?: number; porProvider: Record<string, number>; naoRastreados: string[] }> {
  try {
    const g = gastoHoje();
    return { ok: true, usd: g.usd, teto: g.teto, porProvider: g.porProvider, naoRastreados: g.naoRastreados };
  } catch (e: unknown) {
    return { ok: false, erro: String(e), usd: 0, porProvider: {}, naoRastreados: [] };
  }
}

async function handleProvidersTetoDiario(
  _event: Electron.IpcMainInvokeEvent,
  payload: unknown
): Promise<IpcResult> {
  try {
    const p = (payload || {}) as { teto?: number };
    if (p.teto !== undefined && (typeof p.teto !== 'number' || p.teto < 0)) {
      return { ok: false, erro: 'teto deve ser um numero >= 0' };
    }
    definirTetoDiarioUSD(p.teto);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, erro: String(e) };
  }
}

// ============================================================================
// REGISTRO
// ============================================================================

export function registrarHandlersProviders(): void {
  dglog('[ipc:providers] registrando handlers...');

  ipcMain.handle('providers:listar', handleProvidersListar);
  ipcMain.handle('providers:configurar', handleProvidersConfigurar);
  ipcMain.handle('providers:testar', handleProvidersTestar);
  ipcMain.handle('providers:cotas', handleProvidersCotas);
  ipcMain.handle('providers:resetar', handleProvidersResetar);
  ipcMain.handle('providers:fila', handleProvidersFila);
  ipcMain.handle('providers:permitir-pago', handleProvidersPermitirPago);
  ipcMain.handle('providers:gasto', handleProvidersGasto);
  ipcMain.handle('providers:teto-diario', handleProvidersTetoDiario);

  dglog('[ipc:providers] handlers registrados!');
}
