/**
 * IPC da análise de engenharia reversa local (inspirada no REA, MIT).
 * Tudo roda offline; alvos de arquivo ficam restritos ao workspace aberto.
 */
import { ipcMain, shell, dialog, BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { isAbsolute, join, relative, resolve } from 'path'
import { obterRaizWorkspace } from '../workspace-raiz'
import { caminhoDentroDaRaiz } from '../paths'
import {
  analisarArquivo,
  analisarUrl,
  detectarFerramentasReversa,
  extrairAsar,
  extrairStrings,
  salvarRelatorioReversa
} from '../reversa'

/** Arquivos escolhidos no diálogo — o usuário autorizou explicitamente a análise. */
const autorizados = new Set<string>()

type RaizOk = { ok: true; raiz: string } | { ok: false; erro: string }

function raizValida(payload: unknown): RaizOk {
  const cand = typeof payload === 'string' ? payload.trim() : ''
  const ativa = obterRaizWorkspace()
  const escolhida = cand || ativa || ''
  if (!escolhida) return { ok: false, erro: 'selecione uma pasta de trabalho antes de analisar' }
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

function alvoValido(raiz: string, entrada: unknown): { ok: true; abs: string } | { ok: false; erro: string } {
  const texto = typeof entrada === 'string' ? entrada.trim() : ''
  if (!texto) return { ok: false, erro: 'informe o arquivo ou pasta alvo' }
  if (isAbsolute(texto)) {
    const abs = resolve(texto)
    if (!existsSync(abs)) return { ok: false, erro: 'alvo não encontrado: ' + abs }
    if (!autorizados.has(abs)) return { ok: false, erro: 'alvo fora do workspace; use "Escolher arquivo" para autorizar' }
    return { ok: true, abs }
  }
  try {
    const abs = caminhoDentroDaRaiz(raiz, texto).abs
    if (!existsSync(abs)) return { ok: false, erro: 'alvo não encontrado: ' + abs }
    return { ok: true, abs }
  } catch {
    return { ok: false, erro: 'alvo deve estar dentro do workspace aberto' }
  }
}

function pastaReversa(raiz: string): string {
  return caminhoDentroDaRaiz(raiz, join('.dg-editor', 'reversa')).abs
}

export function registrarHandlersReversa(): void {
  ipcMain.handle('reversa:escolher', async () => {
    try {
      const win = BrowserWindow.getFocusedWindow() || undefined
      const res = await dialog.showOpenDialog(win!, {
        title: 'Escolher arquivo ou pasta para analisar',
        properties: ['openFile', 'openDirectory'],
        filters: [
          { name: 'Binários e pacotes', extensions: ['exe', 'dll', 'sys', 'so', 'dylib', 'asar', 'jar', 'apk', 'node'] },
          { name: 'Todos os arquivos', extensions: ['*'] }
        ]
      })
      if (res.canceled || !res.filePaths[0]) return { ok: true, cancelado: true, caminho: '' }
      const abs = resolve(res.filePaths[0])
      autorizados.add(abs)
      return { ok: true, cancelado: false, caminho: abs }
    } catch (e) {
      return { ok: false, erro: String((e as Error).message || e) }
    }
  })

  ipcMain.handle('reversa:status', async () => {
    try {
      return { ok: true, ferramentas: detectarFerramentasReversa() }
    } catch (e) {
      return { ok: false, erro: String((e as Error).message || e), ferramentas: {} }
    }
  })

  ipcMain.handle('reversa:analisar', async (_e, payload?: unknown) => {
    const p = objeto(payload)
    const r = raizValida(p.raiz)
    if (!r.ok) return r
    const alvo = typeof p.alvo === 'string' ? p.alvo.trim() : ''
    if (!alvo) return { ok: false, erro: 'informe o alvo (arquivo, pasta ou URL)' }
    let resultado
    if (/^https?:\/\//i.test(alvo)) {
      resultado = await analisarUrl(alvo)
    } else {
      const v = alvoValido(r.raiz, alvo)
      if (!v.ok) return v
      try {
        resultado = analisarArquivo(v.abs)
      } catch (e) {
        return { ok: false, erro: String((e as Error).message || e) }
      }
    }
    return await salvarRelatorioReversa(r.raiz, resultado)
  })

  ipcMain.handle('reversa:strings', async (_e, payload?: unknown) => {
    const p = objeto(payload)
    const r = raizValida(p.raiz)
    if (!r.ok) return r
    const v = alvoValido(r.raiz, p.arquivo)
    if (!v.ok) return v
    try {
      const st = statSync(v.abs)
      if (st.isDirectory()) return { ok: false, erro: 'informe um arquivo, não uma pasta' }
      if (st.size > 256 * 1024 * 1024) return { ok: false, erro: 'arquivo maior que 256 MB' }
      const minimo = typeof p.minimo === 'number' ? Math.max(3, Math.min(16, p.minimo)) : 5
      const strings = extrairStrings(readFileSync(v.abs), minimo)
      return { ok: true, arquivo: relative(r.raiz, v.abs).replace(/\\/g, '/'), total: strings.length, strings }
    } catch (e) {
      return { ok: false, erro: String((e as Error).message || e) }
    }
  })

  ipcMain.handle('reversa:asar', async (_e, payload?: unknown) => {
    const p = objeto(payload)
    const r = raizValida(p.raiz)
    if (!r.ok) return r
    const v = alvoValido(r.raiz, p.arquivo)
    if (!v.ok) return v
    if (!/\.asar$/i.test(v.abs)) return { ok: false, erro: 'selecione um arquivo .asar' }
    const destino = typeof p.destino === 'string' && p.destino.trim() ? p.destino.trim() : undefined
    return extrairAsar(r.raiz, v.abs, destino)
  })

  ipcMain.handle('reversa:relatorios', async (_e, payload?: unknown) => {
    const p = objeto(payload)
    const r = raizValida(p.raiz)
    if (!r.ok) return { ...r, relatorios: [] }
    const pasta = pastaReversa(r.raiz)
    if (!existsSync(pasta)) return { ok: true, pasta, relatorios: [] }
    const relatorios: Array<{ nome: string; arquivo: string; bytes: number; mtimeMs: number }> = []
    for (const nome of readdirSync(pasta)) {
      const arquivo = join(pasta, nome, 'relatorio.md')
      try {
        const st = statSync(arquivo)
        relatorios.push({ nome, arquivo, bytes: st.size, mtimeMs: st.mtimeMs })
      } catch {
        /* sem relatório */
      }
    }
    relatorios.sort((a, b) => b.mtimeMs - a.mtimeMs)
    return { ok: true, pasta, relatorios }
  })

  ipcMain.handle('reversa:abrir-pasta', async (_e, payload?: unknown) => {
    const p = objeto(payload)
    const r = raizValida(p.raiz)
    if (!r.ok) return r
    const pasta = pastaReversa(r.raiz)
    mkdirSync(pasta, { recursive: true })
    const erro = await shell.openPath(pasta)
    return erro ? { ok: false, erro } : { ok: true, pasta }
  })
}
