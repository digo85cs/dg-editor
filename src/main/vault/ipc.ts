import { dialog, ipcMain, BrowserWindow } from 'electron'
import { resolve } from 'path'
import { exigirString, isErroPayload, caminhoSeguro } from '../ipc-seguro'
import {
  backlinksDe,
  estadoVault,
  fecharIndice,
  getRaizVault,
  indexarVaultCompleto,
  indiceTags,
  listarResumos,
  marcarWriteProprio,
  obterNota,
  grafoVault,
  reindexarNota,
  resolverWikiLink
} from './indice'
import { iniciarWatchVault, pararWatchVault } from './watch'
import { detectarEol } from '../fs-atomico'
import { salvarNotaAtomica } from './io'
import { dglog } from '../dglog'

function pastasComVault(pastas: string[]): string[] {
  const raiz = getRaizVault()
  const set = new Set(pastas.map((p) => resolve(p)))
  if (raiz) set.add(raiz)
  return [...set]
}

export function registerVaultIpc(): void {
  ipcMain.handle('vault:abrir', async (e, pathOpt?: unknown) => {
    let raiz: string | null = null
    if (typeof pathOpt === 'string' && pathOpt.trim()) {
      raiz = resolve(pathOpt.trim())
    } else {
      const win = BrowserWindow.fromWebContents(e.sender)
      const opts = {
        title: 'Abrir vault Markdown',
        properties: ['openDirectory' as const]
      }
      const r = win
        ? await dialog.showOpenDialog(win, opts)
        : await dialog.showOpenDialog(opts)
      if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true }
      raiz = r.filePaths[0]
    }
    pararWatchVault()
    const idx = await indexarVaultCompleto(raiz)
    if (!idx.ok) return { ok: false, erro: idx.erro }
    iniciarWatchVault(raiz)
    dglog(`[vault] aberto raiz=${raiz} notas=${idx.total}`)
    return { ok: true, raiz, total: idx.total, estado: estadoVault() }
  })

  ipcMain.handle('vault:fechar', async () => {
    pararWatchVault()
    fecharIndice()
    return { ok: true, estado: estadoVault() }
  })

  ipcMain.handle('vault:estado', async () => estadoVault())

  ipcMain.handle('vault:listar', async () => {
    if (!getRaizVault()) return { ok: false, erro: 'vault fechado', notas: [] }
    return { ok: true, notas: listarResumos() }
  })

  ipcMain.handle('vault:resolver-link', async (_e, alvo: unknown, origem?: unknown) => {
    const a = exigirString(alvo, 'alvo')
    if (isErroPayload(a)) return a
    const o = typeof origem === 'string' ? origem : undefined
    const path = resolverWikiLink(a, o)
    return { ok: true, path }
  })

  ipcMain.handle('vault:backlinks', async (_e, caminho: unknown) => {
    const c = exigirString(caminho, 'caminho')
    if (isErroPayload(c)) return c
    return { ok: true, backlinks: backlinksDe(c) }
  })

  ipcMain.handle('vault:tags', async () => {
    if (!getRaizVault()) return { ok: false, erro: 'vault fechado', tags: {} }
    return { ok: true, tags: indiceTags() }
  })

  ipcMain.handle('vault:grafo', async (_e, limite?: unknown) => {
    if (!getRaizVault()) {
      return { ok: false, erro: 'vault fechado', nos: [], arestas: [], totalNotas: 0, truncado: false }
    }
    const lim =
      typeof limite === 'number' && Number.isFinite(limite)
        ? Math.min(2000, Math.max(10, Math.round(limite)))
        : undefined
    return { ok: true, ...grafoVault(lim) }
  })

  ipcMain.handle('vault:nota', async (_e, caminho: unknown) => {
    const c = exigirString(caminho, 'caminho')
    if (isErroPayload(c)) return c
    const n = obterNota(c)
    if (!n) return { ok: false, erro: 'nota nao indexada' }
    return { ok: true, nota: n }
  })

  ipcMain.handle(
    'vault:salvar',
    async (_e, caminho: unknown, conteudo: unknown, pastas: unknown, eolOpt?: unknown) => {
      const c = exigirString(caminho, 'caminho')
      if (isErroPayload(c)) return c
      const body = exigirString(conteudo, 'conteudo')
      if (isErroPayload(body)) return body
      const pastasArr = Array.isArray(pastas)
        ? pastas.filter((x): x is string => typeof x === 'string')
        : []
      const permitidas = pastasComVault(pastasArr)
      const seg = caminhoSeguro(c, permitidas)
      if (!seg.ok) return { ok: false, erro: seg.erro }

      const existente = obterNota(seg.abs)
      const eol =
        eolOpt === 'crlf' || eolOpt === 'lf'
          ? eolOpt
          : existente?.eol || detectarEol(body)

      try {
        marcarWriteProprio(seg.abs)
        await salvarNotaAtomica(seg.abs, body, eol)
        await reindexarNota(seg.abs)
        return { ok: true, nota: obterNota(seg.abs) }
      } catch (err) {
        return { ok: false, erro: String((err as Error).message || err) }
      }
    }
  )
}
