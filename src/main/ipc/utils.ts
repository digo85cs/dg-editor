/**
 * Utilitarios para handlers IPC do DG Editor
 * Funcoes auxiliares para validacao, error handling e registro
 */

import { ipcMain } from 'electron';
import { dglog } from '../dglog';
import type {
  IpcResult,
  ArquivoLerPayload,
  ArquivoSalvarPayload,
  ArquivoListarPayload,
  ArquivoExistePayload,
} from './types';

// ============================================================================
// WRAPPER DE ERROR HANDLING
// ============================================================================

/**
 * Wrapper para handlers IPC que garante error handling padronizado
 * @param handler - Funcao handler original
 * @param channel - Nome do canal IPC (para logging)
 * @returns Handler wrapper com error handling
 */
export function safeIpcHandler<T extends unknown[], R>(
  handler: (...args: T) => Promise<R> | R,
  channel: string
): (...args: T) => Promise<IpcResult<R>> {
  return async (...args: T) => {
    try {
      const result = await Promise.resolve(handler(...args));
      // Se o resultado ja tem a estrutura IpcResult, retorna-lo como esta
      if (result && typeof result === 'object' && 'ok' in result) {
        return result as IpcResult<R>;
      }
      return { ok: true, dados: result } as IpcResult<R>;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      dglog(`[ipc:${channel}] erro: ${errorMessage}`);
      return { ok: false, erro: errorMessage } as IpcResult<R>;
    }
  };
}

/**
 * Wrapper para handlers IPC sincronos
 */
export function safeIpcHandlerSync<T extends unknown[], R>(
  handler: (...args: T) => R,
  channel: string
): (...args: T) => IpcResult<R> {
  return (...args: T) => {
    try {
      const result = handler(...args);
      if (result && typeof result === 'object' && 'ok' in result) {
        return result as IpcResult<R>;
      }
      return { ok: true, dados: result } as IpcResult<R>;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      dglog(`[ipc:${channel}] erro: ${errorMessage}`);
      return { ok: false, erro: errorMessage } as IpcResult<R>;
    }
  };
}

// ============================================================================
// FUNCOES DE VALIDACAO
// ============================================================================

/**
 * Valida e normaliza um payload de arquivo
 */
export function validarArquivoPayload(
  payload: unknown,
  channel: string
): IpcResult<ArquivoLerPayload> {
  if (!payload || typeof payload !== 'object') {
    dglog(`[ipc:${channel}] payload invalido: nao e objeto`);
    return { ok: false, erro: 'Payload invalido: esperado objeto' };
  }

  const p = payload as Record<string, unknown>;

  if (!('caminho' in p) || typeof p.caminho !== 'string' || p.caminho.trim() === '') {
    dglog(`[ipc:${channel}] caminho ausente ou invalido`);
    return { ok: false, erro: 'Caminho ausente ou invalido' };
  }

  const pastas = Array.isArray(p.pastas) ? p.pastas.filter((p): p is string => typeof p === 'string') : [];

  return {
    ok: true,
    dados: {
      caminho: p.caminho.trim(),
      pastas,
    },
  };
}

/**
 * Valida payload de string
 */
export function validarString(
  valor: unknown,
  campo: string,
  channel: string
): IpcResult<string> {
  if (typeof valor !== 'string' || valor.trim() === '') {
    dglog(`[ipc:${channel}] ${campo} invalido: ${String(valor)}`);
    return { ok: false, erro: `${campo} ausente ou invalido` };
  }
  return { ok: true, dados: valor.trim() };
}

/**
 * Valida payload de boolean
 */
export function validarBoolean(
  valor: unknown,
  campo: string,
  channel: string
): IpcResult<boolean> {
  if (typeof valor !== 'boolean') {
    dglog(`[ipc:${channel}] ${campo} invalido: ${String(valor)}`);
    return { ok: false, erro: `${campo} deve ser booleano` };
  }
  return { ok: true, dados: valor };
}

/**
 * Valida payload de numero
 */
export function validarNumber(
  valor: unknown,
  campo: string,
  channel: string
): IpcResult<number> {
  if (typeof valor !== 'number' || isNaN(valor)) {
    dglog(`[ipc:${channel}] ${campo} invalido: ${String(valor)}`);
    return { ok: false, erro: `${campo} deve ser numerico` };
  }
  return { ok: true, dados: valor };
}

/**
 * Valida payload de array de strings
 */
export function validarStringArray(
  valor: unknown,
  campo: string,
  channel: string
): IpcResult<string[]> {
  if (!Array.isArray(valor)) {
    dglog(`[ipc:${channel}] ${campo} invalido: nao e array`);
    return { ok: false, erro: `${campo} deve ser array` };
  }

  const validados = valor.filter((v): v is string => typeof v === 'string');
  if (validados.length !== valor.length) {
    dglog(`[ipc:${channel}] ${campo} contem valores nao-string`);
    return { ok: false, erro: `${campo} deve conter apenas strings` };
  }

  return { ok: true, dados: validados };
}

// ============================================================================
// FUNCOES DE REGISTRO DE HANDLERS
// ============================================================================

/**
 * Tipo para funcao de registro de handlers
 */
