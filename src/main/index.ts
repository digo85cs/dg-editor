import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { existsSync } from 'fs'
import { getAuthStore } from './auth'
import { getSystemProfile, formatBytes, profileStrength } from './profile'
import { scanFolder, formatScanSummary } from './scanner'
import { getBrain } from './brain/module'
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
import { planejar, rotear } from './brain/router'
import { lerTema, salvarTema } from './tema'

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
  installPtBrMenu()
  bootSaudeIAs()
  const auth = getAuthStore()
  const session = auth.ensureDeviceIdentity()
  dglog('[boot] DG Editor pronto (token ' + session.token.slice(0, 8) + '...)')
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
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
    const response = await rotear(content, context)
    const assistantMsg = { role: 'assistant' as const, content: response.text, at: Date.now(), provider: response.provider }
    appendChat(root, assistantMsg)
    gravarDossie(loadChat(root), { root }).catch(() => {})
    return { ok: true, message: assistantMsg }
  } catch (err) {
    const fallback = { role: 'assistant' as const, content: `Nao consegui responder agora: ${err instanceof Error ? err.message : String(err)}`, at: Date.now(), provider: 'erro' }
    appendChat(root, fallback)
    gravarDossie(loadChat(root), { root }).catch(() => {})
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
ipcMain.handle('roteador:planejar', async (_e, pedido: string) => {
  return planejar(pedido)
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

// ---------- App ----------
ipcMain.on('app:get-version', (e) => {
  e.reply('app:version', app.getVersion())
})

ipcMain.on('app:quit', () => {
  app.quit()
})