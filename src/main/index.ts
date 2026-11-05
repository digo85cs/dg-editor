import { configurarLimites } from './resource-limiter'
configurarLimites();
import { applyMemoryLimit } from './resource-manager'
applyMemoryLimit();
import { configurarFechamentoLimpo } from './app-cleanup'
configurarFechamentoLimpo();
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { aplicarIdentidadeDg, resolverIconeApp, DG_APP_NAME } from './branding'
import { getAuthStore } from './auth'

// Identidade DG Editor (sem marca Electron na UI / taskbar)
aplicarIdentidadeDg()

/** Testes e smoke podem subir uma segunda copia. O atalho do dia a dia, nao. */
const multiPermitido =
  process.env.DG_QA_E2E === '1' ||
  process.env.DG_NAV_SMOKE === '1' ||
  process.env.DG_ALLOW_MULTI === '1'

function caminhoTravaInstancia(): string | null {
  const raiz =
    process.env.DG_ROOT || (process.platform === 'win32' ? 'D:\\CURSOR\\DG Editor' : '')
  if (!raiz) return null
  return join(raiz, '.dg-editor', 'instance.lock')
}

function marcarInstanciaAberta(): void {
  if (multiPermitido) return
  const p = caminhoTravaInstancia()
  if (!p) return
  try {
    const dir = join(p, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(p, String(process.pid), 'utf8')
  } catch {
    /* ignore */
  }
}

function limparInstanciaAberta(): void {
  const p = caminhoTravaInstancia()
  if (!p || !existsSync(p)) return
  try {
    if (readFileSync(p, 'utf8').trim() === String(process.pid)) unlinkSync(p)
  } catch {
    /* ignore */
  }
}

if (!multiPermitido && !app.requestSingleInstanceLock()) {
  app.exit(0)
  process.exit(0)
}
marcarInstanciaAberta()
import { getSystemProfile, formatBytes, profileStrength } from './profile'
import { scanFolder, formatScanSummary } from './scanner'
import { getBrain } from './brain/module'
import { executarAgente, escolherModelo, historico } from './brain/agent'
import { listarTools, desconectarMcp, mcpAtivo } from './mcp/client'
import { carregarIndice, indexarTurno } from './memory/embeddings'
import { ensureOllama } from './ollama-keeper'
import { dglog } from './dglog'
import { installPtBrMenu } from './menu'

import { runAnalysis, getCachedAnalysis, invalidarCacheAnalise } from './analyzer'
import type { EscopoAnalise } from '@shared/types'
import { whereIs, formatWhereIs } from './whereis'
import { readRules, rulesExist, createRulesTemplate, writeRules } from './dgrules'
import { loadChat, appendChat, clearChat } from './chatstore'

// Fase 2
import { getAccountsState } from './accounts'
import { guardianSnapshot, guardianResumo } from './guardian'
import { bootSaudeIAs } from './boot-saude'
import { gravarDossie, lerDossie, dossieSnapshot, caminhoDossie } from './dossie'
import {
  gerarContinuidade,
  dossieDirDoApp,
  statusAdapta,
  lerContinuidade,
  urlAdaptaPermitida,
  ADAPTA_URLS
} from './bridge-adapta'
import { diagnosticoCompleto } from './diagnostico'
import { askOllama } from './brain/ollama'
import { lerTema, salvarTema } from './tema'
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
} from './navegador/janela'
import { iniciarControleNavegador, pararControleNavegador } from './navegador/controle'
import { garantirTokenSessao, removerTokenSessao } from './navegador/token'
import {
  lerArquivo,
  lerArquivoBase64,
  salvarArquivo,
  listarDiretorio,
  arquivoExiste
} from './arquivos'
import {
  caminhoSeguro,
  exigirString,
  exigirBoolean,
  exigirArrayStrings,
  exigirObjeto,
  isErroPayload
} from './ipc-seguro'
import { ativarSafeMode, emSafeMode, detectarSafeModeArgv } from './safe-mode'

/** Flag de processo � safe-mode desliga watcher, health, agentes e MCP. */
const SAFE_MODE = detectarSafeModeArgv(process.argv)
if (SAFE_MODE) ativarSafeMode()
import { buscaArquivos, buscaConteudo, cancelarBuscaConteudo } from './busca'
import { listarComandosMeta } from './comandos-meta'
import {
  createTerminal,
  writeTerminal,
  resizeTerminal,
  killTerminal,
  killAllTerminals,
  shellAtivo
} from './terminal'
import { getShellCache, listarShells, lerShellPadrao, salvarShellPadrao } from './shell-detect'
import { registerVaultIpc } from './vault/ipc'
import { registerOpenClawIpc } from './openclaw/ipc'
import { registerAgentExtrasIpc } from './agent/ipc'

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

app.on('second-instance', () => {
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
})

function emSmokeNav(): boolean {
  return process.env.DG_NAV_SMOKE === '1'
}

/** Abre/garante o navegador embutido (ou BaseWindow no smoke). */
function abrirNavegadorAncorado(url?: string): { ok: boolean } {
  const dest = (url && String(url).trim()) || lerUltimaUrlNavegador() || 'about:blank'
  dglog('[navegador] abrir embutido url=' + dest)
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      definirJanelaPrincipalNavegador(mainWindow)
    }
    criarJanelaNavegador(dest, { mostrar: true })
    if (!emSmokeNav()) {
      mostrarNavegadorEmbutido(true)
      try {
        mainWindow?.webContents?.send('navegador:aberto')
      } catch {
        /* ignore */
      }
    }
    return { ok: true }
  } catch (e) {
    dglog('[navegador] abrir falhou: ' + String((e as Error)?.message || e))
    return { ok: false }
  }
}

