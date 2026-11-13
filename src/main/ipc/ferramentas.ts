/**
 * Handlers IPC das ferramentas compartilhadas do editor.
 * Mantém busca, histórico, comandos e utilidades ligados ao preload.
 */
import { app, ipcMain } from 'electron'
import { exigirObjeto, exigirString, isErroPayload } from '../ipc-seguro'
import { buscaArquivos, buscaConteudo, cancelarBuscaConteudo, substituirConteudo } from '../busca'
import { listarComandosMeta } from '../comandos-meta'
import { emSafeMode } from '../safe-mode'
import { resolverRotaChat } from '../agent-router'
import { dglog } from '../dglog'
import { carregarChat, listarChats, apagarChat, salvarChat, type ChatMensagem } from '../chats'
import { backupConfigs } from '../config-backup'
import { carregarWorkspace, salvarWorkspace } from '../workspace-store'
import { definirRaizWorkspace, obterRaizWorkspace } from '../workspace-raiz'
import { caminhoSeguro } from '../ipc-seguro'
import { askOllama } from '../brain/ollama'
import { modeloParaTarefa } from '../brain/modelos-catalogo'

const PROMPT_ORIENTADOR_SYSTEM =
  'Você é um engenheiro de prompt. Receba a ideia do usuário e devolva um prompt mais claro, específico e acionável, mantendo a intenção original. Devolva apenas o prompt refinado, sem preâmbulo nem explicações. Preserve o idioma do usuário.'

function validarRaiz(raiz: unknown, campo = 'raiz'): string | { ok: false; erro: string } {
  const valor = exigirString(raiz, campo)
  if (isErroPayload(valor)) return valor
  const caminho = caminhoSeguro(valor, valor)
  return caminho.ok ? caminho.abs : { ok: false, erro: caminho.erro }
}

function idChatValido(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id)
}

function validarMensagens(valor: unknown): ChatMensagem[] | null {
  if (!Array.isArray(valor)) return null
  const mensagens: ChatMensagem[] = []
  for (const item of valor) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const m = item as Record<string, unknown>
    if (typeof m.role !== 'string' || typeof m.content !== 'string') return null
    mensagens.push({
      role: m.role.slice(0, 32),
      content: m.content.slice(0, 200_000),
      ...(typeof m.provider === 'string' ? { provider: m.provider.slice(0, 80) } : {}),
      ...(typeof m.em === 'string' ? { em: m.em.slice(0, 80) } : {})
    })
  }
  return mensagens
}

