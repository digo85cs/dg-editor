/**
 * DG Editor - Processo Principal (Main Process)
 * Arquivo refatorado - Versao 0.2.1
 * 
 * Este arquivo e o entry point do Electron main process.
 * Ele inicializa o aplicativo, configura a janela principal,
 * e registra todos os handlers IPC.
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dglog } from './dglog';
import { aplicarIdentidadeDg, resolverIconeApp, DG_APP_NAME } from './branding';
import { getAuthStore } from './auth';
import { iniciarAutoUpdate } from './auto-update';
import { agendarManutencaoNoBoot } from './deps-manutencao';

// ============================================================================
// ESTADO GLOBAL
// ============================================================================

let mainWindow: BrowserWindow | null = null;

// ============================================================================
// IMPORTS DE CONFIGURACAO
// ============================================================================

// Importar funcoes de safe mode
import { emSafeMode, detectarSafeModeArgv, ativarSafeMode } from './safe-mode';

// Flag de processo para safe-mode
const SAFE_MODE = detectarSafeModeArgv(process.argv);
if (SAFE_MODE) ativarSafeMode();

// ============================================================================
// FUNCOES DE INSTANCIA UNICA
// ============================================================================

function caminhoTravaInstancia(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { resolverRaizProjeto } = require('./paths') as { resolverRaizProjeto: () => string }
    const raiz = process.env.DG_ROOT || resolverRaizProjeto()
    if (!raiz) return null
    return join(raiz, '.dg-editor', 'instance.lock')
  } catch {
    const raiz = process.env.DG_ROOT || ''
    if (!raiz) return null
    return join(raiz, '.dg-editor', 'instance.lock')
  }
}

function marcarInstanciaAberta(): void {
  if (SAFE_MODE) return;
  const multiPermitido = 
    process.env.DG_QA_E2E === '1' ||
    process.env.DG_NAV_SMOKE === '1' ||
    process.env.DG_ALLOW_MULTI === '1';
  
  if (multiPermitido) return;
  
  const p = caminhoTravaInstancia();
  if (!p) return;
  try {
    const dir = join(p, '..');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(p, String(process.pid), 'utf8');
  } catch {
    // ignore
  }
}

function limparInstanciaAberta(): void {
  const p = caminhoTravaInstancia();
  if (!p || !existsSync(p)) return;
  try {
    if (readFileSync(p, 'utf8').trim() === String(process.pid)) unlinkSync(p);
  } catch {
    // ignore
  }
}

// ============================================================================
// INICIALIZACAO DO ELECTRON
// ============================================================================

process.on('uncaughtException', (e) => {
  console.error('[main] UNCAUGHT:', (e as Error)?.message || e, (e as Error)?.stack || '')
})
process.on('unhandledRejection', (r) => {
  console.error('[main] UNHANDLED:', r)
})

// GPU: desabilitada por padrão (driver/Chromium incompatível em alguns Windows).
// Override: DG_ENABLE_GPU=1 (máquinas com GPU estável). Debug: DG_GPU_DEBUG=1.
if (!process.env.DG_ENABLE_GPU) {
  try { app.disableHardwareAcceleration(); } catch { /* ignore */ }
}
if (process.env.DG_GPU_DEBUG) {
  console.log('[main] GPU desabilitada:', !process.env.DG_ENABLE_GPU);
  console.log('[main] Electron:', process.versions.electron, 'Chrome:', process.versions.chrome, 'Node:', process.versions.node);
}

// Identidade DG Editor (sem marca Electron na UI / taskbar)
aplicarIdentidadeDg();

// Verificar se e possivel ter multiplas instancias
const multiPermitido = 
  process.env.DG_QA_E2E === '1' ||
  process.env.DG_NAV_SMOKE === '1' ||
  process.env.DG_ALLOW_MULTI === '1';

if (!multiPermitido && !app.requestSingleInstanceLock()) {
  app.exit(0);
  process.exit(0);
}

marcarInstanciaAberta();

// ============================================================================
// IMPORTS DE BOOT (Adiado para nao bloquear o event loop)
// ============================================================================