function createWindow(): void {
  const icon = resolverIconeApp()
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
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '..', 'renderer', 'index.html'))
    mainWindow.once('ready-to-show', () => { mainWindow?.show() })
  }

  definirJanelaPrincipalNavegador(mainWindow)

  mainWindow.on('closed', () => {
    definirJanelaPrincipalNavegador(null)
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  if (SAFE_MODE) {
    dglog('[boot] SAFE MODE � sem agentes/MCP/watcher/health')
  }
  void import('./logs-estruturados').then(({ logEstruturado }) => {
    logEstruturado('info', 'boot', emSafeMode() || SAFE_MODE ? 'inicio safe-mode' : 'inicio normal')
  })
  // Windows: garante VBS/atalho sem pedir nada ao usuario
  if (process.platform === 'win32' && !SAFE_MODE) {
    void import('./win-self-heal')
      .then(({ selfHealWindowsLaunchers }) => {
        selfHealWindowsLaunchers()
      })
      .catch((e) => {
        dglog('[boot] win-self-heal: ' + String(e))
      })
  }
  // Token de sess�o ANTES do servidor de controle (sempre novo)
  garantirTokenSessao()
  installPtBrMenu({
    onAbrirNavegador: () => {
      const url = lerUltimaUrlNavegador() || 'about:blank'
      dglog('[navegador] menu abrir url=' + url)
      abrirNavegadorAncorado(url)
    },
    onAcao: (id) => {
      try {
        mainWindow?.webContents?.send('menu:acao', id)
      } catch {
        /* ignore */
      }
    }
  })
  onNavegadorEventos({
    onClose: () => {
      try {
        mainWindow?.webContents?.send('navegador:fechado')
      } catch {
        /* ignore */
      }
    }
  })
  const qaE2e = process.env.DG_QA_E2E === '1'
  if (!SAFE_MODE) {
    // Nao competir com terminal:create no boot � Ollama sobe depois
    if (!qaE2e) {
      setTimeout(() => {
        void bootSaudeIAs()
      }, 15000)
    }
    iniciarControleNavegador()
  } else {
    dglog('[safe-mode] watcher=off health=off agentes=off mcp-controle=off')
  }
  const auth = getAuthStore()
  const session = auth.ensureDeviceIdentity()
  dglog('[boot] DG Editor pronto (token ' + session.token.slice(0, 8) + '...)')
  createWindow()
  if (!SAFE_MODE && !qaE2e) {
    // Detec��o de modelos N�O no boot � libera o event loop para terminal:create.
    void import('./paths').then(({ resolverRaizProjeto }) => {
      const raiz = resolverRaizProjeto()
      setTimeout(() => {
        void import('./brain/modelos-catalogo').then(async (mod) => {
          try {
            const cat = await mod.detectarModelosLocais(raiz)
            const v = mod.validarCatalogo(cat)
            if (!v.ok) dglog('[modelos] validarCatalogo: ' + v.problemas.join('; '))
            else dglog('[modelos] validarCatalogo: ok')
            if (!SAFE_MODE) mod.iniciarHealthPeriodico(raiz, 120000)
          } catch (e) {
            dglog('[modelos] boot falhou: ' + String(e))
          }
        })
      }, 15000)
    })
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Smoke headless do navegador embutido (DG_NAV_SMOKE=1)
  // Com DG_NAV_SMOKE_EMBED=1: injeta BrowserWindow pai e usa host View (produ��o).
  if (process.env.DG_NAV_SMOKE === '1') {
    if (process.env.DG_NAV_SMOKE_EMBED === '1') {
      // Pai oculto (n�o offscreen) � WebContentsView precisa de paint real p/ screenshot.
      const smokeParent = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false,
        backgroundColor: '#1a1a1a'
      })
      definirJanelaPrincipalNavegador(smokeParent)
    }
    void import('./navegador/smoke').then((m) => m.rodarSmokeESair())
  }
})

app.on('before-quit', () => {
  limparInstanciaAberta()
  killAllTerminals()
  removerTokenSessao()
})

app.on('window-all-closed', () => {
  pararControleNavegador()
  destruirJanelaNavegador()
  if (process.platform !== 'darwin') app.quit()
})


  // Regras Gerais
  try { const rg=require('./regras-gerais'); ipcMain.handle('dg:regrasgerais:listar',()=>({ok:true,regras:rg.listarRegrasGerais()})); ipcMain.handle('dg:regrasgerais:salvar',(_e,r)=>rg.salvarRegrasGerais(r)); ipcMain.handle('dg:regrasgerais:ativas',()=>({ok:true,texto:rg.obterRegrasAtivas()})); } catch(e){console.warn('[regras-gerais]',e)}

ipcMain.handle('navegador:abrir', (_e, url?: string) => {
  return abrirNavegadorAncorado(url)
})

ipcMain.handle('navegador:embed-status', () => {
  return { ok: true, ...statusEmbedNavegador() }
})

ipcMain.on('navegador:bounds', (_e, b: unknown) => {
  if (!b || typeof b !== 'object') return
  const o = b as Record<string, unknown>
  if (
    typeof o.x !== 'number' ||
    typeof o.y !== 'number' ||
    typeof o.width !== 'number' ||
    typeof o.height !== 'number'
  ) {
    return
  }
  layoutNavegador({
    x: o.x,
    y: o.y,
    width: o.width,
    height: o.height
  })
})

ipcMain.on('navegador:mostrar', (_e, mostrar: unknown) => {
  mostrarNavegadorEmbutido(mostrar === true || mostrar === 'true' || mostrar === 1)
})

ipcMain.handle('navegador:fechar', () => {
  fecharJanelaNavegador()
  try {
    mainWindow?.webContents?.send('navegador:fechado')
  } catch {
    /* ignore */
  }
  return { ok: true }
})

// ---------- Terminal embutido ----------
ipcMain.handle(
  'terminal:create',
  (
    e,
    id: string,
    opts?: { cwd?: string; cols?: number; rows?: number; shellExe?: string; shellId?: string }
  ) => {
    try {
      return createTerminal(String(id), opts || {}, e.sender)
    } catch (err) {
      return { ok: false, erro: String((err as Error)?.message || err) }
    }
  }
)
ipcMain.handle('terminal:write', (_e, id: string, data: string) => {
  writeTerminal(String(id), String(data ?? ''))
})
ipcMain.handle('terminal:resize', (_e, id: string, cols: number, rows: number) => {
  resizeTerminal(String(id), Number(cols) || 80, Number(rows) || 24)
})
ipcMain.handle('terminal:kill', (_e, id: string) => {
  killTerminal(String(id))
})
ipcMain.handle('terminal:shell', () => shellAtivo() || getShellCache())
ipcMain.handle('terminal:shells', () => {
  try {
    return listarShells()
  } catch {
    return []
  }
})
ipcMain.handle('terminal:getShellPadrao', () => {
  try {
    return lerShellPadrao()
  } catch {
    return null
  }
})
ipcMain.handle('terminal:setShellPadrao', (_e, id: string | null) => {
  try {
    salvarShellPadrao(id == null || id === '' ? null : String(id))
  } catch (e) {
    dglog('[terminal] setShellPadrao falhou: ' + String((e as Error)?.message || e))
  }
})

// ---------- Arquivos (IDE) � path sanitizado + payload tipado ----------
ipcMain.handle('arquivo:ler', async (_e, caminho: unknown, pastas: unknown) => {
  const c = exigirString(caminho, 'caminho')
  if (isErroPayload(c)) return c
  const p = exigirArrayStrings(pastas, 'pastas')
  if (isErroPayload(p)) return p
  const seg = caminhoSeguro(c, p)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  return lerArquivo(seg.abs, p)
})
ipcMain.handle('arquivo:ler-base64', async (_e, caminho: unknown, pastas: unknown) => {
  const c = exigirString(caminho, 'caminho')
  if (isErroPayload(c)) return c
  const p = exigirArrayStrings(pastas, 'pastas')
  if (isErroPayload(p)) return p
  const seg = caminhoSeguro(c, p)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  return lerArquivoBase64(seg.abs, p)
})
ipcMain.handle('arquivo:salvar', async (_e, caminho: unknown, conteudo: unknown, pastas: unknown) => {
  const c = exigirString(caminho, 'caminho')
  if (isErroPayload(c)) return c
  const body = exigirString(conteudo, 'conteudo')
  if (isErroPayload(body)) return body
  const p = exigirArrayStrings(pastas, 'pastas')
  if (isErroPayload(p)) return p
  const seg = caminhoSeguro(c, p)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  return salvarArquivo(seg.abs, body, p)
})
ipcMain.handle('arquivo:listar', async (_e, dir: unknown, pastas: unknown) => {
  const d = exigirString(dir, 'dir')
  if (isErroPayload(d)) return d
  const p = exigirArrayStrings(pastas, 'pastas')
  if (isErroPayload(p)) return p
  const seg = caminhoSeguro(d, p)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  return listarDiretorio(seg.abs, p)
})
ipcMain.handle('arquivo:existe', async (_e, caminho: unknown, pastas: unknown) => {
  const c = exigirString(caminho, 'caminho')
  if (isErroPayload(c)) return c
  const p = exigirArrayStrings(pastas, 'pastas')
  if (isErroPayload(p)) return p
  const seg = caminhoSeguro(c, p)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  return arquivoExiste(seg.abs, p)
})

