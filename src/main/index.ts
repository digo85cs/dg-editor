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

import { runAnalysis, getCachedAnalysis, invalidarCacheAnalise } from './analyzer'
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

/** Flag de processo — safe-mode desliga watcher, health, agentes e MCP. */
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
  if (SAFE_MODE) {
    dglog('[boot] SAFE MODE — sem agentes/MCP/watcher/health')
  }
  void import('./logs-estruturados').then(({ logEstruturado }) => {
    logEstruturado('info', 'boot', emSafeMode() || SAFE_MODE ? 'inicio safe-mode' : 'inicio normal')
  })
  // Token de sessão ANTES do servidor de controle (sempre novo)
  garantirTokenSessao()
  installPtBrMenu({
    onAbrirNavegador: () => {
      const url = lerUltimaUrlNavegador() || 'about:blank'
      dglog('[navegador] menu abrir url=' + url)
      criarJanelaNavegador(url, { mostrar: true })
    }
  })
  const qaE2e = process.env.DG_QA_E2E === '1'
  if (!SAFE_MODE) {
    // Nao competir com terminal:create no boot — Ollama sobe depois
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
    // Detecção de modelos NÃO no boot — libera o event loop para terminal:create.
    void import('./paths').then(({ resolverRaizProjeto }) => {
      const raiz = resolverRaizProjeto()
      setTimeout(() => {
        void import('./brain/modelos-catalogo').then(async (mod) => {
          try {
            const cat = await mod.detectarModelosLocais(raiz)
            const v = mod.validarCatalogo(cat)
            if (!v.ok) dglog('[modelos] validarCatalogo: ' + v.problemas.join('; '))
            else dglog('[modelos] validarCatalogo: ok')
            if (!SAFE_MODE) mod.iniciarHealthPeriodico(raiz, 30000)
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
  if (process.env.DG_NAV_SMOKE === '1') {
    void import('./navegador/smoke').then((m) => m.rodarSmokeESair())
  }
})

app.on('before-quit', () => {
  killAllTerminals()
  removerTokenSessao()
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

// ---------- Arquivos (IDE) — path sanitizado + payload tipado ----------
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
ipcMain.handle('analysis:run', async (_e, root: unknown, force: unknown) => {
  const r = exigirString(root, 'root')
  if (isErroPayload(r)) return r
  const f = exigirBoolean(force, 'force', false)
  if (isErroPayload(f)) return f
  const seg = caminhoSeguro(r, r)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  dglog('[analysis] handler acionado')
  await ensureOllama()
  return runAnalysis(seg.abs, f === true)
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

ipcMain.handle('chat:load', (_e, root: unknown) => {
  const r = exigirString(root, 'root')
  if (isErroPayload(r)) return r
  const seg = caminhoSeguro(r, r)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  return loadChat(seg.abs)
})

ipcMain.handle('chat:send', async (_e, root: unknown, content: unknown) => {
  const r = exigirString(root, 'root')
  if (isErroPayload(r)) return { ok: false, message: { role: 'assistant', content: r.erro, at: Date.now(), provider: 'erro' } }
  const texto = exigirString(content, 'content')
  if (isErroPayload(texto)) return { ok: false, message: { role: 'assistant', content: texto.erro, at: Date.now(), provider: 'erro' } }
  const seg = caminhoSeguro(r, r)
  if (!seg.ok) return { ok: false, message: { role: 'assistant', content: seg.erro, at: Date.now(), provider: 'erro' } }
  const rootOk = seg.abs
  const userMsg = { role: 'user' as const, content: texto, at: Date.now() }
  appendChat(rootOk, userMsg)

  const { readRules: rr } = await import('./dgrules')
  const { getCachedAnalysis: gca } = await import('./analyzer')
  const { contextoChatHibrido, executarHibrido } = await import('./brain/hibrido')
  const rules = rr(rootOk)
  const analysis = gca(rootOk)

  let context = ''
  if (analysis) {
    context += `SISTEMA ABERTO: ${analysis.root}\nO QUE E: ${analysis.oQueE}\nSTACK: ${analysis.stack}\n`
  }
  if (rules) {
    context += `\nREGRAS DO PROJETO (.dgrules - respeite):\n${rules}\n`
  }
  // Fase 1 hibrida (sempre): predicao factual no contexto do chat
  try {
    context += '\n' + contextoChatHibrido(rootOk, texto) + '\n'
  } catch {
    /* briefing opcional */
  }

  const trim = texto.trim()
  const forceHibrido = /^\/hibrido\b/i.test(trim)
  const forceOk = /\bconfirmo\b/i.test(trim)
  const pedidoHibrido = forceHibrido ? trim.replace(/^\/hibrido\b/i, '').trim() || trim : trim

  try {
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

    await ensureOllama()
    const { modeloParaTarefa } = await import('./brain/modelos-catalogo')
    const { resolverRaizProjeto } = await import('./paths')
    const modeloChat = modeloParaTarefa(resolverRaizProjeto(), 'chat')
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
    const response = await askOllama(texto, context, 'chat')
    const assistantMsg = {
      role: 'assistant' as const,
      content: response.text,
      at: Date.now(),
      provider: response.provider + ':' + modeloChat
    }
    appendChat(rootOk, assistantMsg)
    await gravarDossie(loadChat(rootOk), { root: rootOk })
    gerarContinuidade(dossieDirDoApp())
    return { ok: true, message: assistantMsg }
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
ipcMain.handle('agente:executar', async (_e, root: string, pergunta: string, modelo?: string) => {
  if (SAFE_MODE || emSafeMode()) return { ok: false, erro: 'safe-mode' }
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
      // Mesma regua que o botao Auditar (OPCOES_AUDITORIA_PADRAO / autoAtualizar=false)
      const r = await mod.rodarAuditoria({ ...mod.OPCOES_AUDITORIA_PADRAO })
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
  }, 30000)
} else if (SAFE_MODE) {
  console.log('[safe-mode] auditoria=off health=off watcher=off')
}
