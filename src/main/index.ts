import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { existsSync } from 'fs'
import { getAuthStore } from './auth'
import { getSystemProfile, formatBytes, profileStrength } from './profile'
import { scanFolder, formatScanSummary } from './scanner'
import { getBrain } from './brain/module'
import { executarAgente, escolherModelo, historico } from './brain/agent'
import { listarTools, desconectarMcp, mcpAtivo } from './mcp/client'
import { carregarIndice, indexarTurno } from './memory/embeddings'
import { ensureOllama } from './ollama-keeper'
import { dglog } from './dglog'
import { installPtBrMenu } from './menu'

import { runAnalysis, getCachedAnalysis } from './analyzer'
import { whereIs, formatWhereIs } from './whereis'
import { readRules, rulesExist, createRulesTemplate } from './dgrules'
import { loadChat, appendChat, clearChat } from './chatstore'

// Fase 2
import { getAccountsState } from './accounts'
import { guardianSnapshot, guardianResumo } from './guardian'
import { bootSaudeIAs } from './boot-saude'
import { gravarDossie, lerDossie, dossieSnapshot, caminhoDossie } from './dossie'
import { gerarContinuidade, dossieDirDoApp } from './bridge-adapta'
import { diagnosticoCompleto } from './diagnostico'
import { askOllama } from './brain/ollama'
import { lerTema, salvarTema } from './tema'
import {
  criarJanelaNavegador,
  fecharJanelaNavegador,
  lerUltimaUrlNavegador
} from './navegador/janela'
import { iniciarControleNavegador, pararControleNavegador } from './navegador/controle'

const __dirname = dirname(fileURLToPath(import.meta.url))

function resolvePreload(): string {
  const candidates = [
    join(__dirname, '..', 'preload', 'index.js'),
    join(__dirname, '..', 'preload', 'index.cjs'),
    join(app.getAppPath(), 'out', 'preload', 'index.js'),
    join(app.getAppPath(), 'out', 'preload', 'index.cjs')
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return join(__dirname, '..', 'preload', 'index.js')
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'DG Editor',
    frame: false,
    backgroundColor: '#141414',
    show: false,
    icon: join(app.getAppPath(), 'resources', 'dg-studio.ico'),
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '..', 'renderer', 'index.html'))
    mainWindow.once('ready-to-show', () => { mainWindow?.show() })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  installPtBrMenu({
    onAbrirNavegador: () => {
      const url = lerUltimaUrlNavegador() || 'about:blank'
      dglog('[navegador] menu abrir url=' + url)
      criarJanelaNavegador(url, { mostrar: true })
    }
  })
  bootSaudeIAs()
  iniciarControleNavegador()
  const auth = getAuthStore()
  const session = auth.ensureDeviceIdentity()
  dglog('[boot] DG Editor pronto (token ' + session.token.slice(0, 8) + '...)')
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Smoke headless do navegador embutido (DG_NAV_SMOKE=1)
  if (process.env.DG_NAV_SMOKE === '1') {
    void import('./navegador/smoke').then((m) => m.rodarSmokeESair())
  }
})

app.on('window-all-closed', () => {
  pararControleNavegador()
  fecharJanelaNavegador()
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('navegador:abrir', (_e, url?: string) => {
  const dest = (url && String(url).trim()) || lerUltimaUrlNavegador() || 'about:blank'
  dglog('[navegador] ipc abrir url=' + dest)
  // singleton: criarJanelaNavegador não cria segunda instância
  criarJanelaNavegador(dest, { mostrar: true })
  return { ok: true }
})

// ---------- Auth IPC ----------
ipcMain.handle('auth:get-state', () => {
  return getAuthStore().getState()
})

ipcMain.handle('auth:ensure-identity', () => {
  return getAuthStore().ensureDeviceIdentity()
})

ipcMain.handle('auth:logout', () => {
  getAuthStore().logout()
  return { ok: true }
})

// ---------- System Profile IPC ----------
ipcMain.handle('system:get-profile', () => {
  return getSystemProfile()
})

ipcMain.handle('system:profile-strength', () => {
  return profileStrength(getSystemProfile())
})

// ---------- Folder scan IPC ----------
ipcMain.handle('folder:scan', async (_e, root: string) => {
  return scanFolder(root)
})

ipcMain.handle('folder:format-summary', (_e, result: ReturnType<typeof scanFolder>) => {
  return formatScanSummary(result)
})

// ---------- Folder selection ----------
ipcMain.handle('folder:select', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Selecionar pasta de trabalho',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Selecionar pasta'
  })
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true }
  }
  return { canceled: false, path: result.filePaths[0] }
})

