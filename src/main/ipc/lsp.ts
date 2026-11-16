import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { exigirString, isErroPayload } from '../ipc-seguro'
import { dglog } from '../dglog'
import { lspAbrir, lspFechar, lspHover, lspDefinicao, lspDiagnosticos } from '../lsp/ts-servico'

function num(v: unknown, padrao = 1): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : padrao
}

export function registrarHandlersLsp(): void {
  ipcMain.handle('lsp:abrir', async (_e: IpcMainInvokeEvent, payload: unknown): Promise<unknown> => {
    try {
      const o = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
      const raiz = exigirString(o.raiz, 'raiz')
      const arquivo = exigirString(o.arquivo, 'arquivo')
      if (isErroPayload(raiz) || isErroPayload(arquivo)) return { ok: false, erro: 'payload invalido' }
      const conteudo = typeof o.conteudo === 'string' ? o.conteudo : undefined
      lspAbrir(raiz, arquivo, conteudo)
      return { ok: true }
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('lsp:fechar', async (_e: IpcMainInvokeEvent, payload: unknown): Promise<unknown> => {
    try {
      const o = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
      const raiz = exigirString(o.raiz, 'raiz')
      const arquivo = exigirString(o.arquivo, 'arquivo')
      if (isErroPayload(raiz) || isErroPayload(arquivo)) return { ok: false, erro: 'payload invalido' }
      lspFechar(raiz, arquivo)
      return { ok: true }
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('lsp:hover', async (_e: IpcMainInvokeEvent, payload: unknown): Promise<unknown> => {
    try {
      const o = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
      const raiz = exigirString(o.raiz, 'raiz')
      const arquivo = exigirString(o.arquivo, 'arquivo')
      if (isErroPayload(raiz) || isErroPayload(arquivo)) return { ok: false, erro: 'payload invalido' }
      return lspHover(raiz, arquivo, num(o.linha), num(o.coluna))
    } catch (e) {
      dglog('[lsp:hover] ' + String(e))
      return { ok: false, erro: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('lsp:definicao', async (_e: IpcMainInvokeEvent, payload: unknown): Promise<unknown> => {
    try {
      const o = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
      const raiz = exigirString(o.raiz, 'raiz')
      const arquivo = exigirString(o.arquivo, 'arquivo')
      if (isErroPayload(raiz) || isErroPayload(arquivo)) return { ok: false, erro: 'payload invalido' }
      return lspDefinicao(raiz, arquivo, num(o.linha), num(o.coluna))
    } catch (e) {
      dglog('[lsp:definicao] ' + String(e))
      return { ok: false, erro: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('lsp:diagnosticos', async (_e: IpcMainInvokeEvent, payload: unknown): Promise<unknown> => {
    try {
      const o = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
      const raiz = exigirString(o.raiz, 'raiz')
      if (isErroPayload(raiz)) return { ok: false, erro: 'payload invalido' }
      const arquivo = typeof o.arquivo === 'string' && o.arquivo ? o.arquivo : undefined
      return lspDiagnosticos(raiz, arquivo)
    } catch (e) {
      dglog('[lsp:diagnosticos] ' + String(e))
      return { ok: false, itens: [], erro: e instanceof Error ? e.message : String(e) }
    }
  })
}
