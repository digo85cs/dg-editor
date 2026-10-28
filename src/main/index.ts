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
import { garantirTokenSessao, removerTokenSessao } from './navegador/token'
import {
  lerArquivo,
  salvarArquivo,
  listarDiretorio,
  arquivoExiste
} from './arquivos'
import {
  caminhoSeguro,
  exigirString,
  exigirBoolean,
  exigirArrayStrings,
  isErroPayload
} from './ipc-seguro'
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
  // Token de sessão ANTES do servidor de controle (sempre novo)
  garantirTokenSessao()
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
  void import('./paths').then(({ resolverRaizProjeto }) => {
    const raiz = resolverRaizProjeto()
    void import('./brain/modelos-catalogo').then(async (mod) => {
      try {
        await mod.detectarModelosLocais(raiz)
        mod.iniciarHealthPeriodico(raiz, 10000)
      } catch (e) {
        dglog('[modelos] boot falhou: ' + String(e))
      }
    })
  })
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
ipcMain.handle('arquivo:ler', (_e, caminho: unknown, pastas: unknown) => {
  const c = exigirString(caminho, 'caminho')
  if (isErroPayload(c)) return c
  const p = exigirArrayStrings(pastas, 'pastas')
  if (isErroPayload(p)) return p
  const seg = caminhoSeguro(c, p)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  return lerArquivo(seg.abs, p)
})
ipcMain.handle('arquivo:salvar', (_e, caminho: unknown, conteudo: unknown, pastas: unknown) => {
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
ipcMain.handle('arquivo:listar', (_e, dir: unknown, pastas: unknown) => {
  const d = exigirString(dir, 'dir')
  if (isErroPayload(d)) return d
  const p = exigirArrayStrings(pastas, 'pastas')
  if (isErroPayload(p)) return p
  const seg = caminhoSeguro(d, p)
  if (!seg.ok) return { ok: false, erro: seg.erro }
  return listarDiretorio(seg.abs, p)
})
ipcMain.handle('arquivo:existe', (_e, caminho: unknown, pastas: unknown) => {
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
  const { lerCatalogo, detectarModelosLocais } = await import('./brain/modelos-catalogo')
  const raiz = resolverRaizProjeto()
  try {
    return { ok: true, catalogo: await detectarModelosLocais(raiz) }
  } catch {
    return { ok: true, catalogo: lerCatalogo(raiz) }
  }
})

ipcMain.handle('modelos:recarregar', async () => {
  const { resolverRaizProjeto } = await import('./paths')
  const { detectarModelosLocais, healthCheckModelos } = await import('./brain/modelos-catalogo')
  const raiz = resolverRaizProjeto()
  await detectarModelosLocais(raiz)
  const cat = await healthCheckModelos(raiz)
  return { ok: true, catalogo: cat }
})

ipcMain.handle('modelos:para-tarefa', async (_e, tarefa: unknown) => {
  const t = exigirString(tarefa, 'tarefa')
  if (isErroPayload(t)) return t
  const { resolverRaizProjeto } = await import('./paths')
  const { modeloParaTarefa } = await import('./brain/modelos-catalogo')
  return { ok: true, modelo: modeloParaTarefa(resolverRaizProjeto(), t) }
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
    const response = await askOllama(texto, context, 'chat')
    const assistantMsg = { role: 'assistant' as const, content: response.text, at: Date.now(), provider: response.provider }
    appendChat(rootOk, assistantMsg)
    await gravarDossie(loadChat(rootOk), { root: rootOk })
    gerarContinuidade(dossieDirDoApp())
    return { ok: true, message: assistantMsg }
  } catch (err) {
    const fallback = { role: 'assistant' as const, content: `Nao consegui responder agora: ${err instanceof Error ? err.message : String(err)}`, at: Date.now(), provider: 'erro' }
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

// ---------- Agente Hibrido Core (Fase 1 predicao + Fase 2 geracao) ----------
ipcMain.handle('hibrido:analisar', async (_e, root: string, pedido?: string, pastaAberta?: string) => {
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
