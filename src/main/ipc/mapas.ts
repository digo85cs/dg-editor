/**
 * Handlers IPC dos mapas mentais (estilo MindNode).
 * Os arquivos ficam em `.dg-editor/mapas` dentro do workspace ativo.
 */
import { ipcMain } from 'electron'
import { existsSync } from 'fs'
import { isAbsolute, relative, resolve } from 'path'
import { obterRaizWorkspace } from '../workspace-raiz'
import { carregarMapa, excluirMapa, listarMapas, salvarMapa } from '../mapas/arquivo'
import { parseOutline } from '../mapas/outline'
import { svgMapa } from '../mapas/svg'

function objeto(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {}
}

function texto(v: unknown, max = 200000): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

function raizValida(payload: unknown): { ok: true; raiz: string } | { ok: false; erro: string } {
  const cand = typeof payload === 'string' ? payload.trim() : ''
  const ativa = obterRaizWorkspace()
  const escolhida = cand || ativa || ''
  if (!escolhida) return { ok: false, erro: 'selecione uma pasta de trabalho antes de usar mapas mentais' }
  const abs = resolve(escolhida)
  if (!existsSync(abs)) return { ok: false, erro: 'pasta inexistente: ' + abs }
  if (ativa) {
    const rel = relative(resolve(ativa), abs)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return { ok: false, erro: 'pasta fora do workspace ativo' }
    }
  }
  return { ok: true, raiz: abs }
}

function falha(e: unknown): { ok: false; erro: string } {
  return { ok: false, erro: e instanceof Error ? e.message : String(e) }
}

export function registrarHandlersMapas(): void {
  ipcMain.handle('mapas:listar', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      return { ok: true, mapas: listarMapas(r.raiz) }
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('mapas:carregar', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      return await carregarMapa(r.raiz, texto(o.nome, 120))
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('mapas:salvar', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      return await salvarMapa(r.raiz, texto(o.nome, 120), texto(o.outline, 300000))
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('mapas:excluir', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      return excluirMapa(r.raiz, texto(o.nome, 120))
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('mapas:svg', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const arvore = parseOutline(texto(o.outline, 300000))
      if (!arvore) return { ok: false, erro: 'outline vazio' }
      const resultado = svgMapa(arvore, {
        titulo: texto(o.titulo, 200) || undefined,
        fundo: texto(o.fundo, 30) || '#ffffff'
      })
      return { ok: true, ...resultado }
    } catch (e) {
      return falha(e)
    }
  })
}
