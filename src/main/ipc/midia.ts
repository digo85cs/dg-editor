/**
 * Handlers IPC do Estúdio de mídia (ferramentas gratuitas).
 *
 * Toda saída fica dentro do projeto ativo (`.dg-editor/midia` por padrão).
 * Entradas fora do projeto são aceitas somente quando escolhidas pelo
 * diálogo nativo desta sessão (o usuário autorizou explicitamente).
 */
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync, readdirSync, statSync, writeFileSync } from 'fs'
import { extname, isAbsolute, join, relative, resolve } from 'path'
import { obterRaizWorkspace } from '../workspace-raiz'
import {
  caminhoRelativo,
  destinoArquivo,
  extrairCapa,
  fotosParaVideo,
  gerarDiagrama,
  gerarImagem,
  juntarVideos,
  cortarVideo,
  melhorarImagem,
  mimePorExt,
  narrar,
  nomeArquivo,
  pastaMidia,
  previaVoz,
  previewDe,
  queimarLegendas,
  statusMidia,
  transcrever,
  type RespostaMidia
} from '../midia/core'
import {
  baixarModelos,
  lerPreferencias,
  listarVozes,
  listarVozesRapido,
  salvarPreferencias,
  type MotorVoz
} from '../midia/vozes'
import { listarMusicas, mixarMusica, pastaMusicas } from '../midia/musicas'
import { analisarVideo, processarImagem, processarVideo } from '../midia/qualidade'
import { baixarFaixas, catalogoLivres } from '../midia/musicas-livres'
import { analisarAudio, processarAudio, type FormatoAudio } from '../midia/audio'
import { analisarLinhaTempo, exportarLinhaTempo, gerarOnda, type ItemLinhaTempo } from '../midia/editor'
import { gerarFotoVideoComfy } from '../midia/comfyui'
import { detectarHardware } from '../midia/hardware'
import { gerarMeme, listarMemes, sincronizarMemes, statusMemes } from '../midia/memes'
import {
  aplicarAtualizacoes,
  lerPreferenciasAtualizacao,
  salvarPreferenciasAtualizacao,
  verificarAtualizacoes,
  type IdComponente
} from '../midia/atualizacoes'
import { espacoLivreGb, instalarComfy, statusInstalacao, verificarPreRequisitos } from '../midia/comfyui-install'

const EXTS_PREVIA = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm', '.mp3', '.wav', '.srt'])
const EXTS_IMAGEM_PREVIA = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])

/** Arquivos escolhidos pelo usuário via diálogo nativo (podem estar fora do projeto). */
const arquivosAutorizados = new Set<string>()

type RaizOk = { ok: true; raiz: string } | { ok: false; erro: string }

