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

/**
 * Handlers que ainda nao foram extraidos para arquivos separados
 * TODO: Mover para arquivos separados
 */
function registrarOutrosHandlers(): void {
  dglog('[ipc:registry] registrando handlers adicionais...');

  // ========================================================================
  // FOLDER / SELECAO
  // ========================================================================
  
  ipcMain.handle('folder:scan', async (_e, root: unknown) => {
    const r = exigirString(root, 'root');
    if (isErroPayload(r)) return r;
    const seg = caminhoSeguro(r.valor, r.valor);
    if (!seg.ok) return { ok: false, erro: seg.erro };
    
    try {
      const { scanFolder } = await import('../scanner');
      return scanFolder(seg.abs);
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  ipcMain.handle('folder:format-summary', (_e, result: unknown) => {
    try {
      const { formatScanSummary } = require('../scanner');
      return formatScanSummary(result);
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  ipcMain.handle('folder:select', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Selecionar pasta de trabalho',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Selecionar pasta'
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }
    return { canceled: false, path: result.filePaths[0] };
  });

  // ========================================================================
  // APP / SISTEMA
  // ========================================================================

  ipcMain.handle('app:raiz-projeto', async () => {
    try {
      const { resolverRaizProjeto, fonteRaizResolvida } = await import('../paths');
      const raiz = resolverRaizProjeto();
      return { ok: true, raiz, fonte: fonteRaizResolvida() };
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  ipcMain.handle('system:get-profile', () => {
    try {
      const { getSystemProfile } = require('../profile');
      return getSystemProfile();
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  ipcMain.handle('system:profile-strength', () => {
    try {
      const { getSystemProfile, profileStrength } = require('../profile');
      return profileStrength(getSystemProfile());
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  // ========================================================================
  // AUTH
  // ========================================================================

  ipcMain.handle('auth:get-state', () => {
    try {
      const { getAuthStore } = require('../auth');
      return getAuthStore().getState();
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  ipcMain.handle('auth:ensure-identity', () => {
    try {
      const { getAuthStore } = require('../auth');
      return getAuthStore().ensureDeviceIdentity();
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  ipcMain.handle('auth:logout', () => {
    try {
      const { getAuthStore } = require('../auth');
      getAuthStore().logout();
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  // ========================================================================
  // CONTA / GUARDIAN / TEMA
  // ========================================================================

  ipcMain.handle('accounts:get-state', async () => {
    try {
      const { getAccountsState } = await import('../accounts');
      return getAccountsState();
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  ipcMain.handle('guardian:snapshot', () => {
    try {
      const { guardianSnapshot } = require('../guardian');
      return guardianSnapshot();
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  ipcMain.handle('guardian:resumo', () => {
    try {
      const { guardianResumo } = require('../guardian');
      return guardianResumo();
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  ipcMain.handle('tema:get', () => {
    try {
      const { lerTema } = require('../tema');
      return lerTema();
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  ipcMain.handle('tema:set', (_e, tema: 'escuro' | 'claro') => {
    try {
      const { lerTema, salvarTema } = require('../tema');
      salvarTema(tema === 'claro' ? 'claro' : 'escuro');
      return { ok: true, tema: lerTema() };
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  // ========================================================================
  // DOSSIE
  // ========================================================================

  ipcMain.handle('dossie:ler', async () => {
    try {
      const { lerDossie } = await import('../dossie');
      return lerDossie();
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  ipcMain.handle('dossie:gravar', async (_e, root: string) => {
    try {
      const { loadChat } = await import('../chatstore');
      const { gravarDossie } = await import('../dossie');
      const destino = await gravarDossie(loadChat(root), { root });
      return { ok: true, caminho: destino };
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  ipcMain.handle('dossie:snapshot', async () => {
    try {
      const { dossieSnapshot } = await import('../dossie');
      return dossieSnapshot();
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  ipcMain.handle('dossie:caminho', () => {
    try {
      const { caminhoDossie } = require('../dossie');
      return caminhoDossie();
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  // ========================================================================
  // ADAPTA
  // ========================================================================

  ipcMain.handle('adapta:status', async (_e, raiz?: unknown) => {
    try {
      let r = typeof raiz === 'string' && raiz.trim() ? raiz.trim() : '';
      if (!r) {
        const { resolverRaizProjeto } = await import('../paths');
        r = resolverRaizProjeto();
      }
      const { statusAdapta } = await import('../bridge-adapta');
      return statusAdapta(r);
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  ipcMain.handle('adapta:gerar', () => {
    try {
      const { dossieDirDoApp, gerarContinuidade } = require('../bridge-adapta');
      return gerarContinuidade(dossieDirDoApp());
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  ipcMain.handle('adapta:ler-continuidade', (_e, regenerar?: unknown) => {
    try {
      const { dossieDirDoApp, gerarContinuidade, lerContinuidade } = require('../bridge-adapta');
      if (regenerar === true) {
        const g = gerarContinuidade(dossieDirDoApp());
        if (!g.ok) return { ok: false, erro: g.erro };
      }
      return lerContinuidade();
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  ipcMain.handle('adapta:abrir', async (_e, alvo: unknown) => {
    let url = '';
    if (alvo === 'one') url = 'https://one.ai';
    else if (alvo === 'hub') url = 'https://hub.one.ai';
    else if (alvo === 'maestro') url = 'https://maestro.one.ai';
    else if (alvo === 'docs') url = 'https://docs.one.ai';
    else if (typeof alvo === 'string') url = alvo;
    else return { ok: false, erro: 'url nao permitida' };

    try {
      const { shell, urlAdaptaPermitida, ADAPTA_URLS } = await import('../bridge-adapta');
      if (url === 'https://one.ai') url = ADAPTA_URLS.one;
      else if (url === 'https://hub.one.ai') url = ADAPTA_URLS.hub;
      else if (url === 'https://maestro.one.ai') url = ADAPTA_URLS.maestro;
      else if (url === 'https://docs.one.ai') url = ADAPTA_URLS.docs;
      
      if (!urlAdaptaPermitida(url)) {
        return { ok: false, erro: 'url nao permitida' };
      }
      await shell.openExternal(url);
      return { ok: true, url };
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  // ========================================================================
  // DIAGNOSTICO
  // ========================================================================

  ipcMain.handle('diagnostico:rodar', async (_e, root: string | null) => {
    try {
      const { diagnosticoCompleto } = await import('../diagnostico');
      return diagnosticoCompleto(root);
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  // ========================================================================
  // JANELA
  // ========================================================================

  ipcMain.handle('janela:minimizar', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('janela:maximizar', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) { mainWindow.unmaximize(); } else { mainWindow.maximize(); }
    return mainWindow.isMaximized();
  });

  ipcMain.handle('janela:fechar', () => {
    mainWindow?.close();
  });

  ipcMain.handle('janela:estado', () => ({ maximizado: !!mainWindow?.isMaximized() }));

  ipcMain.handle('janela:recarregar', (_e, forcar?: boolean) => {
    const wc = mainWindow?.webContents;
    if (!wc) return { ok: false };
    if (forcar) wc.reloadIgnoringCache();
    else wc.reload();
    return { ok: true };
  });

  ipcMain.handle('janela:zoom', (_e, op?: string) => {
    const wc = mainWindow?.webContents;
    if (!wc) return { ok: false, fator: 1 };
    const atual = wc.getZoomFactor();
    let prox = atual;
    if (op === 'in') prox = Math.min(3, Math.round((atual + 0.1) * 100) / 100);
    else if (op === 'out') prox = Math.max(0.5, Math.round((atual - 0.1) * 100) / 100);
    else prox = 1;
    wc.setZoomFactor(prox);
    return { ok: true, fator: prox };
  });

  ipcMain.handle('janela:tela-cheia', () => {
    if (!mainWindow) return { ok: false, cheia: false };
    const cheia = !mainWindow.isFullScreen();
    mainWindow.setFullScreen(cheia);
    return { ok: true, cheia };
  });

  ipcMain.on('app:quit', () => {
    const { app } = require('electron');
    app.quit();
  });

  // ========================================================================
  // AUDITORIA
  // ========================================================================

  ipcMain.handle('auditoria:rodar', async (_e, opcoes?: any) => {
    try {
      const mod = await import('../auto-auditoria');
      return await mod.rodarAuditoria({
        ...mod.OPCOES_AUDITORIA_PADRAO,
        autoAtualizar: opcoes?.autoAtualizar === true,
        reiniciarAoFim: opcoes?.reiniciarAoFim === true
      });
    } catch (e: any) {
      return { erro: String(e?.message || e) };
    }
  });

  ipcMain.handle('auditoria:periodica', async (_e, ativar: boolean) => {
    try {
      const mod = await import('../auto-auditoria');
      if (ativar) { mod.iniciarAuditoriaPeriodica(); } else { mod.pararAuditoriaPeriodica(); }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, erro: String(e?.message || e) };
    }
  });

  // ========================================================================
  // HIBRIDO
  // ========================================================================

  ipcMain.handle('hibrido:analisar', async (_e, root: string, pedido?: string, pastaAberta?: string) => {
    try {
      const { prepararBriefing } = await import('../brain/hibrido');
      return prepararBriefing(root || process.cwd(), pedido || 'status do workspace', pastaAberta);
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  ipcMain.handle('hibrido:executar', async (
    _e,
    root: string,
    pedido: string,
    opcoes?: { force?: boolean; modeloForcado?: string; pastaAberta?: string }
  ) => {
    try {
      const { executarHibrido } = await import('../brain/hibrido');
      return await executarHibrido(root, pedido, opcoes);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      dglog('[hibrido:executar] falhou: ' + msg);
      return { ok: false, texto: msg, modelo: '', passos: [], briefing: null };
    }
  });

  // ========================================================================
  // MCP
  // ========================================================================

  ipcMain.handle('mcp:tools', async () => {
    try {
      const { listarTools } = await import('../mcp/client');
      const tools = await listarTools();
      return { ok: true, tools: tools.map((t) => ({ name: t.name, description: t.description })) };
    } catch (e: unknown) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('mcp:status', () => {
    try {
      const { mcpAtivo } = require('../mcp/client');
      return { ok: true, ativo: mcpAtivo() };
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  // ========================================================================
  // EDITOR
  // ========================================================================

  ipcMain.handle('editor:completar', async (_e, prefixo: unknown, sufixo: unknown) => {
    const pre = typeof prefixo === 'string' ? prefixo : '';
    const suf = typeof sufixo === 'string' ? sufixo : '';
    if (pre.trim().length < 2) return { ok: true, texto: '' };
    try {
      const { completarTrecho } = await import('../completar-tab');
      return { ok: true, texto: await completarTrecho(pre, suf) };
    } catch (e: unknown) {
      return { ok: false, texto: '', erro: e instanceof Error ? e.message : String(e) };
    }
  });

  // ========================================================================
  // MEMORIA
  // ========================================================================

  ipcMain.handle('memoria:listar', (_e, root: unknown) => {
    const r = exigirString(root, 'root');
    if (isErroPayload(r)) return r;
    const seg = caminhoSeguro(r.valor, r.valor);
    if (!seg.ok) return { ok: false, erro: seg.erro };
    return import('../memorias').then((m) => ({ ok: true, itens: m.listarMemorias(seg.abs) }));
  });

  ipcMain.handle('memoria:propor', (_e, root: unknown, texto: unknown) => {
    const r = exigirString(root, 'root');
    if (isErroPayload(r)) return r;
    const seg = caminhoSeguro(r.valor, r.valor);
    if (!seg.ok) return { ok: false, erro: seg.erro };
    const t = typeof texto === 'string' ? texto : '';
    return import('../memorias').then((m) => m.proporMemoria(seg.abs, t));
  });

  ipcMain.handle('memoria:decidir', (_e, root: unknown, id: unknown, aceitar: unknown) => {
    const r = exigirString(root, 'root');
    if (isErroPayload(r)) return r;
    const seg = caminhoSeguro(r.valor, r.valor);
    if (!seg.ok) return { ok: false, erro: seg.erro };
    const mid = typeof id === 'string' ? id : '';
    return import('../memorias').then((m) => m.decidirMemoria(seg.abs, mid, aceitar === true));
  });

  ipcMain.handle('memoria:status', (_e, root: string) => {
    try {
      const { carregarIndice } = require('../memory/embeddings');
      const idx = carregarIndice(root);
      return { ok: true, turnos: idx.entradas.length, modelo: idx.modelo };
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  ipcMain.handle('memoria:indexar', async (_e, root: string, role: 'user' | 'assistant', texto: string) => {
    try {
      const { indexarTurno } = await import('../memory/embeddings');
      await indexarTurno(root, role, texto);
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, erro: String(e) };
    }
  });

  // ========================================================================
  // SKILLS
  // ========================================================================

  ipcMain.handle('skills:listar', async (_e, raiz: unknown) => {
    const r = exigirString(raiz, 'raiz');
    if (isErroPayload(r)) return r;
    const { listarSkills } = await import('../brain/skills');
    return {
      ok: true,
      skills: listarSkills(r.valor).map((s) => ({ id: s.id, titulo: s.titulo, gatilho: s.gatilho }))
    };
  });

  // ========================================================================
  // QA
  // ========================================================================

  ipcMain.handle('qa:run', async (_e, opcoes?: { suite?: string }) => {
    try {
      const { execFileSync } = await import('child_process');
      const { readFileSync, existsSync } = await import('fs');
      const { join } = await import('path');
      const { resolverRaizProjeto } = await import('../paths');
      const raiz = resolverRaizProjeto();
      const script = join(raiz, 'scripts', 'run-qa.cjs');
      const suite = (opcoes && opcoes.suite) || 'ipc';
      const nodeBin = process.env.npm_node_execpath || 'node';
      execFileSync(nodeBin, [script, '--suite=' + suite, '--no-e2e'], {
        cwd: raiz,
        encoding: 'utf-8',
        timeout: 180000,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      const latest = join(raiz, 'qa-artifacts', 'latest', 'relatorio.json');
      if (!existsSync(latest)) return { ok: false, erro: 'relatorio nao gerado' };
      return JSON.parse(readFileSync(latest, 'utf-8'));
    } catch (e: unknown) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) };
    }
  });

  // ========================================================================
  // CONFIG / SAFE MODE
  // ========================================================================

  ipcMain.handle('config:backup', async (_e, motivo?: unknown) => {
    const { backupConfigs } = await import('../config-backup');
    const m = typeof motivo === 'string' && motivo.trim() ? motivo.trim() : 'manual';
    return backupConfigs(m);
  });

  ipcMain.handle('sistema:safe-mode', async () => {
    return { ok: true, safeMode: emSafeMode() };
  });

  ipcMain.handle('app:is-safe-mode', () => {
    return { ok: true, safeMode: emSafeMode() || SAFE_MODE };
  });

  // ========================================================================
  // INDICE
  // ========================================================================

  ipcMain.handle('indice:iniciar', (_e, root: unknown) => {
    if (SAFE_MODE || emSafeMode()) {
      dglog('[safe-mode] indice/watcher bloqueado');
      return { ok: false, total: 0, erro: 'safe-mode' };
    }
    const r = exigirString(root, 'root');
    if (isErroPayload(r)) return r;
    return import('../indice-arquivos').then((m) => m.iniciarIndice(r.valor));
  });

  ipcMain.handle('indice:listar', (_e, filtro?: unknown) => {
    const f = filtro == null ? '' : typeof filtro === 'string' ? filtro : '';
    return import('../indice-arquivos').then((m) => ({ ok: true, itens: m.listarIndice(f), ...m.statusIndice() }));
  });

  ipcMain.handle('indice:status', () =>
    import('../indice-arquivos').then((m) => ({ ok: true, ...m.statusIndice() }))
  );

  // ========================================================================
  // MODELOS
  // ========================================================================

  ipcMain.handle('modelos:listar', async () => {
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
  });

  ipcMain.handle('modelos:recarregar', async () => {
    const { resolverRaizProjeto } = await import('../paths');
    const { detectarModelosLocais, healthCheckModelos, validarCatalogo } = await import('../brain/modelos-catalogo');
    const raiz = resolverRaizProjeto();
    await detectarModelosLocais(raiz);
    const cat = await healthCheckModelos(raiz);
    const v = validarCatalogo(cat);
    return { ok: true, catalogo: cat, problemas: v.problemas };
  });

  ipcMain.handle('modelos:para-tarefa', async (_e, tarefa: unknown) => {
    const t = exigirString(tarefa, 'tarefa');
    if (isErroPayload(t)) return t;
    const { resolverRaizProjeto } = await import('../paths');
    const { modeloParaTarefa } = await import('../brain/modelos-catalogo');
    return { ok: true, modelo: modeloParaTarefa(resolverRaizProjeto(), t.valor) };
  });

  ipcMain.handle('modelos:versoes-remotas', async () => {
    const { resolverRaizProjeto } = await import('../paths');
    const { marcarVersoesRemotas, validarCatalogo } = await import('../brain/modelos-catalogo');
    const cat = await marcarVersoesRemotas(resolverRaizProjeto());
    const v = validarCatalogo(cat);
    return { ok: true, catalogo: cat, problemas: v.problemas };
  });

  // ========================================================================
  // CHAT (send - complexo, requer logica adicional)
  // ========================================================================

  ipcMain.handle('chat:send', async (
    _e,
    root: string,
    content: string,
    opts: unknown
  ) => {
    // Implementacao complexa - manter no index.ts por enquanto
    // TODO: Extrair para arquivo separado
    dglog('[chat:send] handler complexo - manter no index.ts');
    return { ok: false, erro: 'Implementacao a ser extraida' };
  });

  // ========================================================================
  // HANDLERS REGRAS GERAIS (do index.ts original)
  // ========================================================================

  try {
    const rg = require('../regras-gerais');
    ipcMain.handle('dg:regrasgerais:listar', () => ({ ok: true, regras: rg.listarRegrasGerais() }));
    ipcMain.handle('dg:regrasgerais:salvar', (_e, r) => rg.salvarRegrasGerais(r));
    ipcMain.handle('dg:regrasgerais:ativas', () => ({ ok: true, texto: rg.obterRegrasAtivas() }));
  } catch (e) {
    console.warn('[regras-gerais]', e);
  }

  dglog('[ipc:registry] handlers adicionais registrados com sucesso');
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
