/** IPC do compartilhamento local de arquivos (estilo AirDrop via navegador). */
import { ipcMain, shell } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { isAbsolute, relative, resolve } from 'path'
import { obterRaizWorkspace } from '../workspace-raiz'
import {
  iniciarCompartilhamento,
  listarRecebidos,
  pararCompartilhamento,
  pastaRecebidos,
  statusCompartilhamento
} from '../compartilhar'

type RaizOk = { ok: true; raiz: string } | { ok: false; erro: string }

function raizValida(payload: unknown): RaizOk {
  const cand = typeof payload === 'string' ? payload.trim() : ''
  const ativa = obterRaizWorkspace()
  const escolhida = cand || ativa || ''
  if (!escolhida) return { ok: false, erro: 'selecione uma pasta de trabalho antes de compartilhar' }
  const abs = resolve(escolhida)
  if (!existsSync(abs)) return { ok: false, erro: 'pasta inexistente: ' + abs }
  if (ativa) {
    const rel = relative(resolve(ativa), abs)
    if (rel.startsWith('..') || isAbsolute(rel)) return { ok: false, erro: 'pasta fora do workspace ativo' }
  }
  return { ok: true, raiz: abs }
}

function objeto(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {}
}

export function registrarHandlersCompartilhar(): void {
  ipcMain.handle('compartilhar:iniciar', async (_e, payload?: unknown) => {
    const p = objeto(payload)
    const r = raizValida(p.raiz)
    if (!r.ok) return r
    const porta = typeof p.porta === 'number' ? p.porta : undefined
    return await iniciarCompartilhamento(r.raiz, { porta })
  })

  ipcMain.handle('compartilhar:parar', async () => pararCompartilhamento())

  ipcMain.handle('compartilhar:status', async (_e, payload?: unknown) => {
    const p = objeto(payload)
    const r = raizValida(p.raiz)
    if (!r.ok) return { ...r, ativo: false, recebidos: 0 }
    return statusCompartilhamento(r.raiz)
  })

  ipcMain.handle('compartilhar:listar', async (_e, payload?: unknown) => {
    const p = objeto(payload)
    const r = raizValida(p.raiz)
    if (!r.ok) return { ...r, recebidos: [] }
    return { ok: true, recebidos: listarRecebidos(r.raiz) }
  })

  ipcMain.handle('compartilhar:abrir-pasta', async (_e, payload?: unknown) => {
    const p = objeto(payload)
    const r = raizValida(p.raiz)
    if (!r.ok) return r
    const pasta = pastaRecebidos(r.raiz)
    mkdirSync(pasta, { recursive: true })
    const erro = await shell.openPath(pasta)
    return erro ? { ok: false, erro } : { ok: true, pasta }
  })
}
