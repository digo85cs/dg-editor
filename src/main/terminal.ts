/**
 * Gerenciador de sessões PTY (node-pty) para o terminal embutido.
 */
import type { WebContents } from 'electron'
import { dglog } from './dglog'
import {
  acharShellPorId,
  getShellCache,
  listarCandidatosShell,
  type ShellInfo
} from './shell-detect'

export interface TerminalOpts {
  cwd?: string
  cols?: number
  rows?: number
  shellExe?: string
  /** Preferência sobre shellExe; resolve via listarShells/acharShellPorId. */
  shellId?: string
}

type PtyProc = {
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
  pid: number
  onData: (cb: (data: string) => void) => void
  onExit: (cb: (e: { exitCode: number }) => void) => void
}

interface Sessao {
  pty: PtyProc
  shell: ShellInfo
  sender: WebContents
}

const sessoes = new Map<string, Sessao>()

function carregarPty(): typeof import('node-pty') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node-pty') as typeof import('node-pty')
}

function candidatosParaOpts(opts: TerminalOpts): ShellInfo[] {
  const todos = listarCandidatosShell()
  if (opts.shellId) {
    const op = acharShellPorId(opts.shellId)
    if (op) {
      const preferred: ShellInfo = {
        exe: op.exe,
        args: op.args,
        versao: op.id.replace(/^pwsh-preview-|^pwsh-|^powershell-/, '') || null,
        tipo: op.tipo,
        origem: 'shellId'
      }
      if (op.tipo === 'cmd') preferred.versao = null
      return [preferred, ...todos.filter((s) => s.exe.toLowerCase() !== preferred.exe.toLowerCase())]
    }
    dglog(`[terminal] shellId '${opts.shellId}' nao encontrado — fallback padrao`)
  }
  if (opts.shellExe) {
    const hit = todos.find((s) => s.exe.toLowerCase() === opts.shellExe!.toLowerCase())
    const preferred = hit || {
      exe: opts.shellExe,
      args: opts.shellExe.toLowerCase().includes('cmd') ? [] : ['-NoLogo'],
      versao: null,
      tipo: 'pwsh' as const,
      origem: 'opts'
    }
    return [preferred, ...todos.filter((s) => s.exe.toLowerCase() !== preferred.exe.toLowerCase())]
  }
  const cache = getShellCache()
  return [cache, ...todos.filter((s) => s.exe.toLowerCase() !== cache.exe.toLowerCase())]
}

export function createTerminal(
  id: string,
  opts: TerminalOpts,
  sender: WebContents
): { shell: ShellInfo; pid: number } {
  if (sessoes.has(id)) {
    killTerminal(id)
  }

  const pty = carregarPty()
  const cols = opts.cols || 80
  const rows = opts.rows || 24
  const cwd = opts.cwd || process.cwd()
  const env = { ...process.env, TERM: 'xterm-256color' } as Record<string, string>

  let lastErr: unknown = null
  for (const shell of candidatosParaOpts(opts)) {
    try {
      const proc = pty.spawn(shell.exe, shell.args, {
        name: 'xterm-color',
        cols,
        rows,
        cwd,
        env
      }) as unknown as PtyProc

      const sess: Sessao = { pty: proc, shell, sender }
      sessoes.set(id, sess)

      proc.onData((data: string) => {
        if (sender.isDestroyed()) return
        sender.send('terminal:data', { id, data })
      })
      proc.onExit(({ exitCode }: { exitCode: number }) => {
        sessoes.delete(id)
        if (!sender.isDestroyed()) sender.send('terminal:exit', { id, code: exitCode })
      })

      const onDestroyed = () => {
        killTerminal(id)
      }
      sender.once('destroyed', onDestroyed)

      dglog(`[terminal] sessão ${id} pid=${proc.pid} shell=${shell.tipo} ${shell.versao || ''}`)
      return { shell, pid: proc.pid }
    } catch (e) {
      lastErr = e
      dglog(`[terminal] spawn falhou (${shell.exe}): ${String((e as Error).message || e)}`)
    }
  }

  throw new Error('Nenhum shell disponivel para o terminal: ' + String((lastErr as Error)?.message || lastErr))
}

export function writeTerminal(id: string, data: string): void {
  const s = sessoes.get(id)
  if (!s) return
  s.pty.write(data)
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  const s = sessoes.get(id)
  if (!s) return
  if (cols > 0 && rows > 0) s.pty.resize(cols, rows)
}

export function killTerminal(id: string): void {
  const s = sessoes.get(id)
  if (!s) return
  sessoes.delete(id)
  try {
    s.pty.kill()
  } catch {
    /* ignora */
  }
}

export function killAllTerminals(): void {
  for (const id of [...sessoes.keys()]) killTerminal(id)
}

export function shellAtivo(): ShellInfo {
  return getShellCache()
}
