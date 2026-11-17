import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron'
import { exigirString, isErroPayload } from '../ipc-seguro'
import { devinStatus, devinCriarSessao, devinStatusSessao, devinListarSessoes } from '../devin-api'
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

  iniciarWatcherSessoesDevin()
}

// Watcher: poll a cada 60s e avisa a UI quando o status de uma sessão muda.
let watcherDevin: ReturnType<typeof setInterval> | null = null
const statusAnteriorDevin = new Map<string, string>()

function idStatusSessao(s: Record<string, unknown>): { id: string; status: string } | null {
  const id = String(s.session_id || s.id || s.sessionId || '')
  if (!id) return null
  return { id, status: String(s.status || s.state || '') }
}

export function iniciarWatcherSessoesDevin(): void {
  if (watcherDevin) return
  watcherDevin = setInterval(() => {
    void (async () => {
      try {
        const st = await devinStatus()
        if (!st?.ok || st.autenticado === false) return
        const r = await devinListarSessoes(20)
        if (!r.ok || !r.sessoes) return
        for (const s of r.sessoes) {
          const cur = idStatusSessao(s)
          if (!cur?.status) continue
          const ant = statusAnteriorDevin.get(cur.id)
          statusAnteriorDevin.set(cur.id, cur.status)
          if (ant && ant !== cur.status) {
            for (const win of BrowserWindow.getAllWindows()) {
              if (!win.isDestroyed()) {
                win.webContents.send('devin:sessao-mudou', {
                  sessionId: cur.id,
                  de: ant,
                  para: cur.status
                })
              }
            }
          }
        }
        // Limita o mapa para não crescer sem bound
        if (statusAnteriorDevin.size > 200) {
          const ids = r.sessoes.map((s) => idStatusSessao(s)?.id).filter(Boolean) as string[]
          for (const k of [...statusAnteriorDevin.keys()]) {
            if (!ids.includes(k)) statusAnteriorDevin.delete(k)
          }
        }
      } catch {
        /* offline ou sem credencial — tenta de novo no próximo tick */
      }
    })()
  }, 60_000)
  watcherDevin.unref?.()
}