function raizValida(payload: unknown): RaizOk {
  const cand = typeof payload === 'string' ? payload.trim() : ''
  const ativa = obterRaizWorkspace()
  const escolhida = cand || ativa || ''
  if (!escolhida) return { ok: false, erro: 'selecione uma pasta de trabalho antes de usar o Estúdio' }
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

function entradaAutorizada(raiz: string, caminho: unknown): string | null {
  if (typeof caminho !== 'string' || !caminho.trim()) return 'informe o arquivo'
  const abs = resolve(caminho.trim())
  if (!existsSync(abs)) return 'arquivo não encontrado: ' + abs
  const rel = relative(raiz, abs)
  const dentro = !rel.startsWith('..') && !isAbsolute(rel)
  if (!dentro && !arquivosAutorizados.has(abs)) {
    return 'arquivo fora do projeto — use "Escolher arquivo" no Estúdio'
  }
  return null
}

function objeto(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {}
}

function texto(v: unknown, max = 20000): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

function numero(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function itensLinhaTempo(
  raiz: string,
  bruto: unknown
): { ok: true; itens: ItemLinhaTempo[] } | { ok: false; erro: string } {
  if (!Array.isArray(bruto) || !bruto.length) return { ok: false, erro: 'adicione ao menos um clipe à linha do tempo' }
  if (bruto.length > 40) return { ok: false, erro: 'máximo de 40 clipes por exportação' }
  const itens: ItemLinhaTempo[] = []
  for (const item of bruto) {
    const o = objeto(item)
    const arquivo = texto(o.arquivo, 1000)
    const bloqueio = entradaAutorizada(raiz, arquivo)
    if (bloqueio) return { ok: false, erro: bloqueio }
    itens.push({
      arquivo: resolve(arquivo),
      inicio: numero(o.inicio),
      fim: numero(o.fim),
      duracao: numero(o.duracao),
      volume: numero(o.volume),
      fadeIn: numero(o.fadeIn),
      fadeOut: numero(o.fadeOut),
      mudo: o.mudo === true
    })
  }
  return { ok: true, itens }
}

function falha(erro: unknown): RespostaMidia {
  return { ok: false, erro: erro instanceof Error ? erro.message : String(erro) }
}

async function capturarHtml(html: string, largura: number, altura: number, fundo: string): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    width: largura,
    height: altura,
    backgroundColor: fundo,
    webPreferences: {
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
      spellcheck: false,
      partition: 'midia-captura'
    }
  })
  try {
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-attach-webview', (e) => e.preventDefault())
    const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
    await Promise.race([
      win.loadURL(url),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout ao carregar HTML')), 20000))
    ])
    // Espera fontes/scripts pintarem antes da captura.
    await new Promise((r) => setTimeout(r, 500))
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: largura, height: altura })
    return img.toPNG()
  } finally {
    try {
      win.destroy()
    } catch {
      /* */
    }
  }
}

