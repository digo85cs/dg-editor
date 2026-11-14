/**
 * IPC de imagens de instalação (ISO/IMG/DMG) e gravação de USB inicializável.
 *
 * A escrita crua em pendrive é destrutiva: o destino é sempre reenumerado no
 * main (nunca confiamos no objeto enviado pelo renderer) e só discos USB/SD/MMC
 * que não sejam do sistema são aceitos, com confirmação pelo serial.
 */
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { obterRaizWorkspace } from '../workspace-raiz'
import { analisarImagem } from '../imagens/iso'
import {
  criarPastaOverlay,
  extrairIso,
  instalarSuporteIso,
  listarConteudoIso,
  reconstruirIso,
  suporteIso
} from '../imagens/personalizar'
import { gravarEmUsb, listarUnidadesUsb } from '../imagens/usb'
import type { RespostaMidia } from '../midia/core'

const arquivosAutorizados = new Set<string>()

type RaizOk = { ok: true; raiz: string } | { ok: false; erro: string }

function raizValida(payload: unknown): RaizOk {
  const cand = typeof payload === 'string' ? payload.trim() : ''
  const ativa = obterRaizWorkspace()
  const escolhida = cand || ativa || ''
  if (!escolhida) return { ok: false, erro: 'selecione uma pasta de trabalho antes de usar Imagens e ISO' }
  const abs = resolve(escolhida)
  if (!existsSync(abs)) return { ok: false, erro: 'pasta inexistente: ' + abs }
  if (ativa) {
    const rel = relative(resolve(ativa), abs)
    if (rel.startsWith('..') || isAbsolute(rel)) return { ok: false, erro: 'pasta fora do workspace ativo' }
  }
  return { ok: true, raiz: abs }
}

function entradaAutorizada(raiz: string, caminho: unknown): string | null {
  if (typeof caminho !== 'string' || !caminho.trim()) return 'informe a imagem'
  const abs = resolve(caminho.trim())
  if (!existsSync(abs)) return 'imagem não encontrada: ' + abs
  const rel = relative(raiz, abs)
  const dentro = !rel.startsWith('..') && !isAbsolute(rel)
  if (!dentro && !arquivosAutorizados.has(abs)) {
    return 'imagem fora do projeto — use "Escolher imagem" para autorizar'
  }
  return null
}

function objeto(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {}
}

function texto(v: unknown, max = 1000): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

function falha(erro: unknown): RespostaMidia {
  return { ok: false, erro: erro instanceof Error ? erro.message : String(erro) }
}

export function registrarHandlersImagens(): void {
  ipcMain.handle('imagens:escolher-imagem', async () => {
    try {
      const win = BrowserWindow.getFocusedWindow() || undefined
      const res = await dialog.showOpenDialog(win!, {
        title: 'Escolher imagem de instalação',
        properties: ['openFile'],
        filters: [
          { name: 'Imagens de instalação', extensions: ['iso', 'img', 'dmg'] },
          { name: 'Todos os arquivos', extensions: ['*'] }
        ]
      })
      if (res.canceled || !res.filePaths[0]) return { ok: true, cancelado: true }
      const caminho = resolve(res.filePaths[0])
      arquivosAutorizados.add(caminho)
      return { ok: true, cancelado: false, caminho }
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('imagens:analisar', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const caminho = texto(o.caminho)
      const bloqueio = entradaAutorizada(r.raiz, caminho)
      if (bloqueio) return { ok: false, erro: bloqueio }
      const abs = resolve(caminho)
      const analise = analisarImagem(abs)
      let bytes = analise.bytes
      if (!bytes) {
        try {
          bytes = statSync(abs).size
        } catch {
          bytes = 0
        }
      }
      return { ...analise, bytes }
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('imagens:listar-conteudo', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const entrada = texto(o.entrada)
      const bloqueio = entradaAutorizada(r.raiz, entrada)
      if (bloqueio) return { ok: false, erro: bloqueio }
      return await listarConteudoIso({
        entrada: resolve(entrada),
        limite: typeof o.limite === 'number' ? o.limite : undefined
      })
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('imagens:extrair', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const entrada = texto(o.entrada)
      const bloqueio = entradaAutorizada(r.raiz, entrada)
      if (bloqueio) return { ok: false, erro: bloqueio }
      return await extrairIso(r.raiz, { entrada: resolve(entrada), saida: texto(o.saida) || undefined })
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('imagens:reconstruir', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const entrada = texto(o.entrada)
      const bloqueio = entradaAutorizada(r.raiz, entrada)
      if (bloqueio) return { ok: false, erro: bloqueio }
      const overlay = texto(o.overlay)
      return await reconstruirIso(r.raiz, {
        entrada: resolve(entrada),
        overlay: overlay ? resolve(r.raiz, overlay) : undefined,
        saida: texto(o.saida) || undefined,
        rotulo: texto(o.rotulo, 32) || undefined
      })
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('imagens:overlay-pasta', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const pasta = criarPastaOverlay(r.raiz)
      return { ok: true, caminho: pasta.caminho, caminhoRel: pasta.caminhoRel }
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('imagens:abrir-overlay', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const pasta = criarPastaOverlay(r.raiz)
      const erro = await shell.openPath(pasta.caminho)
      return erro ? { ok: false, erro } : { ok: true, caminho: pasta.caminho, caminhoRel: pasta.caminhoRel }
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('imagens:suporte', async () => {
    try {
      return await suporteIso()
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('imagens:instalar-suporte', async () => {
    try {
      return await instalarSuporteIso()
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('imagens:usb-listar', async () => {
    try {
      return await listarUnidadesUsb()
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('imagens:usb-gravar', async (evento, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const imagem = texto(o.imagem)
      const bloqueio = entradaAutorizada(r.raiz, imagem)
      if (bloqueio) return { ok: false, erro: bloqueio }
      const disco = typeof o.disco === 'number' ? o.disco : -1
      const serial = texto(o.serial, 200)

      const lista = await listarUnidadesUsb()
      if (!lista.ok) return { ok: false, erro: lista.erro || 'não foi possível listar as unidades' }
      const unidade = lista.unidades.find((u) => u.disco === disco && (u.serial || '') === serial)
      if (!unidade) {
        return { ok: false, erro: 'unidade não encontrada — recarregue a lista e confirme o disco novamente' }
      }
      if (!unidade.podeGravar) {
        return { ok: false, erro: unidade.motivo || 'a unidade selecionada não pode ser gravada' }
      }
      const remetente = evento.sender
      const r2 = await gravarEmUsb(
        unidade,
        { imagem: resolve(imagem), confirmacao: texto(o.confirmacao, 200), verificar: o.verificar !== false },
        (p) => {
          if (!remetente.isDestroyed()) {
            remetente.send('imagens:usb-progresso', { disco: unidade.disco, ...p })
          }
        }
      )
      return { ...r2, disco: unidade.disco, token: unidade.token }
    } catch (e) {
      return falha(e)
    }
  })
}
