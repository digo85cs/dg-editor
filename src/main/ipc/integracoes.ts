import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron'
import { exigirString, isErroPayload } from '../ipc-seguro'
import { dglog } from '../dglog'
import { salvarChave, removerChave, listarChavesConfiguradas, lerChave } from '../brain/segredos-providers'
import {
  adicionarJob,
  alternarJob,
  listarJobs,
  registrarEmissorAgendador,
  removerJob
} from '../agendador'
import { criarWorktreeCheckpoint, removerWorktreeCheckpoint } from '../git-worktree'

export function registrarHandlersIntegracoes(): void {
  // ---------- Credenciais (vault safeStorage) ----------
  ipcMain.handle('credenciais:listar', async (): Promise<unknown> => {
    try {
      return { ok: true, itens: listarChavesConfiguradas().sort() }
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('credenciais:definir', async (_e: IpcMainInvokeEvent, payload: unknown): Promise<unknown> => {
    try {
      const o = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
      const id = exigirString(o.id, 'id')
      const chave = exigirString(o.chave, 'chave')
      if (isErroPayload(id) || isErroPayload(chave)) return { ok: false, erro: 'payload invalido' }
      const r = salvarChave(id, chave)
      return r.ok ? { ok: true } : { ok: false, erro: r.erro }
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('credenciais:remover', async (_e: IpcMainInvokeEvent, payload: unknown): Promise<unknown> => {
    try {
      const o = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
      const id = exigirString(o.id, 'id')
      if (isErroPayload(id)) return { ok: false, erro: 'payload invalido' }
      return removerChave(id)
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) }
    }
  })

  // ---------- Agendador ----------
  registrarEmissorAgendador(({ prompt, raiz, jobId }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('agendador:disparo', { prompt, raiz, jobId })
    }
  })

  ipcMain.handle('agendador:listar', async (): Promise<unknown> => ({ ok: true, itens: listarJobs() }))

  ipcMain.handle('agendador:adicionar', async (_e: IpcMainInvokeEvent, payload: unknown): Promise<unknown> => {
    try {
      const o = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
      const prompt = exigirString(o.prompt, 'prompt')
      const raiz = exigirString(o.raiz, 'raiz')
      if (isErroPayload(prompt) || isErroPayload(raiz)) return { ok: false, erro: 'payload invalido' }
      const cadaMin = Math.max(5, Number(o.cadaMin) || 60)
      return { ok: true, job: adicionarJob({ prompt, cadaMin, raiz }) }
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('agendador:remover', async (_e: IpcMainInvokeEvent, payload: unknown): Promise<unknown> => {
    try {
      const o = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
      const id = exigirString(o.id, 'id')
      if (isErroPayload(id)) return { ok: false, erro: 'payload invalido' }
      return { ok: removerJob(id) }
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('agendador:alternar', async (_e: IpcMainInvokeEvent, payload: unknown): Promise<unknown> => {
    try {
      const o = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
      const id = exigirString(o.id, 'id')
      if (isErroPayload(id)) return { ok: false, erro: 'payload invalido' }
      const j = alternarJob(id)
      return j ? { ok: true, job: j } : { ok: false, erro: 'job não encontrado' }
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) }
    }
  })

  // ---------- Agente paralelo em worktree ----------
  ipcMain.handle('agente:paralelo-criar', async (_e: IpcMainInvokeEvent, payload: unknown): Promise<unknown> => {
    try {
      const o = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
      const raiz = exigirString(o.raiz, 'raiz')
      const nome = typeof o.nome === 'string' && o.nome.trim() ? o.nome.trim() : undefined
      if (isErroPayload(raiz)) return { ok: false, erro: 'payload invalido' }
      return await criarWorktreeCheckpoint(raiz, nome || 'paralelo-' + Date.now().toString(36))
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('agente:paralelo-remover', async (_e: IpcMainInvokeEvent, payload: unknown): Promise<unknown> => {
    try {
      const o = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
      const raiz = exigirString(o.raiz, 'raiz')
      const nome = exigirString(o.nome, 'nome')
      if (isErroPayload(raiz) || isErroPayload(nome)) return { ok: false, erro: 'payload invalido' }
      return await removerWorktreeCheckpoint(raiz, nome)
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) }
    }
  })

  // expõe leitura controlada para diagnóstico (nunca retorna o valor)
  ipcMain.handle('credenciais:tem', async (_e: IpcMainInvokeEvent, payload: unknown): Promise<unknown> => {
    try {
      const o = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
      const id = exigirString(o.id, 'id')
      if (isErroPayload(id)) return { ok: false, erro: 'payload invalido' }
      return { ok: true, tem: Boolean(lerChave(id)) }
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) }
    }
  })
}