// ---------- Vault Markdown (Obsidian-compat) ----------
registerVaultIpc()
// ---------- OpenClaw (diffs + aprovacao humana; sem shell) ----------
registerOpenClawIpc()
// ---------- Agent: checkpoint, @projeto, orquestracao, fila ----------
registerAgentExtrasIpc()

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
ipcMain.handle('folder:scan', async (_e, root: unknown) => {
  const r = exigirString(root, 'root')
  if (isErroPayload(r)) return r
  const seg = caminhoSeguro(r, r)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  return scanFolder(seg.abs)
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

/** Raiz can�nica do DG Editor (ex.: D:\CURSOR\DG Editor) � para autoabrir no Explorer. */
ipcMain.handle('app:raiz-projeto', async () => {
  try {
    const { resolverRaizProjeto, fonteRaizResolvida } = await import('./paths')
    const raiz = resolverRaizProjeto()
    return { ok: true, raiz, fonte: fonteRaizResolvida() }
  } catch (e) {
    return { ok: false, erro: String((e as Error)?.message || e) }
  }
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

ipcMain.handle('modelos:listar', async () => {
  const { resolverRaizProjeto } = await import('./paths')
  const { lerCatalogo, detectarModelosLocais, validarCatalogo } = await import('./brain/modelos-catalogo')
  const raiz = resolverRaizProjeto()
  try {
    const catalogo = await detectarModelosLocais(raiz)
    const v = validarCatalogo(catalogo)
    return { ok: true, catalogo, problemas: v.problemas }
  } catch {
    const catalogo = lerCatalogo(raiz)
    const v = validarCatalogo(catalogo)
    return { ok: true, catalogo, problemas: v.problemas }
  }
})

ipcMain.handle('modelos:recarregar', async () => {
  const { resolverRaizProjeto } = await import('./paths')
  const { detectarModelosLocais, healthCheckModelos, validarCatalogo } = await import('./brain/modelos-catalogo')
  const raiz = resolverRaizProjeto()
  await detectarModelosLocais(raiz)
  const cat = await healthCheckModelos(raiz)
  const v = validarCatalogo(cat)
  return { ok: true, catalogo: cat, problemas: v.problemas }
})

ipcMain.handle('modelos:para-tarefa', async (_e, tarefa: unknown) => {
  const t = exigirString(tarefa, 'tarefa')
  if (isErroPayload(t)) return t
  const { resolverRaizProjeto } = await import('./paths')
  const { modeloParaTarefa } = await import('./brain/modelos-catalogo')
  return { ok: true, modelo: modeloParaTarefa(resolverRaizProjeto(), t) }
})

ipcMain.handle('modelos:versoes-remotas', async () => {
  const { resolverRaizProjeto } = await import('./paths')
  const { marcarVersoesRemotas, validarCatalogo } = await import('./brain/modelos-catalogo')
  const cat = await marcarVersoesRemotas(resolverRaizProjeto())
  const v = validarCatalogo(cat)
  return { ok: true, catalogo: cat, problemas: v.problemas }
})

ipcMain.handle('brain:avaliar', async (_e, modeloId?: unknown) => {
  const { resolverRaizProjeto } = await import('./paths')
  const { lerCatalogo } = await import('./brain/modelos-catalogo')
  const { rodarAvaliacao } = await import('./brain/avaliacao')
  const raiz = resolverRaizProjeto()
  const cat = lerCatalogo(raiz)
  const id =
    typeof modeloId === 'string' && modeloId.trim()
      ? modeloId.trim()
      : cat.ativo || ''
  if (!id) return { ok: false, erro: 'nenhum modelo ativo' }
  const r = await rodarAvaliacao(raiz, id)
  return { ok: true, avaliacao: r }
})

// ---------- Fase 1: analise, onde-esta, regras, chat ----------
ipcMain.handle('analysis:run', async (_e, root: unknown, forceOrOptions: unknown, options?: unknown) => {
  const r = exigirString(root, 'root')
  if (isErroPayload(r)) return r
  const optionsValue = options && typeof options === 'object'
    ? options
    : forceOrOptions && typeof forceOrOptions === 'object'
      ? forceOrOptions
      : null
  const forceValue = typeof forceOrOptions === 'boolean' ? forceOrOptions : undefined
  const f = exigirBoolean(forceValue, 'force', false)
  if (isErroPayload(f)) return f
  let escopoValue: unknown
  if (optionsValue && 'escopo' in optionsValue) escopoValue = optionsValue.escopo
  if (escopoValue !== undefined && escopoValue !== 'rapida' && escopoValue !== 'completa') {
    return { ok: false, erro: 'escopo de an�lise inv�lido' }
  }
  const escopo: EscopoAnalise = escopoValue === 'completa' ? 'completa' : 'rapida'
  const seg = caminhoSeguro(r, r)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  dglog('[analysis] handler acionado escopo=' + escopo)
  try {
    await ensureOllama()
    return await runAnalysis(seg.abs, escopo, f === true)
  } catch (e) {
    const mensagem = String((e as Error)?.message || e)
    if (/timeout|abort/i.test(mensagem)) {
      dglog('[analysis] timeout retornado ao renderer')
      return { ok: false, erro: 'timeout' }
    }
    throw e
  }
})

ipcMain.handle('analysis:choose-scope', async (_e, mode: unknown) => {
  if (mode !== 'choose-scope' && mode !== 'confirm-complete') {
    return { ok: false, erro: 'modo de escolha de analise invalido' }
  }
  const options = mode === 'choose-scope'
    ? {
        type: 'question' as const,
        title: 'Escopo da analise',
        message: 'Escolha o tipo de analise:',
        detail: 'Analise rapida = apenas arquivos-chave (rapida)\nAnalise completa = projeto inteiro (pode demorar)',
        buttons: ['Análise rápida', 'Análise completa', 'Cancelar'],
        defaultId: 0,
        cancelId: 2,
        noLink: true
      }
    : {
        type: 'warning' as const,
        title: 'Analise completa',
        message: 'Analisar o projeto inteiro pode levar varios minutos. Continuar?',
        buttons: ['Continuar', 'Cancelar'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      }
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
  const result = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options)
  dglog('[analysis] dialog mode=' + mode + ' response=' + result.response)
  return { ok: true, response: result.response }
})

ipcMain.handle('analysis:cached', (_e, root: unknown) => {
  const r = exigirString(root, 'root')
  if (isErroPayload(r)) return r
  const seg = caminhoSeguro(r, r)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  return getCachedAnalysis(seg.abs)
})

ipcMain.handle('whereis:ask', async (_e, root: unknown, query: unknown) => {
  const r = exigirString(root, 'root')
  if (isErroPayload(r)) return r
  const q = exigirString(query, 'query')
  if (isErroPayload(q)) return q
  const seg = caminhoSeguro(r, r)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  const result = whereIs(seg.abs, q)
  return { result, formatted: formatWhereIs(result) }
})

ipcMain.handle('rules:exists', (_e, root: unknown) => {
  const r = exigirString(root, 'root')
  if (isErroPayload(r)) return r
  const seg = caminhoSeguro(r, r)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  return rulesExist(seg.abs)
})

ipcMain.handle('rules:read', (_e, root: unknown) => {
  const r = exigirString(root, 'root')
  if (isErroPayload(r)) return r
  const seg = caminhoSeguro(r, r)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  return readRules(seg.abs)
})

ipcMain.handle('rules:create-template', (_e, root: unknown) => {
  const r = exigirString(root, 'root')
  if (isErroPayload(r)) return r
  const seg = caminhoSeguro(r, r)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  return createRulesTemplate(seg.abs)
})

ipcMain.handle('rules:write', (_e, root: unknown, texto: unknown) => {
  const r = exigirString(root, 'root')
  if (isErroPayload(r)) return r
  if (typeof texto !== 'string') return { ok: false, erro: 'texto invalido' }
  const seg = caminhoSeguro(r, r)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  return writeRules(seg.abs, texto)
})

ipcMain.handle('chat:load', (_e, root: unknown) => {
  const r = exigirString(root, 'root')
  if (isErroPayload(r)) return r
  const seg = caminhoSeguro(r, r)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  return loadChat(seg.abs)
})

ipcMain.handle('chat:anexar', async (_e, payload: unknown) => {
  try {
    const o = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const nome = typeof o.nome === 'string' ? o.nome : 'anexo'
    const data = typeof o.data === 'string' ? o.data : ''
    const tipo = typeof o.tipo === 'string' ? o.tipo : ''
    if (!data) return { ok: false, erro: 'sem dados' }
    const { textoDeAnexo } = await import('./anexos-chat')
    const item = textoDeAnexo(nome, data)
    return { ok: true, anexo: { nome, tipo, ext: nome.split('.').pop() || '', tamanho: item.bytes, texto: item.texto, binario: item.binario } }
  } catch (e) {
    return { ok: false, erro: String(e) }
  }
})

ipcMain.handle('chat:send', async (_e, root: unknown, content: unknown, opts: unknown) => {
  const r = exigirString(root, 'root')
  if (isErroPayload(r)) return { ok: false, message: { role: 'assistant', content: r.erro, at: Date.now(), provider: 'erro' } }
  const texto = exigirString(content, 'content')
  if (isErroPayload(texto)) return { ok: false, message: { role: 'assistant', content: texto.erro, at: Date.now(), provider: 'erro' } }
  const seg = caminhoSeguro(r, r)
  if (!seg.ok) return { ok: false, message: { role: 'assistant', content: seg.erro, at: Date.now(), provider: 'erro' } }
  const rootOk = seg.abs
  const userMsg = { role: 'user' as const, content: texto, at: Date.now() }
  appendChat(rootOk, userMsg)

  const o = opts && typeof opts === 'object' ? (opts as Record<string, unknown>) : {}
  const agenteSel = typeof o.agente === 'string' ? o.agente : 'auto'
  const modoSel = typeof o.modo === 'string' ? o.modo : 'auto'

  const { readRules: rr } = await import('./dgrules')
  const { getCachedAnalysis: gca } = await import('./analyzer')
  const { contextoChatHibrido, executarHibrido } = await import('./brain/hibrido')
  const rules = rr(rootOk)
  const analysis = gca(rootOk)
  const trim = texto.trim()
  const forceHibrido = /^\/hibrido\b/i.test(trim)
  const forceOk = /\bconfirmo\b/i.test(trim)
  const pedidoHibrido = forceHibrido ? trim.replace(/^\/hibrido\b/i, '').trim() || trim : trim
  const { resolverRotaChat: rotaAntecipada } = await import('./agent-router')
  const rotaPrevia = rotaAntecipada(agenteSel, trim)
  const chatLeve = rotaPrevia.kind === 'chat' && (!agenteSel || agenteSel === 'auto') && !forceHibrido

  let context = ''
  if (analysis) {
    context += `SISTEMA ABERTO: ${analysis.root}\nO QUE E: ${analysis.oQueE}\nSTACK: ${analysis.stack}\n`
  }
  try {
    const { regrasParaContexto } = await import('./regras-escopo')
    const arquivoAtivo = typeof o.arquivo === 'string' ? o.arquivo : ''
    context += regrasParaContexto(rootOk, arquivoAtivo ? [arquivoAtivo] : [], texto, chatLeve ? 2200 : 6000)
  } catch {
    if (rules) {
      const corte = chatLeve ? 1800 : 12000
      context += `\nREGRAS DO PROJETO (.dgrules - respeite):\n${rules.slice(0, corte)}\n`
    }
  }
  try {
    const { proporMemoria, textoMemoriasAceitas } = await import('./memorias')
    const pedidoMem = trim.match(/^(?:lembre|memorize|guarde)(?:\s+que)?\s+(.{8,400})$/i)
    if (pedidoMem) proporMemoria(rootOk, pedidoMem[1])
    const fatos = textoMemoriasAceitas(rootOk)
    if (fatos) context += '\nFATOS ACEITOS:\n' + fatos + '\n'
  } catch {
    /* memoria opcional */
  }
  // Briefing com git e varredura so em codigo/agente. Conversa simples nao espera o disco.
  if (!chatLeve) {
    try {
      context += '\n' + contextoChatHibrido(rootOk, texto) + '\n'
    } catch {
      /* briefing opcional */
    }
  }

  try {
    const { resolverRotaChat, decidirAutoAprovacao } = await import('./agent-router')
    const { blocoAnexos } = await import('./anexos-chat')
    const { enfileirarAgente } = await import('./agent/fila')
    const anexosTxt = blocoAnexos(o.anexos)
    if (anexosTxt) context += '\n\n### ANEXOS DO TURNO\n' + anexosTxt + '\n'
    const rota = resolverRotaChat(agenteSel, trim)
    context += '\nRota: ' + rota.dica + '\n'

    const publicar = async (
      content: string,
      provider: string,
      extra?: Record<string, unknown>
    ) => {
      const assistantMsg = {
        role: 'assistant' as const,
        content,
        at: Date.now(),
        provider
      }
      appendChat(rootOk, assistantMsg)
      await gravarDossie(loadChat(rootOk), { root: rootOk })
      gerarContinuidade(dossieDirDoApp())
      return { ok: true, message: assistantMsg, rota: rota.kind, ...extra }
    }

    const rodarAgente = async (idAgente: string, tarefa: 'chat' | 'codigo') => {
      const { executarAgente } = await import('./brain/agent')
      const resp = await executarAgente(rootOk, trim, {
        agente: idAgente,
        tarefa,
        modo: modoSel === 'plan' ? 'plan' : 'agent',
        proposeWrites: true,
        pastas: [rootOk],
        contextoExtra: context
      })
      let content = resp?.texto || 'Sem resposta do agente.'
      const propostas = Array.isArray(resp?.propostas) ? resp.propostas : []
      let autoAprovacao: { aplicada: boolean; motivo: string } = { aplicada: false, motivo: 'desligada' }
      if (o.autoAprovar === true && propostas.length) {
        const { predizerImpacto, analisarWorkspace } = await import('./brain/hibrido')
        const pred = predizerImpacto(trim, analisarWorkspace(rootOk))
        const gate = decidirAutoAprovacao(pred.risco, pred.rota, propostas.length)
        autoAprovacao = { aplicada: gate.ok, motivo: gate.motivo }
        if (gate.ok) {
          for (const p of propostas) {
            try {
              await (await import('./agent/propostas')).aplicarPropostaComCheckpoint(p.id, [rootOk])
            } catch (e) {
              autoAprovacao = { aplicada: false, motivo: e instanceof Error ? e.message : String(e) }
            }
          }
        } else {
          content += '\n\nAprovacao automatica nao aplicada: ' + gate.motivo + '. As propostas seguem para revisao.'
        }
      }
      return publicar(content, resp?.modelo || 'agente:' + idAgente, { propostas, autoAprovacao })
    }

    const resultado = await enfileirarAgente(async () => {
    // Roteamento: escolha manual permanece; auto+codigo vai ao free-coder; resto e chat pequeno.
    if (agenteSel && agenteSel !== 'auto') {
      try {
        const { lerAgente } = await import('./brain/agentes')
        const ag = lerAgente(rootOk, agenteSel)
        if (ag || agenteSel.startsWith('free-')) {
          const idAgente = ag ? ag.id : agenteSel
          return rodarAgente(idAgente, rota.tarefa)
        }
      } catch (e) {
        console.warn('[chat] rota agente falhou, fallback:', e)
      }
    }

    if (forceHibrido) {
      const h = await executarHibrido(rootOk, pedidoHibrido, {
        pastaAberta: analysis?.root || rootOk,
        force: forceOk
      })
      const assistantMsg = {
        role: 'assistant' as const,
        content: h.texto,
        at: Date.now(),
        provider: 'hibrido:' + (h.modelo || 'core')
      }
      appendChat(rootOk, assistantMsg)
      await gravarDossie(loadChat(rootOk), { root: rootOk })
      gerarContinuidade(dossieDirDoApp())
      return { ok: h.ok !== false, message: assistantMsg, hibrido: h.briefing }
    }

    if ((!agenteSel || agenteSel === 'auto') && rota.kind === 'agente' && rota.agente) {
      try {
        return await rodarAgente(rota.agente, 'codigo')
      } catch (e) {
        console.warn('[chat] free-coder falhou, fallback chat:', e)
      }
    }

    const { modeloParaTarefa } = await import('./brain/modelos-catalogo')
    const { resolverRaizProjeto } = await import('./paths')
    const { primeiroProvider } = await import('./brain/registry')
    const modeloChat = modeloParaTarefa(resolverRaizProjeto(), 'chat')
    const { guardianPodeOperar } = await import('./guardian')
    const modeloLocal = guardianPodeOperar() ? modeloChat : 'qwen2.5-coder:1.5b'
    const cfgRapido = primeiroProvider('chat')
    const systemChat = 'Voce e o DG Editor, assistente de analise de sistemas. Responda SEMPRE em portugues brasileiro correto.'
    const userChat = (context ? 'Contexto:\n' + context + '\n\n' : '') + 'Pedido: ' + texto
    const emitirDelta = (delta: string) => {
      try { _e.sender.send('chat:delta', { delta }) } catch { /* janela fechada */ }
    }
    const resetarDelta = () => {
      try { _e.sender.send('chat:delta', { reset: true }) } catch { /* janela fechada */ }
    }
    if (cfgRapido && cfgRapido.formato === 'openai' && cfgRapido.apiKeyEnv) {
      const key = String(process.env[cfgRapido.apiKeyEnv] || '').trim()
      if (key) {
        try {
          const { streamOpenAIChat } = await import('./brain/stream-chat')
          const textoRemoto = (await streamOpenAIChat({
            baseUrl: cfgRapido.baseUrl,
            apiKey: key,
            model: cfgRapido.modelo,
            system: systemChat,
            user: userChat,
            numPredict: cfgRapido.numPredict || 512,
            timeoutMs: cfgRapido.timeoutMs || 45_000,
            onDelta: emitirDelta
          })).trim()
          if (textoRemoto) return publicar(textoRemoto, cfgRapido.id + ':' + cfgRapido.modelo)
        } catch (e) {
          resetarDelta()
          console.warn('[chat] modelo online falhou, fallback local:', e)
        }
      }
    }
    if (!modeloChat) {
      const msg = {
        role: 'assistant' as const,
        content: 'Nenhum modelo de chat instalado',
        at: Date.now(),
        provider: 'erro'
      }
      appendChat(rootOk, msg)
      return { ok: false, message: msg }
    }
    await ensureOllama()
    try {
      const { streamOllamaChat } = await import('./brain/stream-chat')
      const { limitesPorTarefa } = await import('./brain/registry')
      const lim = limitesPorTarefa('chat')
      const textoLocal = (await streamOllamaChat({
        model: modeloLocal,
        system: systemChat,
        user: userChat,
        numPredict: lim.num_predict,
        timeoutMs: lim.timeoutMs,
        onDelta: emitirDelta
      })).trim()
      if (textoLocal) return publicar(textoLocal, 'ollama:' + modeloLocal)
    } catch (e) {
      resetarDelta()
      console.warn('[chat] stream local falhou:', e)
    }
    const response = await askOllama(texto, context, 'chat')
    return publicar(response.text, response.provider + ':' + modeloChat)
    })
    return resultado
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    const friendly = /Nenhum modelo de chat/.test(errMsg)
      ? 'Nenhum modelo de chat instalado'
      : `Nao consegui responder agora: ${errMsg}`
    const fallback = { role: 'assistant' as const, content: friendly, at: Date.now(), provider: 'erro' }
    appendChat(rootOk, fallback)
    await gravarDossie(loadChat(rootOk), { root: rootOk })
    gerarContinuidade(dossieDirDoApp())
    return { ok: false, message: fallback }
  }
})

ipcMain.handle('chat:clear', (_e, root: string) => {
  clearChat(root)
  return { ok: true }
})

const PROMPT_ORIENTADOR_SYSTEM = 'Voc� � um engenheiro de prompt. Receba a ideia do usu�rio e devolva um prompt mais claro, espec�fico e acion�vel, mantendo a inten��o original. Devolva APENAS o prompt refinado, sem pre�mbulo, sem explica��es. Preserve o idioma do usu�rio.'

ipcMain.handle('orientar:prompt', async (_e, root: unknown, prompt: unknown) => {
  const r = exigirString(root, 'root')
  if (isErroPayload(r)) return r
  const p = exigirString(prompt, 'prompt')
  if (isErroPayload(p)) return p
  if (!p.trim()) return { ok: false, erro: 'prompt vazio' }
  const seg = caminhoSeguro(r, r)
  if (!seg.ok) return { ok: false, erro: seg.erro }

  const inicio = Date.now()
  const { modeloParaTarefa } = await import('./brain/modelos-catalogo')
  const tentativas: Array<{
    tarefa: 'chat-rapido' | 'chat'
    modelo: string
    elapsedMs: number
    tokensGenerated?: number
    erro?: string
  }> = []

  for (const tarefa of ['chat-rapido', 'chat'] as const) {
    const modelo = modeloParaTarefa(seg.abs, tarefa)
    if (!modelo) {
      tentativas.push({ tarefa, modelo: '', elapsedMs: 0, erro: 'Nenhum modelo instalado para a tarefa ' + tarefa })
      continue
    }
    const inicioTentativa = Date.now()
    try {
      const resultado = await askOllama(p.trim(), '', tarefa, {}, {
        model: modelo,
        systemPrompt: PROMPT_ORIENTADOR_SYSTEM,
        numPredict: 400,
        timeoutMs: 15_000
      })
      const texto = resultado.text.trim()
      const elapsedMs = Date.now() - inicioTentativa
      if (!texto) throw new Error('O modelo retornou uma resposta vazia')
      tentativas.push({
        tarefa,
        modelo: resultado.model || modelo,
        elapsedMs,
        ...(typeof resultado.evalCount === 'number' ? { tokensGenerated: resultado.evalCount } : {})
      })
      const totalMs = Date.now() - inicio
      dglog('[prompt] sucesso tarefa=' + tarefa + ' modelo=' + modelo + ' elapsedMs=' + elapsedMs +
        ' totalElapsedMs=' + totalMs + ' tokens=' + (resultado.evalCount ?? 'desconhecido'))
      return {
        ok: true,
        resultado: texto,
        modelo: resultado.model || modelo,
        elapsedMs: totalMs,
        attemptElapsedMs: elapsedMs,
        tokensGenerated: resultado.evalCount ?? null,
        tentativas
      }
    } catch (err) {
      const elapsedMs = Date.now() - inicioTentativa
      const mensagem = err instanceof Error ? err.message : String(err)
      tentativas.push({ tarefa, modelo, elapsedMs, erro: mensagem })
      dglog('[prompt] falha tarefa=' + tarefa + ' modelo=' + modelo + ' elapsedMs=' + elapsedMs + ' erro=' + mensagem)
    }
  }

  const erroFinal = tentativas.some((tentativa) => /timeout|abort/i.test(tentativa.erro || ''))
    ? 'timeout'
    : tentativas[tentativas.length - 1]?.erro || 'Erro ao melhorar prompt'
  return { ok: false, erro: erroFinal, elapsedMs: Date.now() - inicio, tentativas }
})

// ---------- Git status / diff / repos ----------
ipcMain.handle('git:status', async (_e, raiz: unknown) => {
  const r = exigirString(raiz, 'raiz')
  if (isErroPayload(r)) return r
  const { gitStatus } = await import('./git')
  return gitStatus(r)
})

ipcMain.handle('git:diff', async (_e, raiz: unknown, caminho: unknown) => {
  const r = exigirString(raiz, 'raiz')
  if (isErroPayload(r)) return r
  const c = exigirString(caminho, 'caminho')
  if (isErroPayload(c)) return c
  const { gitDiff } = await import('./git')
  return gitDiff(r, c)
})

ipcMain.handle('git:repos', async (_e, payload: unknown) => {
  try {
    const o = exigirObjeto(payload, 'payload')
    if (isErroPayload(o)) return []
    const pastas = exigirArrayStrings(o.pastas, 'pastas')
    if (isErroPayload(pastas)) return []
    const { gitRepos } = await import('./git')
    return gitRepos(pastas)
  } catch {
    return []
  }
})

// ---------- Historico multi-chat (.dg-editor/chats/) ----------
ipcMain.handle('chat:salvar', async (_e, raiz: unknown, doc: unknown) => {
  const r = exigirString(raiz, 'raiz')
  if (isErroPayload(r)) return r
  const o = exigirObjeto(doc, 'doc')
  if (isErroPayload(o)) return o
  const id = exigirString(o.id, 'id')
  if (isErroPayload(id)) return id
  const titulo = typeof o.titulo === 'string' ? o.titulo : 'Sem titulo'
  const mensagens = Array.isArray(o.mensagens) ? o.mensagens : []
  const { salvarChat } = await import('./chats')
  const salvo = salvarChat(r, {
    id,
    titulo,
    mensagens: mensagens as { role: string; content: string; provider?: string; em?: string }[],
    criadoEm: typeof o.criadoEm === 'string' ? o.criadoEm : undefined
  })
  return { ok: true, chat: salvo }
})

ipcMain.handle('chat:listar', async (_e, raiz: unknown) => {
  const r = exigirString(raiz, 'raiz')
  if (isErroPayload(r)) return r
  const { listarChats } = await import('./chats')
  return { ok: true, chats: listarChats(r) }
})

ipcMain.handle('chat:carregar', async (_e, raiz: unknown, id: unknown) => {
  const r = exigirString(raiz, 'raiz')
  if (isErroPayload(r)) return r
  const i = exigirString(id, 'id')
  if (isErroPayload(i)) return i
  const { carregarChat } = await import('./chats')
  const chat = carregarChat(r, i)
  return chat ? { ok: true, chat } : { ok: false, erro: 'chat nao encontrado' }
})

ipcMain.handle('chat:apagar', async (_e, raiz: unknown, id: unknown) => {
  const r = exigirString(raiz, 'raiz')
  if (isErroPayload(r)) return r
  const i = exigirString(id, 'id')
  if (isErroPayload(i)) return i
  const { apagarChat } = await import('./chats')
  return { ok: true, apagado: apagarChat(r, i) }
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

// ---------- Adapta ONE / Maestro ----------
ipcMain.handle('adapta:status', async (_e, raiz?: unknown) => {
  let r = typeof raiz === 'string' && raiz.trim() ? raiz.trim() : ''
  if (!r) {
    const { resolverRaizProjeto } = await import('./paths')
    r = resolverRaizProjeto()
  }
  return statusAdapta(r)
})

ipcMain.handle('adapta:gerar', () => {
  return gerarContinuidade(dossieDirDoApp())
})

ipcMain.handle('adapta:ler-continuidade', (_e, regenerar?: unknown) => {
  if (regenerar === true) {
    const g = gerarContinuidade(dossieDirDoApp())
    if (!g.ok) return { ok: false, erro: g.erro }
  }
  return lerContinuidade()
})

ipcMain.handle('adapta:abrir', async (_e, alvo: unknown) => {
  let url = ''
  if (alvo === 'one') url = ADAPTA_URLS.one
  else if (alvo === 'hub') url = ADAPTA_URLS.hub
  else if (alvo === 'maestro') url = ADAPTA_URLS.maestro
  else if (alvo === 'docs') url = ADAPTA_URLS.docs
  else if (typeof alvo === 'string' && urlAdaptaPermitida(alvo)) url = alvo
  else return { ok: false, erro: 'url nao permitida' }
  await shell.openExternal(url)
  return { ok: true, url }
})

// ---------- Diagnostico ao vivo ----------
ipcMain.handle('diagnostico:rodar', async (_e, root: string | null) => {
  return diagnosticoCompleto(root)
})

// ---------- App ----------
ipcMain.handle('app:get-version', () => app.getVersion())

// ---------- Controles da barra de titulo propria ----------
ipcMain.handle('janela:minimizar', () => { mainWindow?.minimize() })
ipcMain.handle('janela:maximizar', () => {
  if (!mainWindow) return false
  if (mainWindow.isMaximized()) { mainWindow.unmaximize() } else { mainWindow.maximize() }
  return mainWindow.isMaximized()
})
ipcMain.handle('janela:fechar', () => { mainWindow?.close() })
ipcMain.handle('janela:estado', () => ({ maximizado: !!mainWindow?.isMaximized() }))
ipcMain.handle('janela:recarregar', (_e, forcar?: boolean) => {
  const wc = mainWindow?.webContents
  if (!wc) return { ok: false }
  if (forcar) wc.reloadIgnoringCache()
  else wc.reload()
  return { ok: true }
})
ipcMain.handle('janela:zoom', (_e, op?: string) => {
  const wc = mainWindow?.webContents
  if (!wc) return { ok: false, fator: 1 }
  const atual = wc.getZoomFactor()
  let prox = atual
  if (op === 'in') prox = Math.min(3, Math.round((atual + 0.1) * 100) / 100)
  else if (op === 'out') prox = Math.max(0.5, Math.round((atual - 0.1) * 100) / 100)
  else prox = 1
  wc.setZoomFactor(prox)
  return { ok: true, fator: prox }
})
ipcMain.handle('janela:tela-cheia', () => {
  if (!mainWindow) return { ok: false, cheia: false }
  const cheia = !mainWindow.isFullScreen()
  mainWindow.setFullScreen(cheia)
  return { ok: true, cheia }
})

ipcMain.on('app:quit', () => {
  app.quit()
})

// ---------- Auto auditoria ----------
ipcMain.handle('auditoria:rodar', async (_e, opcoes?: any) => {
  try {
    const mod = await import('./auto-auditoria')
    // Mesma regua do boot (OPCOES_AUDITORIA_PADRAO). autoAtualizar so se UI pedir explicitamente.
    return await mod.rodarAuditoria({
      ...mod.OPCOES_AUDITORIA_PADRAO,
      autoAtualizar: opcoes?.autoAtualizar === true,
      reiniciarAoFim: opcoes?.reiniciarAoFim === true
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
ipcMain.handle(
  'agente:executar',
  async (
    _e,
    root: string,
    pergunta: string,
    modeloOuOpcoes?: string | { modelo?: string; modo?: string; agente?: string; contextoExtra?: string }
  ) => {
    if (SAFE_MODE || emSafeMode()) return { ok: false, erro: 'safe-mode' }
    try {
      const opcoes =
        typeof modeloOuOpcoes === 'string'
          ? { modeloForcado: modeloOuOpcoes }
          : modeloOuOpcoes && typeof modeloOuOpcoes === 'object'
            ? {
                modeloForcado: typeof modeloOuOpcoes.modelo === 'string' ? modeloOuOpcoes.modelo : undefined,
                modo: modeloOuOpcoes.modo === 'plan' ? ('plan' as const) : ('agent' as const),
                agente: typeof modeloOuOpcoes.agente === 'string' ? modeloOuOpcoes.agente : undefined,
                contextoExtra:
                  typeof modeloOuOpcoes.contextoExtra === 'string' ? modeloOuOpcoes.contextoExtra : undefined
              }
            : {}
      const r = await executarAgente(root, pergunta, opcoes)
      return {
        ok: true,
        texto: r.texto,
        modelo: r.modelo,
        passos: r.passos,
        duracaoMs: r.duracaoMs,
        modo: opcoes.modo || 'agent'
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      dglog('[agente:executar] falhou: ' + msg)
      return { ok: false, erro: msg }
    }
  }
)

ipcMain.handle('agente:modelo', async () => {
  if (SAFE_MODE || emSafeMode()) return { ok: false, erro: 'safe-mode' }
  try { return { ok: true, modelo: await escolherModelo() } }
  catch (e: unknown) { return { ok: false, erro: String(e) } }
})

ipcMain.handle('agente:historico', async (_e, root: string) => {
  if (SAFE_MODE || emSafeMode()) return { ok: false, erro: 'safe-mode' }
  try { return { ok: true, mensagens: await historico(root) } }
  catch (e: unknown) { return { ok: false, erro: String(e) } }
})

// ---------- Busca / comandos (Quick Open, busca global, paleta) ----------
ipcMain.handle('busca:arquivos', (_e, root: unknown, query: unknown, limite?: unknown) => {
  const r = exigirString(root, 'root')
  if (isErroPayload(r)) return r
  const q = exigirString(query, 'query')
  if (isErroPayload(q)) return q
  const lim = typeof limite === 'number' ? limite : 80
  return buscaArquivos(r, q, lim)
})

ipcMain.handle(
  'busca:conteudo',
  async (_e, root: unknown, query: unknown, opcoes?: { regex?: boolean; limite?: number; id?: string }) => {
    const r = exigirString(root, 'root')
    if (isErroPayload(r)) return r
    const q = exigirString(query, 'query')
    if (isErroPayload(q)) return q
    return buscaConteudo(r, q, opcoes)
  }
)

ipcMain.handle('busca:cancelar', (_e, id: unknown) => {
  const i = exigirString(id, 'id')
  if (isErroPayload(i)) return i
  cancelarBuscaConteudo(i)
  return { ok: true }
})

ipcMain.handle('comandos:listar', () => ({ ok: true, comandos: listarComandosMeta() }))

ipcMain.handle('config:backup', async (_e, motivo?: unknown) => {
  const { backupConfigs } = await import('./config-backup')
  const m = typeof motivo === 'string' && motivo.trim() ? motivo.trim() : 'manual'
  return backupConfigs(m)
})

ipcMain.handle('sistema:safe-mode', async () => {
  return { ok: true, safeMode: emSafeMode() || SAFE_MODE }
})

ipcMain.handle('app:is-safe-mode', () => {
  return { ok: true, safeMode: emSafeMode() || SAFE_MODE }
})

ipcMain.handle('indice:iniciar', (_e, root: unknown) => {
  if (SAFE_MODE || emSafeMode()) {
    dglog('[safe-mode] indice/watcher bloqueado')
    return { ok: false, total: 0, erro: 'safe-mode' }
  }
  const r = exigirString(root, 'root')
  if (isErroPayload(r)) return r
  return import('./indice-arquivos').then((m) => m.iniciarIndice(r))
})

ipcMain.handle('indice:listar', (_e, filtro?: unknown) => {
  const f = filtro == null ? '' : typeof filtro === 'string' ? filtro : ''
  return import('./indice-arquivos').then((m) => ({ ok: true, itens: m.listarIndice(f), ...m.statusIndice() }))
})

ipcMain.handle('indice:status', () =>
  import('./indice-arquivos').then((m) => ({ ok: true, ...m.statusIndice() }))
)

ipcMain.handle('analysis:invalidar', (_e, root: unknown) => {
  const r = exigirString(root, 'root')
  if (isErroPayload(r)) return r
  const seg = caminhoSeguro(r, r)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  invalidarCacheAnalise(seg.abs)
  return { ok: true }
})

// ---------- Agente Hibrido Core (Fase 1 predicao + Fase 2 geracao) ----------
ipcMain.handle('hibrido:analisar', async (_e, root: string, pedido?: string, pastaAberta?: string) => {
  if (SAFE_MODE || emSafeMode()) return { ok: false, erro: 'safe-mode' }
  const { prepararBriefing } = await import('./brain/hibrido')
  return prepararBriefing(root || process.cwd(), pedido || 'status do workspace', pastaAberta)
})

ipcMain.handle(
  'hibrido:executar',
  async (
    _e,
    root: string,
    pedido: string,
    opcoes?: { force?: boolean; modeloForcado?: string; pastaAberta?: string }
  ) => {
    if (SAFE_MODE || emSafeMode()) {
      return { ok: false, texto: 'safe-mode', modelo: '', passos: [], briefing: null }
    }
    try {
      const { executarHibrido } = await import('./brain/hibrido')
      return await executarHibrido(root, pedido, opcoes)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      dglog('[hibrido:executar] falhou: ' + msg)
      return { ok: false, texto: msg, modelo: '', passos: [], briefing: null }
    }
  }
)

ipcMain.handle('mcp:tools', async () => {
  try {
    const tools = await listarTools()
    return { ok: true, tools: tools.map((t) => ({ name: t.name, description: t.description })) }
  } catch (e: unknown) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('mcp:status', () => ({ ok: true, ativo: mcpAtivo() }))

ipcMain.handle('editor:completar', async (_e, prefixo: unknown, sufixo: unknown) => {
  const pre = typeof prefixo === 'string' ? prefixo : ''
  const suf = typeof sufixo === 'string' ? sufixo : ''
  if (pre.trim().length < 2) return { ok: true, texto: '' }
  try {
    const { completarTrecho } = await import('./completar-tab')
    return { ok: true, texto: await completarTrecho(pre, suf) }
  } catch (e: unknown) {
    return { ok: false, texto: '', erro: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('memoria:listar', (_e, root: unknown) => {
  const r = exigirString(root, 'root')
  if (isErroPayload(r)) return r
  const seg = caminhoSeguro(r, r)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  return import('./memorias').then((m) => ({ ok: true, itens: m.listarMemorias(seg.abs) }))
})

ipcMain.handle('memoria:propor', (_e, root: unknown, texto: unknown) => {
  const r = exigirString(root, 'root')
  if (isErroPayload(r)) return r
  const seg = caminhoSeguro(r, r)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  const t = typeof texto === 'string' ? texto : ''
  return import('./memorias').then((m) => m.proporMemoria(seg.abs, t))
})

ipcMain.handle('memoria:decidir', (_e, root: unknown, id: unknown, aceitar: unknown) => {
  const r = exigirString(root, 'root')
  if (isErroPayload(r)) return r
  const seg = caminhoSeguro(r, r)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  const mid = typeof id === 'string' ? id : ''
  return import('./memorias').then((m) => m.decidirMemoria(seg.abs, mid, aceitar === true))
})

ipcMain.handle('memoria:status', (_e, root: string) => {
  try {
    const idx = carregarIndice(root)
    return { ok: true, turnos: idx.entradas.length, modelo: idx.modelo }
  } catch (e: unknown) {
    return { ok: false, erro: String(e) }
  }
})

ipcMain.handle('skills:listar', async (_e, raiz: unknown) => {
  const r = exigirString(raiz, 'raiz')
  if (isErroPayload(r)) return r
  const { listarSkills } = await import('./brain/skills')
  return {
    ok: true,
    skills: listarSkills(r).map((s) => ({ id: s.id, titulo: s.titulo, gatilho: s.gatilho }))
  }
})

ipcMain.handle('memoria:indexar', async (_e, root: string, role: 'user' | 'assistant', texto: string) => {
  try { await indexarTurno(root, role, texto); return { ok: true } }
  catch (e: unknown) { return { ok: false, erro: String(e) } }
})

// ---------- Agente de QA (subprocesso Node; nao carrega Playwright no main) ----------
ipcMain.handle('qa:run', async (_e, opcoes?: { suite?: string }) => {
  try {
    const { execFileSync } = await import('child_process')
    const { readFileSync, existsSync } = await import('fs')
    const { join } = await import('path')
    const { resolverRaizProjeto } = await import('./paths')
    const raiz = resolverRaizProjeto()
    const script = join(raiz, 'scripts', 'run-qa.cjs')
    const suite = (opcoes && opcoes.suite) || 'ipc'
    const nodeBin = process.env.npm_node_execpath || 'node'
    execFileSync(nodeBin, [script, '--suite=' + suite, '--no-e2e'], {
      cwd: raiz,
      encoding: 'utf-8',
      timeout: 180000,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const latest = join(raiz, 'qa-artifacts', 'latest', 'relatorio.json')
    if (!existsSync(latest)) return { ok: false, erro: 'relatorio nao gerado' }
    return JSON.parse(readFileSync(latest, 'utf-8'))
  } catch (e: unknown) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
})

// ---------- Auto auditoria no boot + periodica ----------
// Adiada: checarOllama/listarShells no boot competiam com terminal:create (spawnSync).
if (process.env.DG_QA_E2E !== '1' && !SAFE_MODE) {
  setTimeout(async () => {
    try {
      const mod = await import('./auto-auditoria')
      // Boot leve: sem limpeza de workspace e sem subir Ollama (isso travava o PC).
      const r = await mod.rodarAuditoria({ ...mod.OPCOES_AUDITORIA_PADRAO, bootLeve: true })
      console.log(
        '[auditoria:boot] ok=' +
          r.resumo.ok +
          ' warn=' +
          r.resumo.warn +
          ' erro=' +
          r.resumo.erro +
          ' corrigidos=' +
          r.resumo.corrigidos
      )
      if (r.resumo.pendencias && r.resumo.pendencias.length > 0) {
        console.log(
          '[auditoria:boot] pendencias: ' + r.resumo.pendencias.map((p) => p.id).join(', ')
        )
      }
      mod.iniciarAuditoriaPeriodica(1800000)
      console.log('[auditoria:boot] periodica ativa (30 min)')
    } catch (e: any) {
      console.warn('[auditoria:boot] falhou:', String(e?.message || e))
    }
  }, 180000)
} else if (SAFE_MODE) {
  console.log('[safe-mode] auditoria=off health=off watcher=off')
}