export function registrarHandlersFerramentas(): void {
  ipcMain.handle('app:get-version', () => app.getVersion())

  ipcMain.handle('busca:arquivos', (_event, raiz: unknown, query: unknown, limite?: unknown) => {
    const r = validarRaiz(raiz, 'root')
    if (typeof r !== 'string') return r
    const q = exigirString(query, 'query')
    if (isErroPayload(q)) return q
    const lim = typeof limite === 'number' && Number.isFinite(limite) ? Math.max(1, Math.min(200, Math.floor(limite))) : 80
    return buscaArquivos(r, q, lim)
  })

  ipcMain.handle('busca:conteudo', async (_event, raiz: unknown, query: unknown, opcoes?: unknown) => {
    const r = validarRaiz(raiz, 'root')
    if (typeof r !== 'string') return r
    const q = exigirString(query, 'query')
    if (isErroPayload(q)) return q
    let opts: { regex?: boolean; limite?: number; extensoes?: string[]; id?: string } = {}
    if (opcoes !== undefined) {
      const o = exigirObjeto(opcoes, 'opcoes')
      if (isErroPayload(o)) return o
      const regex = o.regex === true
      const limite = typeof o.limite === 'number' && Number.isFinite(o.limite)
        ? Math.max(1, Math.min(200, Math.floor(o.limite)))
        : undefined
      const extensoes = Array.isArray(o.extensoes)
        ? o.extensoes.filter((x): x is string => typeof x === 'string').slice(0, 50)
        : undefined
      const id = typeof o.id === 'string' && o.id.length <= 80 ? o.id : undefined
      opts = { regex, ...(limite ? { limite } : {}), ...(extensoes ? { extensoes } : {}), ...(id ? { id } : {}) }
    }
    return buscaConteudo(r, q, opts)
  })

  ipcMain.handle('busca:cancelar', (_event, id?: unknown) => {
    if (id !== undefined && typeof id !== 'string') return { ok: false, erro: 'payload invalido: id deve ser string' }
    return cancelarBuscaConteudo(id as string | undefined)
  })

  ipcMain.handle(
    'busca:substituir',
    (_event, raiz: unknown, query: unknown, substituicao: unknown, opcoes?: unknown) => {
      const r = validarRaiz(raiz, 'root')
      if (typeof r !== 'string') return r
      const q = exigirString(query, 'query')
      if (isErroPayload(q)) return q
      if (typeof substituicao !== 'string') return { ok: false, erro: 'substituicao invalida' }
      let opts: { regex?: boolean; previa?: boolean; extensoes?: string[] } = {}
      if (opcoes !== undefined) {
        const o = exigirObjeto(opcoes, 'opcoes')
        if (isErroPayload(o)) return o
        const extensoes = Array.isArray(o.extensoes)
          ? o.extensoes.filter((x): x is string => typeof x === 'string').slice(0, 50)
          : undefined
        opts = {
          regex: o.regex === true,
          previa: o.previa !== false,
          ...(extensoes ? { extensoes } : {})
        }
      }
      return substituirConteudo(r, q, substituicao, opts)
    }
  )

  ipcMain.handle('comandos:listar', () => ({ ok: true, comandos: listarComandosMeta() }))

  ipcMain.handle('chat:salvar', (_event, raiz: unknown, doc: unknown) => {
    const r = validarRaiz(raiz)
    if (typeof r !== 'string') return r
    const o = exigirObjeto(doc, 'doc')
    if (isErroPayload(o)) return o
    const id = exigirString(o.id, 'id')
    if (isErroPayload(id)) return id
    if (!idChatValido(id)) return { ok: false, erro: 'id de chat invalido' }
    const mensagens = validarMensagens(o.mensagens)
    if (!mensagens) return { ok: false, erro: 'mensagens invalidas' }
    const chat = salvarChat(r, {
      id,
      titulo: typeof o.titulo === 'string' ? o.titulo.slice(0, 120) : 'Sem titulo',
      mensagens,
      criadoEm: typeof o.criadoEm === 'string' ? o.criadoEm : undefined
    })
    return { ok: true, chat }
  })

  ipcMain.handle('chat:listar', (_event, raiz: unknown) => {
    const r = validarRaiz(raiz)
    if (typeof r !== 'string') return r
    return { ok: true, chats: listarChats(r) }
  })

  ipcMain.handle('chat:carregar', (_event, raiz: unknown, id: unknown) => {
    const r = validarRaiz(raiz)
    if (typeof r !== 'string') return r
    const i = exigirString(id, 'id')
    if (isErroPayload(i)) return i
    if (!idChatValido(i)) return { ok: false, erro: 'id de chat invalido' }
    const chat = carregarChat(r, i)
    return chat ? { ok: true, chat } : { ok: false, erro: 'chat nao encontrado' }
  })

  ipcMain.handle('chat:apagar', (_event, raiz: unknown, id: unknown) => {
    const r = validarRaiz(raiz)
    if (typeof r !== 'string') return r
    const i = exigirString(id, 'id')
    if (isErroPayload(i)) return i
    if (!idChatValido(i)) return { ok: false, erro: 'id de chat invalido' }
    return { ok: true, apagado: apagarChat(r, i) }
  })

  ipcMain.handle('orientar:prompt', async (_event, raiz: unknown, prompt: unknown) => {
    const r = validarRaiz(raiz, 'root')
    if (typeof r !== 'string') return r
    const p = exigirString(prompt, 'prompt')
    if (isErroPayload(p)) return p
    if (!p.trim()) return { ok: false, erro: 'prompt vazio' }

    const inicio = Date.now()
    const tentativas: Array<{ tarefa: 'chat-rapido' | 'chat'; modelo: string; elapsedMs: number; tokensGenerated?: number; erro?: string }> = []
    for (const tarefa of ['chat-rapido', 'chat'] as const) {
      const modelo = modeloParaTarefa(r, tarefa)
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
        const attemptElapsedMs = Date.now() - inicioTentativa
        if (!texto) throw new Error('O modelo retornou uma resposta vazia')
        tentativas.push({
          tarefa,
          modelo: resultado.model || modelo,
          elapsedMs: attemptElapsedMs,
          ...(typeof resultado.evalCount === 'number' ? { tokensGenerated: resultado.evalCount } : {})
        })
        const elapsedMs = Date.now() - inicio
        dglog('[prompt] sucesso tarefa=' + tarefa + ' modelo=' + modelo + ' elapsedMs=' + attemptElapsedMs)
        return {
          ok: true,
          resultado: texto,
          modelo: resultado.model || modelo,
          elapsedMs,
          attemptElapsedMs,
          tokensGenerated: resultado.evalCount ?? null,
          tentativas
        }
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : String(error)
        tentativas.push({ tarefa, modelo, elapsedMs: Date.now() - inicioTentativa, erro: mensagem })
        dglog('[prompt] falha tarefa=' + tarefa + ' modelo=' + modelo + ' erro=' + mensagem)
      }
    }
    const erro = tentativas.some((t) => /timeout|abort/i.test(t.erro || ''))
      ? 'timeout'
      : tentativas[tentativas.length - 1]?.erro || 'Erro ao melhorar prompt'
    return { ok: false, erro, elapsedMs: Date.now() - inicio, tentativas }
  })

  ipcMain.handle('roteador:planejar', (_event, pedido: unknown) => {
    const p = exigirString(pedido, 'pedido')
    if (isErroPayload(p)) return p
    const rota = resolverRotaChat('auto', p)
    return {
      tarefa: rota.tarefa,
      disponibilidade: { ollama: true },
      decisao: { provedor: 'ollama', motivo: rota.dica, usarDossie: false },
      rota
    }
  })

  ipcMain.handle('config:backup', (_event, motivo?: unknown) => {
    const m = typeof motivo === 'string' && motivo.trim() ? motivo.trim().slice(0, 80) : 'manual'
    return backupConfigs(m)
  })

  ipcMain.handle('workspace:carregar', () => {
    const ws = carregarWorkspace()
    return { ok: true, workspace: ws }
  })

  ipcMain.handle('workspace:salvar', (_event, doc: unknown) => {
    try {
      const o = doc && typeof doc === 'object' ? (doc as { pastaAtual?: string }) : {}
      if (typeof o.pastaAtual === 'string' && o.pastaAtual.trim()) {
        definirRaizWorkspace(o.pastaAtual)
      }
    } catch {
      /* */
    }
    return salvarWorkspace(doc)
  })

  ipcMain.handle('workspace:definir-raiz', (_event, pasta: unknown) => {
    const p = typeof pasta === 'string' ? pasta.trim() : ''
    if (!p) return { ok: false, erro: 'pasta vazia' }
    try {
      const abs = definirRaizWorkspace(p)
      return { ok: !!abs, raiz: obterRaizWorkspace() }
    } catch (e) {
      return { ok: false, erro: String(e) }
    }
  })

  ipcMain.handle('backup:onedrive', async () => {
    const { spawn } = await import('child_process')
    const { join } = await import('path')
    const { existsSync, readFileSync } = await import('fs')
    const { resolverRaizProjeto } = await import('../paths')
    const script = join(resolverRaizProjeto(), 'scripts', 'backup-onedrive.ps1')
    if (!existsSync(script)) {
      return { ok: false, erro: 'scripts/backup-onedrive.ps1 ausente' }
    }
    const local = backupConfigs('antes-onedrive')
    return await new Promise((resolve) => {
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script],
        { windowsHide: true }
      )
      let stderr = ''
      child.stderr?.on('data', (c: Buffer) => {
        stderr += c.toString('utf8')
      })
      const timer = setTimeout(() => {
        try {
          child.kill()
        } catch {
          /* */
        }
        resolve({ ok: false, erro: 'timeout backup OneDrive', local })
      }, 280000)
      child.on('close', (code) => {
        clearTimeout(timer)
        const txt =
          process.env.OneDrive ||
          join(process.env.USERPROFILE || 'C:\\Users\\digo8', 'OneDrive')
        const status = join(txt, 'BACKUP_DG_EDITOR', 'ULTIMO_BACKUP.txt')
        let ultimo: string | null = null
        try {
          if (existsSync(status)) ultimo = readFileSync(status, 'utf8').slice(0, 800)
        } catch {
          /* */
        }
        resolve({
          ok: code === 0,
          codigo: code,
          local,
          status: ultimo,
          erro: code === 0 ? undefined : (stderr || 'backup OneDrive falhou').slice(0, 400)
        })
      })
    })
  })

  ipcMain.handle('sistema:safe-mode', () => ({ ok: true, safeMode: emSafeMode() }))
}
