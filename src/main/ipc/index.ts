/**
 * Registrador central de handlers IPC
 * Centraliza o registro de todos os handlers do DG Editor
 */

import { ipcMain, dialog, BrowserWindow, app as electronApp } from 'electron';
import { dglog } from '../dglog';

// Importar todos os registradores
import { registrarHandlersArquivo } from './arquivos';
import { registrarHandlersTerminal, cleanupTerminal } from './terminal';
import { registrarHandlersNavegador, cleanupNavegador, setMainWindow as setNavegadorMainWindow } from './navegador';
import { registrarHandlersAgent } from './agent';
import { registrarHandlersBrain, ensureOllamaOnBoot } from './brain';
import { registrarHandlersGit } from './git';
import { registrarHandlersChat } from './chat';
import { registrarHandlersAnalise, setAnaliseMainWindow } from './analise';

// Importar novos registradores extraidos
import { registrarHandlersFolder } from './folder';
import { registrarHandlersApp, setMainWindow as setAppMainWindow, handleAppQuit } from './app';
import { registrarHandlersAppExtra } from './app-extra';
import { registrarHandlersSystem } from './system';
import { registrarHandlersAuth } from './auth';
import { registrarHandlersAccounts } from './accounts';
import { registrarHandlersGuardian } from './guardian';
import { registrarHandlersTema } from './tema';
import { registrarHandlersDossie } from './dossie';
import { registrarHandlersAdapta } from './adapta';
import { registrarHandlersDiagnostico } from './diagnostico';
import { registrarHandlersJanela, setJanelaMainWindow } from './janela';
import { registrarHandlersAuditoria } from './auditoria';
import { registrarHandlersHibrido } from './hibrido';
import { registrarHandlersMcp } from './mcp';
import { registrarHandlersEditor } from './editor';
import { registrarHandlersMemoria } from './memoria';
import { registrarHandlersSkills } from './skills';
import { registrarHandlersQa } from './qa';
import { registrarHandlersModelos } from './modelos';
import { registrarHandlersIndice } from './indice';
import { registrarHandlersRegrasGerais } from './regras-gerais';
import { registrarHandlersChatExtra } from './chat-extra';

// ============================================================================
// ESTADO
// ============================================================================

let mainWindow: BrowserWindow | null = null;

/**
 * Define a janela principal (para navegador e outros componentes)
 */
export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
  setNavegadorMainWindow(window);
  setAnaliseMainWindow(window);
  setJanelaMainWindow(window);
  setAppMainWindow(window);
}

/**
 * Obtem a janela principal
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra TODOS os handlers IPC do sistema
 * Chamado uma vez no boot do aplicativo
 */
export function registrarTodosHandlers(): void {
  dglog('[ipc:registry] >>> Iniciando registro de todos os handlers IPC...');

  try {
    // Registrar handlers por categoria
    registrarHandlersArquivo();
    registrarHandlersTerminal();
    registrarHandlersNavegador();
    registrarHandlersAgent();
    registrarHandlersBrain();
    registrarHandlersGit();
    registrarHandlersChat();
    registrarHandlersAnalise();

    // Registrar handlers extraidos recentemente
    registrarHandlersFolder();
    registrarHandlersApp();
    registrarHandlersAppExtra();
    registrarHandlersSystem();
    registrarHandlersAuth();
    registrarHandlersAccounts();
    registrarHandlersGuardian();
    registrarHandlersTema();
    registrarHandlersDossie();
    registrarHandlersAdapta();
    registrarHandlersDiagnostico();
    registrarHandlersJanela();
    registrarHandlersAuditoria();
    registrarHandlersHibrido();
    registrarHandlersMcp();
    registrarHandlersEditor();
    registrarHandlersMemoria();
    registrarHandlersSkills();
    registrarHandlersQa();
    registrarHandlersModelos();
    registrarHandlersIndice();
    registrarHandlersRegrasGerais();
    registrarHandlersChatExtra();

    dglog('[ipc:registry] <<< Todos os handlers IPC registrados com sucesso!');
  } catch (e) {
    dglog(`[ipc:registry] ERRO ao registrar handlers: ${String(e)}`);
    throw e;
  }
}

// ============================================================================
// IMPORTS PARA FUNCOES DE VALIDACAO
// ============================================================================

// Importar funcoes de validacao do ipc-seguro
import { caminhoSeguro, exigirString, exigirArrayStrings, isErroPayload } from '../ipc-seguro';
import { SAFE_MODE } from '../safe-mode';
import { emSafeMode } from '../safe-mode';

// Re-exportar funcoes de cleanup
export { cleanupTerminal, cleanupNavegador, ensureOllamaOnBoot };
