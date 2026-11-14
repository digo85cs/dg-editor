/**
 * IPC do clipboard rico: converte HTML copiado (Notion, navegador, Word)
 * em Markdown limpo para colar no editor.
 */
import { clipboard, ipcMain } from 'electron'
import { lerClipboardMarkdown } from '../clipboard/markdown'

export function registrarHandlersClipboard(): void {
  ipcMain.handle('clipboard:colar-markdown', async () => {
    try {
      return lerClipboardMarkdown(
        () => clipboard.readHTML(),
        () => clipboard.readText()
      )
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('clipboard:gravar', async (_e, payload?: unknown) => {
    try {
      const o =
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {}
      const texto = typeof o.texto === 'string' ? o.texto.slice(0, 2_000_000) : ''
      const html = typeof o.html === 'string' ? o.html.slice(0, 2_000_000) : ''
      if (!texto && !html) return { ok: false, erro: 'informe texto ou html' }
      if (html) clipboard.write({ text: texto, html })
      else clipboard.writeText(texto)
      return { ok: true, caracteres: texto.length }
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) }
    }
  })
}