export type HandlerRegistry = {
  register: (channel: string, handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any) => void;
  registerSync: (channel: string, handler: (...args: unknown[]) => unknown) => void;
};

/**
 * Cria um registrador de handlers com logging
 */
export function criarRegistrador(): HandlerRegistry {
  const registeredChannels = new Set<string>();

  return {
    register: (channel: string, handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any) => {
      if (registeredChannels.has(channel)) {
        dglog(`[ipc:registry] AVISO: canal "${channel}" ja registrado`);
      }
      registeredChannels.add(channel);
      ipcMain.handle(channel, handler);
      dglog(`[ipc:registry] registrado: ${channel}`);
    },
    registerSync: (channel: string, handler: (...args: unknown[]) => unknown) => {
      if (registeredChannels.has(channel)) {
        dglog(`[ipc:registry] AVISO: canal "${channel}" ja registrado`);
      }
      registeredChannels.add(channel);
      ipcMain.handle(channel, handler);
      dglog(`[ipc:registry] registrado (sync): ${channel}`);
    },
  };
}

/**
 * Registrador global (singleton)
 */
let registradorGlobal: HandlerRegistry | null = null;

export function getRegistrador(): HandlerRegistry {
  if (!registradorGlobal) {
    registradorGlobal = criarRegistrador();
  }
  return registradorGlobal;
}

// ============================================================================
// FUNCOES DE VALIDACAO DE CAMINHOS
// ============================================================================

import { join, resolve, isAbsolute, relative } from 'path';
import { existsSync, statSync } from 'fs';

/**
 * Verifica se um caminho e seguro (relativo ou absoluto dentro da raiz)
 */
export function caminhoSeguro(
  caminho: string,
  raiz: string | string[]
): IpcResult<{ abs: string; relative: string }> {
  try {
    // Normalizar caminho
    let normalizado = caminho.replace(/\\/g, '/');
    
    // Se for path traversal, bloquear
    if (normalizado.includes('../') || normalizado.startsWith('..')) {
      return { ok: false, erro: 'Caminho invalido: path traversal detectado' };
    }

    // Resolver caminho absoluto
    const raizArray = Array.isArray(raiz) ? raiz : [raiz];
    const raizAbs = raizArray[0];
    
    // Se caminho ja e absoluto, verificar se esta dentro da raiz
    if (isAbsolute(caminho)) {
      const caminhoAbs = resolve(caminho);
      const raizAbsResolvida = resolve(raizAbs);
      
      // Verificar se caminho esta dentro da raiz
      const relativePath = relative(raizAbsResolvida, caminhoAbs);
      if (relativePath.startsWith('..')) {
        return { ok: false, erro: 'Caminho fora da raiz permitida' };
      }
      
      return {
        ok: true,
        dados: {
          abs: caminhoAbs,
          relative: relativePath,
        },
      };
    }

    // Se caminho e relativo, resolver a partir da raiz
    const caminhoAbs = resolve(raizAbs, caminho);
    const raizAbsResolvida = resolve(raizAbs);
    const relativePath = relative(raizAbsResolvida, caminhoAbs);

    if (relativePath.startsWith('..')) {
      return { ok: false, erro: 'Caminho resolve para fora da raiz permitida' };
    }

    return {
      ok: true,
      dados: {
        abs: caminhoAbs,
        relative: relativePath,
      },
    };
  } catch (error) {
    return {
      ok: false,
      erro: `Erro ao validar caminho: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Verifica se um arquivo existe e e acessivel
 */
export function arquivoAcessivel(caminho: string): IpcResult<{ existe: boolean; caminho: string }> {
  try {
    const existe = existsSync(caminho);
    if (!existe) {
      return { ok: true, dados: { existe: false, caminho } };
    }
    
    // Verificar se e arquivo (nao diretorio)
    const stats = statSync(caminho);
    if (!stats.isFile()) {
      return { ok: false, erro: 'Caminho nao e um arquivo' };
    }
    
    return { ok: true, dados: { existe: true, caminho } };
  } catch (error) {
    return {
      ok: false,
      erro: `Erro ao acessar arquivo: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// FUNCOES DE LOGGING
// ============================================================================

/**
 * Loga uma chamada IPC
 */
export function logIpcCall(channel: string, args: unknown[]): void {
  const argsStr = args.map((a) => {
    if (typeof a === 'string') return a.substring(0, 50);
    if (typeof a === 'object' && a !== null) return JSON.stringify(a).substring(0, 50);
    return String(a).substring(0, 50);
  });
  dglog(`[ipc:${channel}] chamado com: ${argsStr.join(', ')}`);
}

/**
 * Loga um erro IPC
 */
export function logIpcError(channel: string, error: unknown): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  dglog(`[ipc:${channel}] ERRO: ${errorMessage}`);
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default {
  safeIpcHandler,
  safeIpcHandlerSync,
  validarArquivoPayload,
  validarString,
  validarBoolean,
  validarNumber,
  validarStringArray,
  criarRegistrador,
  getRegistrador,
  caminhoSeguro,
  arquivoAcessivel,
  logIpcCall,
  logIpcError,
};