// Importar funcoes de boot adiado
import { getSystemProfile, formatBytes, profileStrength } from './profile';
import { scanFolder, formatScanSummary } from './scanner';
import { getBrain } from './brain/module';
import { listarTools, desconectarMcp, mcpAtivo } from './mcp/client';
import { carregarIndice, indexarTurno } from './memory/embeddings';
import { ensureOllama } from './ollama-keeper';
import { runAnalysis, getCachedAnalysis, invalidarCacheAnalise } from './analyzer';
import type { EscopoAnalise } from '@shared/types';
import { whereIs, formatWhereIs } from './whereis';
import { readRules, rulesExist, createRulesTemplate, writeRules } from './dgrules';
import { loadChat, appendChat, clearChat } from './chatstore';
import { getAccountsState } from './accounts';
import { guardianSnapshot, guardianResumo } from './guardian';
import { bootSaudeIAs } from './boot-saude';
import { gravarDossie, lerDossie, dossieSnapshot, caminhoDossie } from './dossie';
import { dossieDirDoApp } from './bridge-adapta';
import {
  gerarContinuidade,
  statusAdapta,
  lerContinuidade,
  urlAdaptaPermitida,
  ADAPTA_URLS
} from './bridge-adapta';
import { diagnosticoCompleto } from './diagnostico';
import { askOllama } from './brain/ollama';
import { lerTema, salvarTema } from './tema';
import {
  criarJanelaNavegador,
  fecharJanelaNavegador,
  destruirJanelaNavegador,
  lerUltimaUrlNavegador,
  definirJanelaPrincipalNavegador,
  layoutNavegador,
  mostrarNavegadorEmbutido,
  onNavegadorEventos,
  statusEmbedNavegador
} from './navegador/janela';
import { iniciarControleNavegador, pararControleNavegador } from './navegador/controle';
import { garantirTokenSessao, removerTokenSessao } from './navegador/token';
import {
  lerArquivo,
  lerArquivoBase64,
  salvarArquivo,
  listarDiretorio,
  arquivoExiste
} from './arquivos';
import {
  caminhoSeguro,
  exigirString,
  exigirBoolean,
  exigirArrayStrings,
  isErroPayload
} from './ipc-seguro';
import { installPtBrMenu } from './menu';
import { buscaArquivos, buscaConteudo, cancelarBuscaConteudo } from './busca';
import { listarComandosMeta } from './comandos-meta';
import {
  createTerminal,
  writeTerminal,
  resizeTerminal,
  killTerminal,
  killAllTerminals,
  shellAtivo
} from './terminal';
import { getShellCache, listarShells, lerShellPadrao, salvarShellPadrao } from './shell-detect';
import { registerVaultIpc } from './vault/ipc';
import { registerOpenClawIpc } from './openclaw/ipc';
import { registerAgentExtrasIpc } from './agent/ipc';

// ============================================================================
// FUNCOES DE JANELA
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolvePreload(): string {
  const candidates = [
    join(__dirname, '..', 'preload', 'index.js'),
    join(__dirname, '..', 'preload', 'index.cjs'),
    join(app.getAppPath(), 'out', 'preload', 'index.js'),
    join(app.getAppPath(), 'out', 'preload', 'index.cjs')
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return join(__dirname, '..', 'preload', 'index.js');
}

function emSmokeNav(): boolean {
  return process.env.DG_NAV_SMOKE === '1';
}

/** Abre/garante o navegador embutido (ou BaseWindow no smoke). */
function abrirNavegadorAncorado(url?: string): { ok: boolean } {
  const dest = (url && String(url).trim()) || lerUltimaUrlNavegador() || 'about:blank';
  dglog('[navegador] abrir embutido url=' + dest);
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      definirJanelaPrincipalNavegador(mainWindow);
    }
    criarJanelaNavegador(dest, { mostrar: true });
    if (!emSmokeNav()) {
      mostrarNavegadorEmbutido(true);
      try {
        mainWindow?.webContents?.send('navegador:aberto');
      } catch {
        /* ignore */
      }
    }
    return { ok: true };
  } catch (e) {
    dglog('[navegador] abrir falhou: ' + String(e instanceof Error ? e.message : e));
    return { ok: false };
  }
}