// ---------- Brain IPC ----------
ipcMain.handle('brain:ask', async (_e, prompt: string, context: string) => {
  return getBrain().ask(prompt, context)
})

ipcMain.handle('brain:providers', async () => {
  return getBrain().getProviderStatuses()
})

ipcMain.handle('brain:ollama-status', async () => {
  return getBrain().getOllamaStatus()
})

ipcMain.handle('brain:models', async () => {
  return getBrain().listActiveModels()
})

// ---------- Fase 1: analise, onde-esta, regras, chat ----------
ipcMain.handle('analysis:run', async (_e, root: string, force: boolean) => {
  dglog('[analysis] handler acionado')
  await ensureOllama()
  return runAnalysis(root, force === true)
})

ipcMain.handle('analysis:cached', (_e, root: string) => {
  return getCachedAnalysis(root)
})

ipcMain.handle('whereis:ask', async (_e, root: string, query: string) => {
  const result = whereIs(root, query)
  return { result, formatted: formatWhereIs(result) }
})

ipcMain.handle('rules:exists', (_e, root: string) => {
  return rulesExist(root)
})

ipcMain.handle('rules:read', (_e, root: string) => {
  return readRules(root)
})

ipcMain.handle('rules:create-template', (_e, root: string) => {
  return createRulesTemplate(root)
})

ipcMain.handle('chat:load', (_e, root: string) => {
  return loadChat(root)
})

ipcMain.handle('chat:send', async (_e, root: string, content: string) => {
  const userMsg = { role: 'user' as const, content, at: Date.now() }
  appendChat(root, userMsg)

  const { readRules: rr } = await import('./dgrules')
  const { getCachedAnalysis: gca } = await import('./analyzer')
  const rules = rr(root)
  const analysis = gca(root)

  let context = ''
  if (analysis) {
    context += `SISTEMA ABERTO: ${analysis.root}\nO QUE E: ${analysis.oQueE}\nSTACK: ${analysis.stack}\n`
  }
  if (rules) {
    context += `\nREGRAS DO PROJETO (.dgrules - respeite):\n${rules}\n`
  }

  try {
    await ensureOllama()
    const response = await askOllama(content, context, 'chat')
    const assistantMsg = { role: 'assistant' as const, content: response.text, at: Date.now(), provider: response.provider }
    appendChat(root, assistantMsg)
    await gravarDossie(loadChat(root), { root })
    gerarContinuidade(dossieDirDoApp())
    return { ok: true, message: assistantMsg }
  } catch (err) {
    const fallback = { role: 'assistant' as const, content: `Nao consegui responder agora: ${err instanceof Error ? err.message : String(err)}`, at: Date.now(), provider: 'erro' }
    appendChat(root, fallback)
    await gravarDossie(loadChat(root), { root })
    gerarContinuidade(dossieDirDoApp())
    return { ok: false, message: fallback }
  }
})

ipcMain.handle('chat:clear', (_e, root: string) => {
  clearChat(root)
  return { ok: true }
})

// ---------- Fase 2: contas, guardiao, tema ----------
ipcMain.handle('accounts:get-state', async () => {
  return getAccountsState()
})

ipcMain.handle('guardian:snapshot', () => {
  return guardianSnapshot()
})

ipcMain.handle('guardian:resumo', () => {
  return guardianResumo()
})

ipcMain.handle('tema:get', () => {
  return lerTema()
})

ipcMain.handle('tema:set', (_e, tema: 'escuro' | 'claro') => {
  salvarTema(tema === 'claro' ? 'claro' : 'escuro')
  return { ok: true, tema: lerTema() }
})

// ---------- Fase 3: roteador ----------
ipcMain.handle('roteador:planejar', async (_e, _pedido: string) => {
  return {
    tarefa: 'codigo',
    disponibilidade: { ollama: true },
    decisao: { provedor: 'ollama', motivo: 'unico provedor local (brain unificado)', usarDossie: false }
  }
})

