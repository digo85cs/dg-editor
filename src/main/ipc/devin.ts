import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { exigirString, isErroPayload } from '../ipc-seguro'
import { devinStatus, devinCriarSessao, devinStatusSessao } from '../devin-api'
import { dglog } from '../dglog'

export function registrarHandlersDevin(): void {
  ipcMain.handle('devin:status', async (): Promise<unknown> => {
    try {
      return await devinStatus()
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle(
    'devin:sessao-criar',
    async (_e: IpcMainInvokeEvent, payload: unknown): Promise<unknown> => {
      try {
        const o = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
        const prompt = exigirString(o.prompt, 'prompt')
        if (isErroPayload(prompt)) return { ok: false, erro: prompt.erro }
        const titulo = typeof o.titulo === 'string' ? o.titulo : undefined
        return await devinCriarSessao(prompt, { titulo })
      } catch (e) {
        dglog('[devin:sessao-criar] ' + String(e))
        return { ok: false, erro: e instanceof Error ? e.message : String(e) }
      }
    }
  )

  ipcMain.handle(
    'devin:sessao-status',
    async (_e: IpcMainInvokeEvent, payload: unknown): Promise<unknown> => {
      try {
        const o = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
        const id = exigirString(o.sessionId ?? o.id, 'sessionId')
        if (isErroPayload(id)) return { ok: false, erro: id.erro }
        return await devinStatusSessao(id)
      } catch (e) {
        dglog('[devin:sessao-status] ' + String(e))
        return { ok: false, erro: e instanceof Error ? e.message : String(e) }
      }
    }
  )
}