export function registrarHandlersMidia(): void {
  ipcMain.handle('midia:status', async (_e, raizPayload?: unknown) => {
    try {
      const r = raizValida(raizPayload)
      return await statusMidia(r.ok ? r.raiz : undefined)
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:escolher-arquivos', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const tipo = ['imagem', 'video', 'audio', 'midia', 'legenda'].includes(String(o.tipo)) ? String(o.tipo) : 'midia'
      const filtros: Record<string, string[]> = {
        imagem: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'],
        video: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'],
        audio: ['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac'],
        midia: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'mov', 'mkv', 'webm', 'mp3', 'wav', 'm4a'],
        legenda: ['srt']
      }
      const win = BrowserWindow.getFocusedWindow() || undefined
      const res = await dialog.showOpenDialog(win!, {
        title: 'Escolher ' + (tipo === 'midia' ? 'arquivo de mídia' : tipo),
        properties: o.multiplo === true ? ['openFile', 'multiSelections'] : ['openFile'],
        filters: [{ name: tipo, extensions: filtros[tipo] }]
      })
      if (res.canceled) return { ok: true, cancelado: true, caminhos: [] as string[] }
      for (const p of res.filePaths) arquivosAutorizados.add(resolve(p))
      return { ok: true, cancelado: false, caminhos: res.filePaths.map((p) => resolve(p)) }
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:escolher-pasta', async () => {
    try {
      const win = BrowserWindow.getFocusedWindow() || undefined
      const res = await dialog.showOpenDialog(win!, {
        title: 'Escolher pasta de saída (dentro do projeto)',
        properties: ['openDirectory', 'createDirectory']
      })
      if (res.canceled || !res.filePaths[0]) return { ok: true, cancelado: true }
      return { ok: true, cancelado: false, caminho: resolve(res.filePaths[0]) }
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:listar', async (_e, raizPayload?: unknown) => {
    try {
      const r = raizValida(raizPayload)
      if (!r.ok) return r
      const pasta = pastaMidia(r.raiz)
      const itens = readdirSync(pasta)
        .filter((n) => !n.startsWith('.'))
        .map((n) => {
          const abs = join(pasta, n)
          try {
            const st = statSync(abs)
            if (!st.isFile() || !EXTS_PREVIA.has(extname(n).toLowerCase())) return null
            return { nome: n, caminho: abs, caminhoRel: caminhoRelativo(r.raiz, abs), bytes: st.size, mtime: st.mtimeMs }
          } catch {
            return null
          }
        })
        .filter((x): x is { nome: string; caminho: string; caminhoRel: string; bytes: number; mtime: number } => !!x)
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 30)
      return {
        ok: true,
        pasta,
        itens: itens.map((i) => ({
          ...i,
          mime: mimePorExt(extname(i.nome)),
          previewBase64: EXTS_IMAGEM_PREVIA.has(extname(i.nome).toLowerCase()) ? previewDe(i.caminho) : undefined
        }))
      }
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:abrir-pasta', async (_e, raizPayload?: unknown) => {
    try {
      const r = raizValida(raizPayload)
      if (!r.ok) return r
      const pasta = pastaMidia(r.raiz)
      const err = await shell.openPath(pasta)
      return err ? { ok: false, erro: err } : { ok: true, caminho: pasta }
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:imagem', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      return await gerarImagem(r.raiz, {
        prompt: texto(o.prompt, 1300),
        largura: numero(o.largura),
        altura: numero(o.altura),
        seed: numero(o.seed),
        modelo: texto(o.modelo, 40) || undefined,
        saida: texto(o.saida, 1000) || undefined,
        esperarLimite: o.esperarLimite !== false
      })
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:diagrama', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      return await gerarDiagrama(r.raiz, {
        codigo: texto(o.codigo, 20000),
        formato: o.formato === 'svg' ? 'svg' : 'png',
        tema: o.tema === 'dark' ? 'dark' : 'light',
        fundo: texto(o.fundo, 40) || undefined,
        saida: texto(o.saida, 1000) || undefined
      })
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:html-imagem', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const html = texto(o.html, 500000)
      if (!html.trim()) return { ok: false, erro: 'informe o HTML' }
      const largura = Math.round(Math.min(1920, Math.max(64, numero(o.largura) ?? 1200)))
      const altura = Math.round(Math.min(1920, Math.max(64, numero(o.altura) ?? 630)))
      const fundo = texto(o.fundo, 40) || '#ffffff'
      const png = await capturarHtml(html, largura, altura, fundo)
      if (png.length < 100 || png.subarray(1, 4).toString() !== 'PNG') {
        return { ok: false, erro: 'captura não produziu um PNG válido' }
      }
      const destino = destinoArquivo(r.raiz, nomeArquivo('html', '.png'), texto(o.saida, 1000) || undefined)
      writeFileSync(destino, png)
      return {
        ok: true,
        caminho: destino,
        caminhoRel: caminhoRelativo(r.raiz, destino),
        bytes: png.length,
        mime: 'image/png',
        previewBase64: previewDe(destino),
        detalhes: { largura, altura },
        aviso: 'Renderizado localmente no Electron (sem serviços externos).'
      }
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:imagem-melhorar', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const entrada = texto(o.entrada, 1000)
      const bloqueio = entradaAutorizada(r.raiz, entrada)
      if (bloqueio) return { ok: false, erro: bloqueio }
      return await melhorarImagem(r.raiz, {
        entrada,
        fator: numero(o.fator),
        nitidez: numero(o.nitidez),
        formato: o.formato === 'jpg' ? 'jpg' : 'png',
        saida: texto(o.saida, 1000) || undefined
      })
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:fotos-video', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const imagens = Array.isArray(o.imagens) ? o.imagens.filter((p): p is string => typeof p === 'string') : []
      if (!imagens.length) return { ok: false, erro: 'selecione ao menos uma foto' }
      if (imagens.length > 60) return { ok: false, erro: 'máximo de 60 fotos por vídeo' }
      for (const img of imagens) {
        const bloqueio = entradaAutorizada(r.raiz, img)
        if (bloqueio) return { ok: false, erro: bloqueio }
      }
      const audio = texto(o.audio, 1000)
      if (audio) {
        const bloqueio = entradaAutorizada(r.raiz, audio)
        if (bloqueio) return { ok: false, erro: bloqueio }
      }
      return await fotosParaVideo(r.raiz, {
        imagens,
        segundosPorFoto: numero(o.segundosPorFoto),
        largura: numero(o.largura),
        altura: numero(o.altura),
        fps: numero(o.fps),
        narracao: texto(o.narracao, 8000) || undefined,
        voz: texto(o.voz, 80) || undefined,
        audio: audio || undefined,
        saida: texto(o.saida, 1000) || undefined
      })
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:video-cortar', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const entrada = texto(o.entrada, 1000)
      const bloqueio = entradaAutorizada(r.raiz, entrada)
      if (bloqueio) return { ok: false, erro: bloqueio }
      return await cortarVideo(r.raiz, {
        entrada,
        inicio: typeof o.inicio === 'number' ? o.inicio : texto(o.inicio, 40),
        fim: typeof o.fim === 'number' ? o.fim : texto(o.fim, 40),
        saida: texto(o.saida, 1000) || undefined
      })
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:video-juntar', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const videos = Array.isArray(o.videos) ? o.videos.filter((p): p is string => typeof p === 'string') : []
      for (const v of videos) {
        const bloqueio = entradaAutorizada(r.raiz, v)
        if (bloqueio) return { ok: false, erro: bloqueio }
      }
      return await juntarVideos(r.raiz, { videos, saida: texto(o.saida, 1000) || undefined })
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:video-capa', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const entrada = texto(o.entrada, 1000)
      const bloqueio = entradaAutorizada(r.raiz, entrada)
      if (bloqueio) return { ok: false, erro: bloqueio }
      return await extrairCapa(r.raiz, {
        entrada,
        tempo: typeof o.tempo === 'number' ? o.tempo : texto(o.tempo, 40) || undefined,
        largura: numero(o.largura),
        saida: texto(o.saida, 1000) || undefined
      })
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:transcrever', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const entrada = texto(o.entrada, 1000)
      const bloqueio = entradaAutorizada(r.raiz, entrada)
      if (bloqueio) return { ok: false, erro: bloqueio }
      return await transcrever(r.raiz, {
        entrada,
        idioma: texto(o.idioma, 10) || undefined,
        modelo: texto(o.modelo, 10) || undefined,
        saida: texto(o.saida, 1000) || undefined
      })
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:vozes', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const vozes = o.rapido === true ? listarVozesRapido() : await listarVozes()
      return { ok: true, vozes, preferencias: lerPreferencias() }
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:vozes-baixar', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const motor = String(o.motor || '') as MotorVoz
      if (!['supertonic', 'kokoro', 'piper'].includes(motor)) {
        return { ok: false, erro: 'motor inválido (use supertonic, kokoro ou piper)' }
      }
      return await baixarModelos(motor)
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:voz-previa', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      return await previaVoz(texto(o.voz, 80), texto(o.texto, 300) || undefined)
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:voz-padrao', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const voz = texto(o.voz, 80)
      return { ok: true, preferencias: voz ? salvarPreferencias({ vozPadrao: voz }) : lerPreferencias() }
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:narrar', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      return await narrar(r.raiz, {
        texto: texto(o.texto, 8000),
        voz: texto(o.voz, 80) || undefined,
        taxa: texto(o.taxa, 10) || undefined,
        saida: texto(o.saida, 1000) || undefined
      })
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:legendas', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const video = texto(o.video, 1000)
      const bloqueioVideo = entradaAutorizada(r.raiz, video)
      if (bloqueioVideo) return { ok: false, erro: bloqueioVideo }
      const srt = texto(o.srt, 1000)
      const bloqueioSrt = entradaAutorizada(r.raiz, srt)
      if (bloqueioSrt) return { ok: false, erro: bloqueioSrt }
      return await queimarLegendas(r.raiz, { video, srt, saida: texto(o.saida, 1000) || undefined })
    } catch (e) {
      return falha(e)
    }
  })

  // ------------------------------------------------------------ memes

  ipcMain.handle('midia:memes', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      return { ...listarMemes(texto(o.filtro, 80) || undefined), status: statusMemes() }
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:memes-sincronizar', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      return await sincronizarMemes({ forcar: o.forcar === true })
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:memes-pasta', async () => {
    try {
      const { pastaMemes } = await import('../midia/memes')
      const err = await shell.openPath(pastaMemes())
      return err ? { ok: false, erro: err } : { ok: true, caminho: pastaMemes() }
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:meme', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      return await gerarMeme(r.raiz, {
        template: texto(o.template, 64),
        topo: texto(o.topo, 200),
        baixo: texto(o.baixo, 200),
        saida: texto(o.saida, 1000) || undefined
      })
    } catch (e) {
      return falha(e)
    }
  })

  // ------------------------------------------------------ músicas locais

  ipcMain.handle('midia:musicas', async () => {
    try {
      return listarMusicas()
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:musicas-pasta', async () => {
    try {
      const pasta = pastaMusicas()
      const erro = await shell.openPath(pasta)
      return erro ? { ok: false, erro } : { ok: true, caminho: pasta }
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:musicas-catalogo', async () => {
    try {
      return catalogoLivres()
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:musicas-baixar', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const ids = Array.isArray(o.ids) ? o.ids.filter((i): i is string => typeof i === 'string') : undefined
      return await baixarFaixas({
        estilo: texto(o.estilo, 40) || undefined,
        ids,
        sobrescrever: o.sobrescrever === true
      })
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:audio-analisar', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const entrada = texto(o.entrada, 1000)
      const bloqueio = entradaAutorizada(r.raiz, entrada)
      if (bloqueio) return { ok: false, erro: bloqueio }
      return await analisarAudio(entrada)
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:video-analisar', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const entrada = texto(o.entrada, 1000)
      const bloqueio = entradaAutorizada(r.raiz, entrada)
      if (bloqueio) return { ok: false, erro: bloqueio }
      return await analisarVideo(entrada)
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:video-melhorar', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const entrada = texto(o.entrada, 1000)
      const bloqueio = entradaAutorizada(r.raiz, entrada)
      if (bloqueio) return { ok: false, erro: bloqueio }
      const presets = ['rapido', 'equilibrado', 'qualidade'] as const
      const preset = presets.includes(texto(o.preset, 20) as (typeof presets)[number])
        ? (texto(o.preset, 20) as (typeof presets)[number])
        : undefined
      return await processarVideo(r.raiz, {
        entrada,
        estabilizar: o.estabilizar === true,
        denoise: numero(o.denoise),
        nitidez: numero(o.nitidez),
        brilho: numero(o.brilho),
        contraste: numero(o.contraste),
        saturacao: numero(o.saturacao),
        gamma: numero(o.gamma),
        escala: numero(o.escala),
        fps: numero(o.fps),
        crf: numero(o.crf),
        preset,
        normalizarAudio: o.normalizarAudio === true,
        saida: texto(o.saida, 1000) || undefined
      })
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:imagem-qualidade', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const entrada = texto(o.entrada, 1000)
      const bloqueio = entradaAutorizada(r.raiz, entrada)
      if (bloqueio) return { ok: false, erro: bloqueio }
      return await processarImagem(r.raiz, {
        entrada,
        denoise: numero(o.denoise),
        nitidez: numero(o.nitidez),
        brilho: numero(o.brilho),
        contraste: numero(o.contraste),
        saturacao: numero(o.saturacao),
        gamma: numero(o.gamma),
        escala: numero(o.escala),
        formato: o.formato === 'jpg' ? 'jpg' : 'png',
        qualidade: numero(o.qualidade),
        saida: texto(o.saida, 1000) || undefined
      })
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:audio-processar', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const entrada = texto(o.entrada, 1000)
      const bloqueio = entradaAutorizada(r.raiz, entrada)
      if (bloqueio) return { ok: false, erro: bloqueio }
      const formatos: FormatoAudio[] = ['mp3', 'wav', 'm4a', 'ogg']
      const formato = formatos.includes(texto(o.formato, 10) as FormatoAudio)
        ? (texto(o.formato, 10) as FormatoAudio)
        : undefined
      return await processarAudio(r.raiz, {
        entrada,
        normalizar: o.normalizar === true,
        ganhoDb: numero(o.ganhoDb),
        gravesDb: numero(o.gravesDb),
        agudosDb: numero(o.agudosDb),
        compressao: numero(o.compressao),
        fadeInSeg: numero(o.fadeInSeg),
        fadeOutSeg: numero(o.fadeOutSeg),
        inicio: typeof o.inicio === 'number' || typeof o.inicio === 'string' ? o.inicio : undefined,
        fim: typeof o.fim === 'number' || typeof o.fim === 'string' ? o.fim : undefined,
        formato,
        saida: texto(o.saida, 1000) || undefined
      })
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:musica-mixar', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const video = texto(o.video, 1000)
      const bloqueio = entradaAutorizada(r.raiz, video)
      if (bloqueio) return { ok: false, erro: bloqueio }
      const musica = resolve(texto(o.musica, 1000))
      const dentro = relative(pastaMusicas(), musica)
      if (!dentro || dentro.startsWith('..') || isAbsolute(dentro)) {
        return { ok: false, erro: 'a música precisa estar na pasta do banco de músicas' }
      }
      return await mixarMusica(r.raiz, {
        video,
        musica,
        volume: numero(o.volume),
        saida: texto(o.saida, 1000) || undefined
      })
    } catch (e) {
      return falha(e)
    }
  })

  // ------------------------------------------------- linha do tempo (editor)

  ipcMain.handle('midia:linha-tempo-analisar', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const itens = itensLinhaTempo(r.raiz, o.itens)
      if ('erro' in itens) return { ok: false, erro: itens.erro }
      return await analisarLinhaTempo(itens.itens)
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:linha-tempo-exportar', async (e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const itens = itensLinhaTempo(r.raiz, o.itens)
      if ('erro' in itens) return { ok: false, erro: itens.erro }

      let audioFundo = texto(o.audioFundo, 1000)
      if (audioFundo) {
        const abs = resolve(audioFundo)
        const naBiblioteca = (() => {
          const rel = relative(pastaMusicas(), abs)
          return !rel.startsWith('..') && !isAbsolute(rel)
        })()
        const bloqueio = naBiblioteca ? null : entradaAutorizada(r.raiz, abs)
        if (bloqueio) return { ok: false, erro: 'música de fundo: ' + bloqueio }
        audioFundo = abs
      }

      return await exportarLinhaTempo(
        r.raiz,
        {
          itens: itens.itens,
          audioFundo: audioFundo || undefined,
          volumeFundo: numero(o.volumeFundo),
          largura: numero(o.largura),
          altura: numero(o.altura),
          fps: numero(o.fps),
          fadeEntrada: numero(o.fadeEntrada),
          fadeSaida: numero(o.fadeSaida),
          saida: texto(o.saida, 1000) || undefined
        },
        (etapa, atual, total) => {
          try {
            if (!e.sender.isDestroyed()) e.sender.send('midia:linha-tempo-progresso', { etapa, atual, total })
          } catch {
            /* janela fechou durante a renderização */
          }
        }
      )
    } catch (err) {
      return falha(err)
    }
  })

  ipcMain.handle('midia:onda', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const entrada = texto(o.entrada, 1000)
      const bloqueio = entradaAutorizada(r.raiz, entrada)
      if (bloqueio) return { ok: false, erro: bloqueio }
      return await gerarOnda(r.raiz, {
        entrada,
        largura: numero(o.largura),
        altura: numero(o.altura),
        cor: texto(o.cor, 20) || undefined,
        saida: texto(o.saida, 1000) || undefined
      })
    } catch (e) {
      return falha(e)
    }
  })

  // ------------------------------------------------------ foto → vídeo

  ipcMain.handle('midia:foto-video', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      if (o.consentimento !== true) {
        return {
          ok: false,
          erro:
            'Confirme que você tem direito de usar esta imagem (foto própria ou pessoa autorizada). ' +
            'O DG Editor não gera vídeos de pessoas reais sem consentimento.'
        }
      }
      const r = raizValida(o.raiz)
      if (!r.ok) return r
      const entrada = texto(o.entrada, 1000)
      const bloqueio = entradaAutorizada(r.raiz, entrada)
      if (bloqueio) return { ok: false, erro: bloqueio }
      return await gerarFotoVideoComfy(r.raiz, {
        entrada,
        prompt: texto(o.prompt, 600) || undefined,
        movimento: numero(o.movimento),
        largura: numero(o.largura),
        altura: numero(o.altura),
        quadros: numero(o.quadros),
        fps: numero(o.fps),
        passos: numero(o.passos),
        seed: numero(o.seed),
        consentimento: o.consentimento === true,
        saida: texto(o.saida, 1000) || undefined
      })
    } catch (e) {
      return falha(e)
    }
  })

  // ------------------------------------------------- hardware/instalação

  ipcMain.handle('midia:hardware', async () => {
    try {
      const hw = await detectarHardware(true)
      return { ok: true, hardware: hw, espacoLivreGb: espacoLivreGb(), comfy: statusInstalacao() }
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:comfy-pre', async () => {
    try {
      return await verificarPreRequisitos()
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:comfy-instalar', async (_e, payload?: unknown) => {
    if (instalandoComfy) return { ok: false, erro: 'instalação já em andamento' }
    try {
      const o = objeto(payload)
      const modelos = ['nenhum', 'imagem', 'completo'].includes(String(o.modelos)) ? String(o.modelos) : 'nenhum'
      instalandoComfy = true
      const hw = await detectarHardware()
      return await instalarComfy({
        modelos: modelos as 'nenhum' | 'imagem' | 'completo',
        video: o.video === true,
        cuda: o.cuda === true && hw.gpu?.compativel === true
      })
    } catch (e) {
      return falha(e)
    } finally {
      instalandoComfy = false
    }
  })

  ipcMain.handle('midia:comfy-instalacao', async () => {
    try {
      return { ok: true, status: statusInstalacao(), espacoLivreGb: espacoLivreGb() }
    } catch (e) {
      return falha(e)
    }
  })

  // ------------------------------------------------------- atualizações

  ipcMain.handle('midia:atualizacoes', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      const r = await verificarAtualizacoes({ rede: o.rede !== false })
      return { ...r, preferencias: lerPreferenciasAtualizacao() }
    } catch (e) {
      return falha(e)
    }
  })

  ipcMain.handle('midia:atualizacoes-aplicar', async (_e, payload?: unknown) => {
    if (aplicandoAtualizacoes) return { ok: false, erro: 'atualização já em andamento' }
    try {
      const o = objeto(payload)
      const validos: IdComponente[] = ['comfyui', 'animatediff', 'memes', 'vozes']
      const componentes = Array.isArray(o.componentes)
        ? (o.componentes.filter((c): c is IdComponente => validos.includes(c as IdComponente)))
        : undefined
      aplicandoAtualizacoes = true
      return await aplicarAtualizacoes({ componentes })
    } catch (e) {
      return falha(e)
    } finally {
      aplicandoAtualizacoes = false
    }
  })

  ipcMain.handle('midia:atualizacoes-prefs', async (_e, payload?: unknown) => {
    try {
      const o = objeto(payload)
      return {
        ok: true,
        preferencias: salvarPreferenciasAtualizacao({
          automatico: typeof o.automatico === 'boolean' ? o.automatico : undefined,
          aplicarAutomatico: typeof o.aplicarAutomatico === 'boolean' ? o.aplicarAutomatico : undefined
        })
      }
    } catch (e) {
      return falha(e)
    }
  })
}

let instalandoComfy = false
let aplicandoAtualizacoes = false