function createWindow(): void {
  const icon = resolverIconeApp();
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: DG_APP_NAME,
    frame: false,
    backgroundColor: '#141414',
    show: false,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(join(__dirname, '..', 'renderer', 'index.html'));
  }
  mainWindow.once('ready-to-show', () => {
    console.log('[main] ready-to-show: window.show()')
    try { mainWindow?.show(); mainWindow?.focus(); } catch { /* ignore */ }
  })
  mainWindow.webContents.on('did-fail-load', (_e, errCode, errDesc, validatedURL) => {
    console.error('[main] did-fail-load:', errCode, errDesc, validatedURL || '')
  })
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[main] render-process-gone:', details?.reason, details)
  })

  definirJanelaPrincipalNavegador(mainWindow);

  mainWindow.on('closed', () => {
    definirJanelaPrincipalNavegador(null);
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ============================================================================
// REGISTRO DE HANDLERS IPC
// ============================================================================

// Importar o registrador central de handlers IPC
import { registrarTodosHandlers, setMainWindow } from './ipc/index';

// ============================================================================
// EVENTOS DO ELECTRON
// ============================================================================

app.on('second-instance', () => {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
});

app.whenReady().then(() => {
  if (SAFE_MODE) {
    dglog('[boot] SAFE MODE - sem agentes/MCP/watcher/health');
  }

  // Log estruturado
  void import('./logs-estruturados').then(({ logEstruturado }) => {
    logEstruturado('info', 'boot', emSafeMode() || SAFE_MODE ? 'inicio safe-mode' : 'inicio normal');
  });

  // Windows: garante VBS/atalho sem pedir nada ao usuario
  if (process.platform === 'win32' && !SAFE_MODE) {
    void import('./win-self-heal')
      .then(({ selfHealWindowsLaunchers }) => {
        selfHealWindowsLaunchers();
      })
      .catch((e) => {
        dglog('[boot] win-self-heal: ' + String(e));
      });
  }

  // Token de sessao ANTES do servidor de controle
  garantirTokenSessao();

  // Instalar menu pt-BR
  installPtBrMenu({
    onAbrirNavegador: () => {
      const url = lerUltimaUrlNavegador() || 'about:blank';
      dglog('[navegador] menu abrir url=' + url);
      abrirNavegadorAncorado(url);
    },
    onAcao: (id) => {
      try {
        mainWindow?.webContents?.send('menu:acao', id);
      } catch {
        /* ignore */
      }
    }
  });

  // Eventos do navegador
  onNavegadorEventos({
    onClose: () => {
      try {
        mainWindow?.webContents?.send('navegador:fechado');
      } catch {
        /* ignore */
      }
    }
  });

  const qaE2e = process.env.DG_QA_E2E === '1';

  if (!SAFE_MODE) {
    // Nao competir com terminal:create no boot - Ollama sobe depois
    if (!qaE2e) {
      setTimeout(() => {
        void bootSaudeIAs();
      }, 15000);
    }
    iniciarControleNavegador();
  } else {
    dglog('[safe-mode] watcher=off health=off agentes=off mcp-controle=off');
  }

  // Inicializar autenticacao
  const auth = getAuthStore();
  const session = auth.ensureDeviceIdentity();
  dglog('[boot] DG Editor pronto (token ' + session.token.slice(0, 8) + '...)');

  // Criar janela principal
  createWindow();

  // Registrar handlers IPC
  setMainWindow(mainWindow);
  registrarTodosHandlers();
  try {
    iniciarAutoUpdate(() => mainWindow)
  } catch (e) {
    dglog('[boot] auto-update: ' + String(e))
  }
  try {
    if (!SAFE_MODE && !qaE2e) agendarManutencaoNoBoot()
  } catch (e) {
    dglog('[boot] deps-manutencao: ' + String(e))
  }
  try {
    const { garantirHardwareProfile } = require('./hardware-profile') as {
      garantirHardwareProfile: (f?: boolean) => unknown
    }
    garantirHardwareProfile(false)
  } catch (e) {
    dglog('[boot] hardware-profile: ' + String(e))
  }
  registerVaultIpc();
  registerOpenClawIpc();
  registerAgentExtrasIpc();
  try {
    const { garantirToken } = require('./openclaw/secrets');
    const tok = garantirToken();
    if (tok?.ok) dglog('[openclaw] token ' + (tok.criado ? 'criado' : 'ok') + ' prefixo=' + (tok.prefixo || ''));
  } catch (e) {
    dglog('[openclaw] token-ensure falhou: ' + String(e));
  }
  try {
    const { sincronizarChavesDoAmbiente } = require('./brain/providers-sync-env');
    const sync = sincronizarChavesDoAmbiente();
    dglog('[providers-sync] boot gravadas=' + (sync?.gravadas || []).join(',') + ' semEnv=' + (sync?.semEnv || []).length);
  } catch (e) {
    dglog('[providers-sync] boot falhou: ' + String(e));
  }

  if (!SAFE_MODE && !qaE2e) {
    // Detectacao de modelos NAO no boot - libera o event loop para terminal:create.
    void import('./paths').then(({ resolverRaizProjeto }) => {
      const raiz = resolverRaizProjeto();
      setTimeout(() => {
        void import('./ollama-keeper').then(({ ensureOllama }) => ensureOllama()).catch(() => {});
        void import('./brain/modelos-catalogo').then(async (mod) => {
          try {
            const cat = await mod.detectarModelosLocais(raiz);
            const v = mod.validarCatalogo(cat);
            if (!v.ok) dglog('[modelos] validarCatalogo: ' + v.problemas.join('; '));
            else dglog('[modelos] validarCatalogo: ok');
            // Warmup leve 1.5b para evitar ERR_LLM_TIMEOUT no 1o uso
            try {
              const { medirLatenciaModelo } = await import('./brain/ollama');
              const leve = cat.modelosPorTarefa?.['chat-rapido'] || 'qwen2.5-coder:1.5b';
              void medirLatenciaModelo(leve, 90_000).then((r) => {
                dglog('[modelos] warmup ' + leve + ' ok=' + String(r.ok === true));
              });
            } catch (e) {
              dglog('[modelos] warmup falhou: ' + String(e));
            }
            if (!SAFE_MODE) mod.iniciarHealthPeriodico(raiz, 120000);
          } catch (e) {
            dglog('[modelos] boot falhou: ' + String(e));
          }
        });
      }, 3000);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Smoke headless do navegador embutido (DG_NAV_SMOKE=1)
  if (process.env.DG_NAV_SMOKE === '1') {
    if (process.env.DG_NAV_SMOKE_EMBED === '1') {
      // Pai oculto (nao offscreen) - WebContentsView precisa de paint real p/ screenshot.
      const smokeParent = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false,
        backgroundColor: '#1a1a1a'
      });
      definirJanelaPrincipalNavegador(smokeParent);
    }
    void import('./navegador/smoke').then((m) => m.rodarSmokeESair());
  }
});

app.on('before-quit', () => {
  limparInstanciaAberta();
  killAllTerminals();
  removerTokenSessao();
});

app.on('window-all-closed', () => {
  pararControleNavegador();
  destruirJanelaNavegador();
  if (process.platform !== 'darwin') app.quit();
});

// ============================================================================
// REGISTRO DE HANDLERS RESTRITOS (que nao puderam ser extraidos)
// ============================================================================

// ============================================================================
// AUDITORIA PERIODICA NO BOOT
// ============================================================================

if (process.env.DG_QA_E2E !== '1' && !SAFE_MODE) {
  setTimeout(async () => {
    try {
      const mod = await import('./auto-auditoria');
      // Boot leve: sem limpeza de workspace e sem subir Ollama (isso travava o PC).
      const r = await mod.rodarAuditoria({ ...mod.OPCOES_AUDITORIA_PADRAO, bootLeve: true });
      console.log(
        '[auditoria:boot] ok=' +
          r.resumo.ok +
          ' warn=' +
          r.resumo.warn +
          ' erro=' +
          r.resumo.erro +
          ' corrigidos=' +
          r.resumo.corrigidos
      );
      if (r.resumo.pendencias && r.resumo.pendencias.length > 0) {
        console.log(
          '[auditoria:boot] pendencias: ' + r.resumo.pendencias.map((p: { id: string }) => p.id).join(', ')
        );
      }
      mod.iniciarAuditoriaPeriodica(1800000);
      console.log('[auditoria:boot] periodica ativa (30 min)');
    } catch (e: any) {
      console.warn('[auditoria:boot] falhou:', String(e?.message || e));
    }
  }, 180000);
} else if (SAFE_MODE) {
  console.log('[safe-mode] auditoria=off health=off watcher=off');
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export { mainWindow, setMainWindow };
