import { ipcMain } from 'electron'
import { diagnosticoPortabilidade } from '../portabilidade'

export function registrarHandlersPortabilidade(): void {
  ipcMain.handle('diag:portabilidade', async () => {
    try {
      return await diagnosticoPortabilidade()
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e), itens: [], resumo: { total: 0, ok: 0, falhasObrigatorias: ['diagnóstico'], avisos: [] }, embutido: false }
    }
  })
}
