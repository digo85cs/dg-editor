/**
 * Registrador central de handlers IPC
 * Centraliza o registro de todos os handlers do DG Editor
 */

import { ipcMain, BrowserWindow } from 'electron';
import { dglog } from '../dglog';
import { garantirHardwareProfile } from '../hardware-profile';

// Importar todos os registradores
import { registrarHandlersArquivo } from './arquivos';
import { registrarHandlersTerminal, cleanupTerminal } from './terminal';
import { registrarHandlersNavegador, cleanupNavegador, setMainWindow as setNavegadorMainWindow } from './navegador';
import { registrarHandlersAgent } from './agent';
import { registrarHandlersBrain, ensureOllamaOnBoot } from './brain';
import { registrarHandlersGit } from './git';
import { registrarHandlersChat } from './chat';
import { registrarHandlersAnalise, setAnaliseMainWindow } from './analise';
import { registrarDialogUi } from '../ui-dialog';
import { registrarUpdateIpc } from '../auto-update';

// Importar novos registradores extraidos
import { registrarHandlersFolder, setFolderMainWindow } from './folder';
import { registrarHandlersApp } from './app';
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
import { registrarHandlersFerramentas } from './ferramentas';
import { registrarHandlersDeps } from './deps';
import { registrarHandlersProviders } from './providers';
import { registrarHandlersDeploy } from './deploy';
import { registrarHubExtras } from './hub-extras';
import { registrarHandlersPerfil } from './perfil';
import { registrarHandlersAutomation } from './automation';
import { registrarHandlersMidia } from './midia';
import { registrarHandlersApps } from './apps';
import { registrarHandlersPortabilidade } from './portabilidade';
import { registrarComfyUIIpc } from '../comfyui-mcp';

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
  setFolderMainWindow(window);
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
    registrarDialogUi()
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
    registrarHandlersFerramentas();
    registrarHandlersDeps();
    registrarHandlersProviders();
    registrarHandlersDeploy();
    registrarHandlersAutomation();
    registrarHandlersMidia();
    registrarHandlersApps();
    registrarHandlersPortabilidade();
    registrarComfyUIIpc();
    registrarHubExtras();
    registrarHandlersPerfil();
    registrarUpdateIpc()
    ipcMain.handle('hardware:perfil', () => garantirHardwareProfile(false))
    ipcMain.handle('hardware:atualizar', () => garantirHardwareProfile(true))

    dglog('[ipc:registry] <<< Todos os handlers IPC registrados com sucesso!');
  } catch (e) {
    dglog(`[ipc:registry] ERRO ao registrar handlers: ${String(e)}`);
    throw e;
  }
}

// Re-exportar funcoes de cleanup
export { cleanupTerminal, cleanupNavegador, ensureOllamaOnBoot };
