import { ipcMain } from 'electron'
import { indexarSimbolos, buscarSimbolo } from './simbolos'

export function registrarSimbolosIpc() {
  ipcMain.handle('simbolos:indexar', async (_e, raiz: string) => {
    const lista = await indexarSimbolos(raiz, true)
    return { ok: true, total: lista.length }
  })
  ipcMain.handle('simbolos:buscar', (_e, raiz: string, nome: string) => {
    const res = buscarSimbolo(raiz, nome)
    return { ok: true, itens: res }
  })
}
