/**
 * Diálogos temáticos via renderer (Parity UX) — evita MessageBox nativo do Windows.
 */
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { randomBytes } from 'crypto'

type DialogOpts = {
  title?: string
  message: string
  detail?: string
  type?: 'info' | 'warning' | 'question' | 'error'
  buttons: string[]
  defaultId?: number
  cancelId?: number
}

const pending = new Map<string, (n: number) => void>()
let wired = false

export function registrarDialogUi(): void {
  if (wired) return
  wired = true
  ipcMain.handle('ui:dialog-responder', (_e, payload: unknown) => {
    const o = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const id = typeof o.id === 'string' ? o.id : ''
    const response = typeof o.response === 'number' ? o.response : Number(o.response) || 0
    const fn = pending.get(id)
    if (fn) {
      pending.delete(id)
      fn(response)
    }
    return { ok: true }
  })
}

export async function perguntarDialogo(
  win: BrowserWindow | null | undefined,
  opts: DialogOpts
): Promise<number> {
  const cancelId = opts.cancelId ?? Math.max(0, opts.buttons.length - 1)
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
    const r = await dialog.showMessageBox({
      type: opts.type === 'warning' ? 'warning' : opts.type === 'error' ? 'error' : 'question',
      title: opts.title || 'DG Editor',
      message: opts.message,
      detail: opts.detail,
      buttons: opts.buttons,
      defaultId: opts.defaultId ?? 0,
      cancelId,
      noLink: true
    })
    return r.response
  }

  return new Promise((resolve) => {
    const id = randomBytes(6).toString('hex')
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        resolve(cancelId)
      }
    }, 120_000)
    pending.set(id, (n) => {
      clearTimeout(timer)
      resolve(n)
    })
    try {
      win.webContents.send('ui:dialog-pedir', {
        id,
        title: opts.title || 'DG Editor',
        message: opts.message,
        detail: opts.detail,
        type: opts.type || 'question',
        buttons: opts.buttons,
        defaultId: opts.defaultId ?? 0,
        cancelId
      })
    } catch {
      clearTimeout(timer)
      pending.delete(id)
      resolve(cancelId)
    }
  })
}
