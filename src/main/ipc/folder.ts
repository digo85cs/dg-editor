/**
 * Handlers IPC para operacoes de pasta/folder
 * Extraido de src/main/ipc/index.ts
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import { dglog } from '../dglog';
import { caminhoSeguro, exigirString, isErroPayload } from '../ipc-seguro';
import { CodigoErro, criarErro } from '@shared/erros';
import type { IpcResult } from './types';
import type { FolderScanResult } from '@shared/types';
import { formatScanSummary } from '../scanner';

// ============================================================================
// ESTADO
// ============================================================================

let mainWindowRef: BrowserWindow | null = null;

/**
 * Define a janela principal para dialogos de pasta
 */
export function setFolderMainWindow(window: BrowserWindow | null): void {
  mainWindowRef = window;
}

// ============================================================================
// HANDLERS DE PASTA
// ============================================================================

/**
 * Handler para escanear pasta
 */
export async function handleFolderScan(
  _event: Electron.IpcMainInvokeEvent,
  root: unknown
): Promise<FolderScanResult | IpcResult> {
  const r = exigirString(root, 'root');
  if (isErroPayload(r)) return { ok: false, erro: criarErro(CodigoErro.ERR_FOLDER_NOT_FOUND, 'Caminho da pasta inválido.', 'Escolha outro caminho.', r.erro), erroTexto: r.erro };
  const seg = caminhoSeguro(r, r);
  if (!seg.ok) return { ok: false, erro: criarErro(CodigoErro.ERR_FOLDER_NOT_FOUND, 'Pasta não encontrada.', 'Escolha outro caminho.', seg.erro), erroTexto: seg.erro };

  try {
    const { scanFolder } = await import('../scanner');
    return scanFolder(seg.abs);
  } catch (e: unknown) {
    const msg = String(e);
    const notFound = /ENOENT|not found|nao encontrad|não encontrad/i.test(msg);
    const perm = /EACCES|EPERM|permission|permiss/i.test(msg);
    const erro = notFound
      ? criarErro(CodigoErro.ERR_FOLDER_NOT_FOUND, 'Pasta não encontrada.', 'Escolha outro caminho.', msg)
      : perm
        ? criarErro(CodigoErro.ERR_FOLDER_PERMISSION, 'Sem permissão para acessar a pasta.', 'Verifique as permissões ou escolha outro caminho.', msg)
        : criarErro(CodigoErro.ERR_FILE_READ, 'Não foi possível ler a pasta.', 'Tente novamente.', msg);
    return { ok: false, erro, erroTexto: erro.mensagem };
  }
}

/**
 * Handler para formatar sumario de pasta
 */
export function handleFolderFormatSummary(
  _event: Electron.IpcMainInvokeEvent,
  result: unknown
): string {
  try {
    return formatScanSummary(result as FolderScanResult);
  } catch (e: unknown) {
    return 'Erro ao formatar resumo: ' + String(e);
  }
}

/**
 * Handler para seleccionar pasta via dialogo
 */
export async function handleFolderSelect(
  _event: Electron.IpcMainInvokeEvent
): Promise<{ canceled: boolean; path?: string }> {
  const window = mainWindowRef || null;
  const result = await dialog.showOpenDialog(window!, {
    title: 'Selecionar pasta de trabalho',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Selecionar pasta'
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }
  const pathSel = result.filePaths[0];
  try {
    const { definirRaizWorkspace } = await import('../workspace-raiz');
    definirRaizWorkspace(pathSel);
  } catch {
    /* */
  }
  return { canceled: false, path: pathSel };
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de pasta
 */
export function registrarHandlersFolder(): void {
  dglog('[ipc:folder] registrando handlers...');

  ipcMain.handle('folder:scan', handleFolderScan);
  ipcMain.handle('folder:format-summary', handleFolderFormatSummary);
  ipcMain.handle('folder:select', handleFolderSelect);

  dglog('[ipc:folder] handlers registrados!');
}

