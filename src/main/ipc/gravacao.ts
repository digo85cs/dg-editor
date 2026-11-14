/**
 * IPC do gravador de tela (estilo OBS, versão mínima).
 * Fontes via desktopCapturer; gravação em chunks WebM vinda do renderer.
 */
import { desktopCapturer, ipcMain, shell } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { isAbsolute, relative, resolve } from 'path'
import { obterRaizWorkspace } from '../workspace-raiz'
import {
  anexarChunk,
  cancelarGravacao,
  converterParaMp4,
  finalizarGravacao,
  iniciarGravacao,
  listarGravacoes,
  pastaGravacoes
} from '../gravacao'

type RaizOk = { ok: true; raiz: string } | { ok: false; erro: string }

function raizValida(payload: unknown): RaizOk {
  const cand = typeof payload === 'string' ? payload.trim() : ''
  const ativa = obterRaizWorkspace()
  const escolhida = cand || ativa || ''
  if (!escolhida) return { ok: false, erro: 'selecione uma pasta de trabalho antes de gravar a tela' }
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

export function registrarHandlersGravacao(): void {
  ipcMain.handle('gravacao:fontes', async () => {
    try {
      const fontes = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true
      })
      return {
        ok: true,
        fontes: fontes.map((f) => ({
          id: f.id,
          nome: f.name,
          tipo: f.id.startsWith('screen:') ? 'tela' : 'janela',
          thumb: f.thumbnail && !f.thumbnail.isEmpty() ? f.thumbnail.toDataURL() : undefined
        }))
      }
    } catch (e) {
      return { ok: false, erro: String((e as Error).message || e), fontes: [] }
    }
  })

  ipcMain.handle('gravacao:iniciar', async (_e, payload?: unknown) => {
    const p = objeto(payload)
    const r = raizValida(p.raiz)
    if (!r.ok) return r
    const nome = typeof p.nome === 'string' ? p.nome : undefined
    return { ok: true, ...iniciarGravacao(r.raiz, nome), raiz: r.raiz }
  })

  ipcMain.handle('gravacao:chunk', async (_e, payload?: unknown) => {
    const p = objeto(payload)
    const id = typeof p.id === 'string' ? p.id : ''
    if (!id) return { ok: false, erro: 'sessão inválida' }
    const bruto = p.dados
    let dados: Uint8Array
    if (bruto instanceof Uint8Array) dados = bruto
    else if (bruto instanceof ArrayBuffer) dados = new Uint8Array(bruto)
    else return { ok: false, erro: 'dados inválidos' }
    return await anexarChunk(id, dados)
  })

  ipcMain.handle('gravacao:finalizar', async (_e, payload?: unknown) => {
    const p = objeto(payload)
    const id = typeof p.id === 'string' ? p.id : ''
    const r = raizValida(p.raiz)
    if (!r.ok) return r
    const fim = await finalizarGravacao(id)
    if (!fim.ok) return fim
    return { ...fim, caminhoRel: relative(r.raiz, fim.caminho).replace(/\\/g, '/') }
  })

  ipcMain.handle('gravacao:cancelar', async (_e, payload?: unknown) => {
    const p = objeto(payload)
    const id = typeof p.id === 'string' ? p.id : ''
    await cancelarGravacao(id)
    return { ok: true }
  })

  ipcMain.handle('gravacao:listar', async (_e, payload?: unknown) => {
    const p = objeto(payload)
    const r = raizValida(p.raiz)
    if (!r.ok) return { ...r, gravacoes: [] }
    return { ok: true, gravacoes: listarGravacoes(r.raiz), pasta: pastaGravacoes(r.raiz) }
  })

  ipcMain.handle('gravacao:converter', async (_e, payload?: unknown) => {
    const p = objeto(payload)
    const r = raizValida(p.raiz)
    if (!r.ok) return r
    const entrada = typeof p.entrada === 'string' ? p.entrada.trim() : ''
    if (!entrada) return { ok: false, erro: 'informe a gravação' }
    const abs = isAbsolute(entrada) ? resolve(entrada) : resolve(r.raiz, entrada)
    return await converterParaMp4(r.raiz, {
      entrada: abs,
      crf: typeof p.crf === 'number' ? p.crf : undefined,
      escala: typeof p.escala === 'number' ? p.escala : undefined
    })
  })

  ipcMain.handle('gravacao:abrir-pasta', async (_e, payload?: unknown) => {
    const p = objeto(payload)
    const r = raizValida(p.raiz)
    if (!r.ok) return r
    const pasta = pastaGravacoes(r.raiz)
    mkdirSync(pasta, { recursive: true })
    const erro = await shell.openPath(pasta)
    return erro ? { ok: false, erro } : { ok: true, pasta }
  })
}
