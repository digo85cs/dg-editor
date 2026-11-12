/**
 * IPC da automação allowlist (Office COM / Browser Bloco3+CDP / Windows).
 */
import { ipcMain } from 'electron'
import { dglog } from '../dglog'
import { listarComandos, obterComando } from '../automation/allowlist'
import { executar, resolverAprovacao } from '../automation/guard'

export function registrarHandlersAutomation(): void {
  ipcMain.handle('automation:listar', () => {
    return {
      ok: true,
      comandos: listarComandos().map((c) => ({
        id: c.id,
        dominio: c.dominio,
        descricao: c.descricao,
        risco: c.risco,
        nivelAprovacao: c.nivelAprovacao,
        requerAprovacao: c.requerAprovacao
      }))
    }
  })

  ipcMain.handle(
    'automation:executar',
    async (
      event,
      comandoId: unknown,
      args?: unknown
    ): Promise<{ ok: boolean; resultado?: unknown; erro?: string; auditId?: string }> => {
      const id = String(comandoId || '').trim()
      if (!id || !obterComando(id)) {
        return { ok: false, erro: 'comando nao autorizado: ' + id }
      }
      const argsObj =
        args && typeof args === 'object' && !Array.isArray(args)
          ? (args as Record<string, unknown>)
          : {}
      const win = event.sender && !event.sender.isDestroyed() ? event.sender : null
      const janelaId = win
        ? require('electron').BrowserWindow.fromWebContents(win)?.id
        : undefined
      dglog('[automation:ipc] executar ' + id)
      return await executar(id, argsObj, { origem: 'ipc', janelaId })
    }
  )

  ipcMain.handle(
    'automation:aprovacao-resolver',
    (_e, payload: unknown): { ok: boolean; erro?: string } => {
      if (!payload || typeof payload !== 'object') return { ok: false, erro: 'payload invalido' }
      const p = payload as { id?: string; aprovado?: boolean; confirmacao?: string }
      if (!p.id) return { ok: false, erro: 'id ausente' }
      const ok = resolverAprovacao({
        id: String(p.id),
        aprovado: !!p.aprovado,
        confirmacao: p.confirmacao ? String(p.confirmacao) : undefined
      })
      return ok ? { ok: true } : { ok: false, erro: 'aprovacao nao encontrada ou expirada' }
    }
  )

  dglog('[ipc] automation handlers ok')
}