// ---------- Fase 3: dossie automatico ----------
ipcMain.handle('dossie:ler', async () => {
  return lerDossie()
})
ipcMain.handle('dossie:gravar', async (_e, root: string) => {
  const destino = await gravarDossie(loadChat(root), { root })
  return { ok: true, caminho: destino }
})
ipcMain.handle('dossie:snapshot', async () => {
  return dossieSnapshot()
})
ipcMain.handle('dossie:caminho', () => {
  return caminhoDossie()
})

// ---------- Diagnostico ao vivo ----------
ipcMain.handle('diagnostico:rodar', async (_e, root: string | null) => {
  return diagnosticoCompleto(root)
})

// ---------- App ----------
ipcMain.on('app:get-version', (e) => {
  e.reply('app:version', app.getVersion())
})


// ---------- Controles da barra de titulo propria ----------
ipcMain.handle('janela:minimizar', () => { mainWindow?.minimize() })
ipcMain.handle('janela:maximizar', () => {
  if (!mainWindow) return false
  if (mainWindow.isMaximized()) { mainWindow.unmaximize() } else { mainWindow.maximize() }
  return mainWindow.isMaximized()
})
ipcMain.handle('janela:fechar', () => { mainWindow?.close() })
ipcMain.handle('janela:estado', () => ({ maximizado: !!mainWindow?.isMaximized() }))

ipcMain.on('app:quit', () => {
  app.quit()
})

// ---------- Auto auditoria ----------
ipcMain.handle('auditoria:rodar', async (_e, opcoes?: any) => {
  try {
    const mod = await import('./auto-auditoria')
    return await mod.rodarAuditoria({
      autoAtualizar: !!opcoes?.autoAtualizar,
      reiniciarAoFim: opcoes?.reiniciarAoFim !== false
    })
  } catch (e: any) {
    return { erro: String(e?.message || e) }
  }
})
ipcMain.handle('auditoria:periodica', async (_e, ativar: boolean) => {
  try {
    const mod = await import('./auto-auditoria')
    if (ativar) { mod.iniciarAuditoriaPeriodica() } else { mod.pararAuditoriaPeriodica() }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, erro: String(e?.message || e) }
  }
})


// ---------- Agente com MCP + memoria generativa ----------
ipcMain.handle('agente:executar', async (_e, root: string, pergunta: string, modelo?: string) => {
  try {
    const r = await executarAgente(root, pergunta, modelo)
    return { ok: true, texto: r.texto, modelo: r.modelo, passos: r.passos }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    dglog('[agente:executar] falhou: ' + msg)
    return { ok: false, erro: msg }
  }
})

ipcMain.handle('agente:modelo', async () => {
  try { return { ok: true, modelo: await escolherModelo() } }
  catch (e: unknown) { return { ok: false, erro: String(e) } }
})

ipcMain.handle('agente:historico', async (_e, root: string) => {
  try { return { ok: true, mensagens: await historico(root) } }
  catch (e: unknown) { return { ok: false, erro: String(e) } }
})

ipcMain.handle('mcp:tools', async () => {
  try {
    const tools = await listarTools()
    return { ok: true, tools: tools.map((t) => ({ name: t.name, description: t.description })) }
  } catch (e: unknown) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('mcp:status', () => ({ ok: true, ativo: mcpAtivo() }))

ipcMain.handle('memoria:status', (_e, root: string) => {
  try {
    const idx = carregarIndice(root)
    return { ok: true, turnos: idx.entradas.length, modelo: idx.modelo }
  } catch (e: unknown) {
    return { ok: false, erro: String(e) }
  }
})

ipcMain.handle('memoria:indexar', async (_e, root: string, role: 'user' | 'assistant', texto: string) => {
  try { await indexarTurno(root, role, texto); return { ok: true } }
  catch (e: unknown) { return { ok: false, erro: String(e) } }
})

// ---------- Auto auditoria no boot + periodica ----------
setTimeout(async () => {
  try {
    const mod = await import('./auto-auditoria')
    const r = await mod.rodarAuditoria({ autoAtualizar: false })
    console.log('[auditoria:boot] ok=' + r.resumo.ok + ' warn=' + r.resumo.warn + ' erro=' + r.resumo.erro + ' corrigidos=' + r.resumo.corrigidos)
    mod.iniciarAuditoriaPeriodica(1800000)
    console.log('[auditoria:boot] periodica ativa (30 min)')
  } catch (e: any) {
    console.warn('[auditoria:boot] falhou:', String(e?.message || e))
  }
}, 4000)
