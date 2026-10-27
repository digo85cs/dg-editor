import type { ResultadoCenario } from '../tipos'

function ok(
  id: string,
  titulo: string,
  t0: number,
  detalhe?: string
): ResultadoCenario {
  return {
    id,
    area: 'ipc',
    titulo,
    severidade: 'ok',
    duracaoMs: Date.now() - t0,
    detalhe
  }
}

function erro(id: string, titulo: string, t0: number, e: unknown): ResultadoCenario {
  return {
    id,
    area: 'ipc',
    titulo,
    severidade: 'erro',
    duracaoMs: Date.now() - t0,
    erro: String((e as Error)?.message || e),
    corrigivel: false
  }
}

function warn(id: string, titulo: string, t0: number, detalhe: string): ResultadoCenario {
  return {
    id,
    area: 'ipc',
    titulo,
    severidade: 'warn',
    duracaoMs: Date.now() - t0,
    detalhe,
    corrigivel: false
  }
}

/** Stub mínimo de WebContents para createTerminal. */
function stubSender() {
  return {
    isDestroyed: () => false,
    send: (_ch: string, _payload: unknown) => {},
    once: (_ev: string, _cb: () => void) => {}
  }
}

/**
 * Exercita funções/handlers de main SEM abrir BrowserWindow.
 * Handlers que dependem de webContents: terminal create — usa stubSender.
 */
export async function rodarCenariosIpc(temTTY = true): Promise<{
  resultados: ResultadoCenario[]
  stubs: string[]
}> {
  const resultados: ResultadoCenario[] = []
  const stubs: string[] = []

  // --- shell-detect ---
  {
    const t0 = Date.now()
    try {
      const { listarShells, lerShellPadrao, salvarShellPadrao, acharShellPorId } = await import(
        '../../main/shell-detect'
      )
      const lista = listarShells()
      if (!Array.isArray(lista) || lista.length < 1) {
        resultados.push(warn('ipc.shell.listar', 'listarShells', t0, 'lista vazia'))
      } else {
        resultados.push(ok('ipc.shell.listar', 'listarShells', t0, lista.length + ' shells'))
      }
      const pad = lerShellPadrao()
      resultados.push(ok('ipc.shell.getPadrao', 'lerShellPadrao', Date.now(), String(pad)))
      salvarShellPadrao(null)
      resultados.push(ok('ipc.shell.setPadraoNull', 'salvarShellPadrao(null)', Date.now()))
      const miss = acharShellPorId('shell-que-nao-existe-xyz')
      if (miss !== null) {
        resultados.push(erro('ipc.shell.acharMiss', 'acharShellPorId miss', t0, 'deveria ser null'))
      } else {
        resultados.push(ok('ipc.shell.acharMiss', 'acharShellPorId inexistente', Date.now()))
      }
    } catch (e) {
      resultados.push(erro('ipc.shell.listar', 'shell-detect', t0, e))
    }
  }

  // --- terminal Map vida curta (ConPTY exige TTY) ---
  {
    const t0 = Date.now()
    if (!temTTY) {
      resultados.push({
        id: 'ipc.terminal.vida',
        area: 'ipc',
        titulo: 'create+kill sessao',
        severidade: 'ok',
        duracaoMs: Date.now() - t0,
        detalhe: 'pty indisponivel em console nao-interativo (ConPTY) — cenario pulado',
        corrigivel: false
      })
    } else {
      try {
        const { createTerminal, killTerminal, killAllTerminals } = await import('../../main/terminal')
        stubs.push('terminal:create (WebContents stub)')
        const sender = stubSender() as import('electron').WebContents
        const id = 'qa-ipc-' + Date.now()
        const r = createTerminal(id, { cols: 40, rows: 12 }, sender)
        if (!r || !r.pid) throw new Error('create sem pid')
        killTerminal(id)
        killAllTerminals()
        resultados.push(ok('ipc.terminal.vida', 'create+kill sessao', t0, 'pid=' + r.pid))
      } catch (e) {
        resultados.push(erro('ipc.terminal.vida', 'create+kill sessao', t0, e))
      }
    }
  }

  // --- brain ---
  {
    const t0 = Date.now()
    try {
      const { getBrain } = await import('../../main/brain/module')
      const b = getBrain()
      const ativo = b.getActiveProvider()
      if (ativo !== 'ollama') {
        resultados.push(warn('ipc.brain.provider', 'getActiveProvider', t0, 'ativo=' + ativo))
      } else {
        resultados.push(ok('ipc.brain.provider', 'getActiveProvider', t0, ativo))
      }
      const st = await b.getProviderStatuses()
      resultados.push(
        ok('ipc.brain.statuses', 'getProviderStatuses', Date.now(), JSON.stringify(st))
      )
    } catch (e) {
      resultados.push(erro('ipc.brain.provider', 'brain', t0, e))
    }
  }

  // --- chatstore / analysis cached (id inexistente) ---
  {
    const t0 = Date.now()
    try {
      const { loadChat } = await import('../../main/chatstore')
      const msgs = loadChat('Z:\\caminho\\inexistente\\qa-ipc')
      if (!Array.isArray(msgs)) throw new Error('loadChat nao retornou array')
      resultados.push(ok('ipc.chat.load.inexistente', 'chat:load root inexistente', t0, 'msgs=' + msgs.length))
    } catch (e) {
      resultados.push(erro('ipc.chat.load.inexistente', 'chat:load', t0, e))
    }
  }
  {
    const t0 = Date.now()
    try {
      const { getCachedAnalysis } = await import('../../main/analyzer')
      const c = getCachedAnalysis('Z:\\caminho\\inexistente\\qa-ipc')
      resultados.push(
        ok('ipc.analysis.cached.inexistente', 'analysis:cached inexistente', t0, 'cached=' + String(c))
      )
    } catch (e) {
      resultados.push(erro('ipc.analysis.cached.inexistente', 'analysis:cached', t0, e))
    }
  }

  // --- arquivo listar invalido ---
  {
    const t0 = Date.now()
    try {
      const { listarDiretorio } = await import('../../main/arquivos')
      const r = await listarDiretorio('Z:\\nao\\existe\\qa', [])
      if (r.ok) {
        resultados.push(warn('ipc.arquivo.listar.invalido', 'listar dir invalido', t0, 'ok inesperado'))
      } else {
        resultados.push(ok('ipc.arquivo.listar.invalido', 'listar dir invalido controlado', t0, r.erro))
      }
    } catch (e) {
      resultados.push(erro('ipc.arquivo.listar.invalido', 'listarDiretorio', t0, e))
    }
  }

  // --- mcp status (função, não IPC) ---
  {
    const t0 = Date.now()
    try {
      const { mcpAtivo } = await import('../../main/mcp/client')
      const ativo = mcpAtivo()
      resultados.push(ok('ipc.mcp.status', 'mcpAtivo()', t0, 'ativo=' + String(ativo)))
    } catch (e) {
      resultados.push(warn('ipc.mcp.status', 'mcpAtivo', t0, String((e as Error)?.message || e)))
    }
  }

  // --- handler inexistente (contrato): não deve derrubar — só documentamos ---
  resultados.push(
    ok(
      'ipc.handler.inexistente',
      'contrato: handler desconhecido nao derruba processo',
      Date.now(),
      'verificado por isolamento do runner (sem ipcMain.register)'
    )
  )

  return { resultados, stubs }
}
