/**
 * Editor embutido de vídeo/áudio (linha do tempo) via ffmpeg.
 *
 * Cada item da linha do tempo pode ser uma imagem (com duração), um vídeo
 * (com recorte e volume) ou um áudio (vira faixa sobre fundo preto). Os itens
 * são normalizados para a mesma resolução/fps e concatenados; no final dá para
 * aplicar fade global e música de fundo. Tudo local e gratuito.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { promises as fsp } from 'node:fs'
import { basename, extname, join } from 'node:path'
import {
  binarioResolvido,
  caminhoRelativo,
  construirListaConcat,
  destinoArquivo,
  nomeArquivo,
  pastaMidia,
  previewDe,
  rodar,
  validarEntrada,
  type RespostaMidia
} from './core'

const EXTS_IMAGEM = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])

export type ItemLinhaTempo = {
  arquivo: string
  /** Recorte inicial (segundos). Imagens ignoram. */
  inicio?: number
  /** Recorte final (segundos). Para imagens, é interpretado como duração. */
  fim?: number
  /** Duração da imagem (segundos). */
  duracao?: number
  volume?: number
  fadeIn?: number
  fadeOut?: number
  mudo?: boolean
}

export type OpcoesLinhaTempo = {
  itens: ItemLinhaTempo[]
  /** Música de fundo (mp3/wav/m4a/ogg/flac), repetida até o fim. */
  audioFundo?: string
  volumeFundo?: number
  largura?: number
  altura?: number
  fps?: number
  fadeEntrada?: number
  fadeSaida?: number
  saida?: string
}

export type MidiaInfo = {
  tipo: 'imagem' | 'video' | 'audio'
  duracaoSeg?: number
  temVideo: boolean
  temAudio: boolean
}

export type ItemNormalizado = {
  arquivo: string
  nome: string
  tipo: 'imagem' | 'video' | 'audio'
  inicio: number
  duracao: number
  volume: number
  fadeIn: number
  fadeOut: number
  mudo: boolean
  temVideo: boolean
  temAudio: boolean
}

export type AnaliseLinhaTempo = {
  ok: boolean
  erro?: string
  itens?: ItemNormalizado[]
  duracaoSeg?: number
}

function clamp(v: unknown, min: number, max: number, padrao: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : padrao
  return Math.min(max, Math.max(min, n))
}

function arredondarPar(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2)
}

export async function sondarMidia(arquivo: string): Promise<MidiaInfo | { erro: string }> {
  const imagem = EXTS_IMAGEM.has(extname(arquivo).toLowerCase())
  const r = await rodar(
    binarioResolvido('ffprobe'),
    ['-v', 'error', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', arquivo],
    60_000
  )
  if (!r.ok) return { erro: 'não foi possível ler o arquivo: ' + basename(arquivo) }
  let streams: { codec_type?: string }[] = []
  let duracao: number | undefined
  try {
    const j = JSON.parse(r.stdout) as { streams?: { codec_type?: string }[]; format?: { duration?: string } }
    streams = Array.isArray(j.streams) ? j.streams : []
    const d = Number(j.format?.duration)
    if (Number.isFinite(d) && d > 0) duracao = +d.toFixed(3)
  } catch {
    return { erro: 'ffprobe devolveu uma resposta inesperada para: ' + basename(arquivo) }
  }
  const temVideo = imagem || streams.some((s) => s.codec_type === 'video')
  const temAudio = streams.some((s) => s.codec_type === 'audio')
  return {
    tipo: imagem ? 'imagem' : temVideo ? 'video' : 'audio',
    duracaoSeg: duracao,
    temVideo,
    temAudio
  }
}

/** Resolve recortes/durações e limita os valores a faixas seguras. */
export function normalizarItem(item: ItemLinhaTempo, info: MidiaInfo): ItemNormalizado {
  const base = info.duracaoSeg ?? 0
  let inicio = 0
  let duracao = 3
  if (info.tipo === 'imagem') {
    duracao = clamp(item.duracao ?? item.fim, 0.2, 120, 3)
  } else {
    inicio = Math.min(Math.max(0, clamp(item.inicio, 0, Math.max(0, base), 0)), Math.max(0, base))
    const fimInformado = typeof item.fim === 'number' && Number.isFinite(item.fim) ? item.fim : null
    const fim = fimInformado === null ? base : Math.min(Math.max(inicio, fimInformado), base || fimInformado)
    duracao = fim - inicio
    if (!(duracao > 0.05)) duracao = Math.max(0.1, base - inicio)
  }
  const fadeMax = Math.min(10, duracao)
  return {
    arquivo: item.arquivo,
    nome: basename(item.arquivo),
    tipo: info.tipo,
    inicio: +inicio.toFixed(3),
    duracao: +duracao.toFixed(3),
    volume: +clamp(item.volume, 0, 2, 1).toFixed(2),
    fadeIn: +clamp(item.fadeIn, 0, fadeMax, 0).toFixed(2),
    fadeOut: +clamp(item.fadeOut, 0, fadeMax, 0).toFixed(2),
    mudo: item.mudo === true,
    temVideo: info.temVideo,
    temAudio: info.temAudio
  }
}

export function duracaoTotal(itens: ItemNormalizado[]): number {
  return +itens.reduce((soma, i) => soma + i.duracao, 0).toFixed(3)
}

/** Cadeia de áudio do segmento: volume, fades e mudo. */
export function filtrosAudioItem(item: ItemNormalizado): string {
  if (item.mudo) return 'anull'
  const filtros: string[] = []
  if (Math.abs(item.volume - 1) > 0.01) filtros.push('volume=' + item.volume.toFixed(2))
  if (item.fadeIn > 0.01) filtros.push('afade=t=in:st=0:d=' + item.fadeIn.toFixed(2))
  if (item.fadeOut > 0.01) {
    const st = Math.max(0, item.duracao - item.fadeOut)
    filtros.push('afade=t=out:st=' + st.toFixed(2) + ':d=' + item.fadeOut.toFixed(2))
  }
  return filtros.length ? filtros.join(',') : 'anull'
}

export function construirArgsSegmentoEditor(
  item: ItemNormalizado,
  destino: string,
  alvo: { largura: number; altura: number; fps: number }
): string[] {
  const w = arredondarPar(alvo.largura)
  const h = arredondarPar(alvo.altura)
  const fps = Math.round(clamp(alvo.fps, 15, 60, 30))
  const dur = item.duracao.toFixed(3)
  const videoFilter =
    'scale=' +
    w +
    ':' +
    h +
    ':force_original_aspect_ratio=decrease,' +
    'pad=' +
    w +
    ':' +
    h +
    ':(ow-iw)/2:(oh-ih)/2:color=black,' +
    'fps=' +
    fps +
    ',setsar=1,format=yuv420p'
  const audio = filtrosAudioItem(item)
  const args = ['-y']

  if (item.tipo === 'imagem') {
    args.push('-loop', '1', '-t', dur, '-i', item.arquivo)
    args.push('-f', 'lavfi', '-t', dur, '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000')
    args.push('-filter_complex', '[0:v]' + videoFilter + '[v];[1:a]' + audio + '[a]')
  } else if (item.tipo === 'audio') {
    if (item.inicio > 0) args.push('-ss', item.inicio.toFixed(3))
    args.push('-t', dur, '-i', item.arquivo)
    args.push('-f', 'lavfi', '-t', dur, '-i', 'color=c=black:s=' + w + 'x' + h + ':r=' + fps)
    args.push('-filter_complex', '[1:v]format=yuv420p[v];[0:a]' + audio + '[a]')
  } else {
    if (item.inicio > 0) args.push('-ss', item.inicio.toFixed(3))
    args.push('-t', dur, '-i', item.arquivo)
    if (item.temAudio) {
      args.push('-filter_complex', '[0:v]' + videoFilter + '[v];[0:a]' + audio + '[a]')
    } else {
      args.push('-f', 'lavfi', '-t', dur, '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000')
      args.push('-filter_complex', '[0:v]' + videoFilter + '[v];[1:a]' + audio + '[a]')
    }
  }

  args.push(
    '-map',
    '[v]',
    '-map',
    '[a]',
    '-t',
    dur,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '21',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-ar',
    '48000',
    '-ac',
    '2',
    destino
  )
  return args
}

/** Passo final: fades globais + música de fundo (opcionais). */
export function construirArgsFinal(
  entrada: string,
  destino: string,
  opts: { duracaoSeg: number; fadeEntrada?: number; fadeSaida?: number; musica?: string; volumeMusica?: number }
): string[] {
  const dur = Math.max(0.1, opts.duracaoSeg)
  const fadeIn = clamp(opts.fadeEntrada, 0, Math.min(10, dur), 0)
  const fadeOut = clamp(opts.fadeSaida, 0, Math.min(10, dur), 0)
  const temFade = fadeIn > 0.01 || fadeOut > 0.01
  const musica = typeof opts.musica === 'string' && opts.musica.trim() ? opts.musica.trim() : ''
  const volume = clamp(opts.volumeMusica, 0, 1, 0.2)

  const vf: string[] = []
  if (fadeIn > 0.01) vf.push('fade=t=in:st=0:d=' + fadeIn.toFixed(2))
  if (fadeOut > 0.01) {
    const st = Math.max(0, dur - fadeOut)
    vf.push('fade=t=out:st=' + st.toFixed(2) + ':d=' + fadeOut.toFixed(2))
  }

  if (!musica) {
    if (!temFade) return ['-y', '-i', entrada, '-c', 'copy', '-movflags', '+faststart', destino]
    return [
      '-y',
      '-i',
      entrada,
      '-vf',
      vf.join(','),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-c:a',
      'copy',
      '-movflags',
      '+faststart',
      destino
    ]
  }

  const grafo: string[] = []
  if (temFade) grafo.push('[0:v]' + vf.join(',') + '[v]')
  const musicaFiltros = ['volume=' + volume.toFixed(2)]
  if (fadeOut > 0.01) {
    const st = Math.max(0, dur - fadeOut)
    musicaFiltros.push('afade=t=out:st=' + st.toFixed(2) + ':d=' + fadeOut.toFixed(2))
  }
  grafo.push('[1:a]' + musicaFiltros.join(',') + '[bg]')
  grafo.push('[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]')

  const args = ['-y', '-i', entrada, '-stream_loop', '-1', '-i', musica, '-filter_complex', grafo.join(';')]
  args.push('-map', temFade ? '[v]' : '0:v', '-map', '[a]')
  if (temFade) args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20')
  else args.push('-c:v', 'copy')
  args.push('-c:a', 'aac', '-b:a', '160k', '-t', dur.toFixed(3), '-movflags', '+faststart', destino)
  return args
}

export async function analisarLinhaTempo(itens: ItemLinhaTempo[]): Promise<AnaliseLinhaTempo> {
  const lista = Array.isArray(itens) ? itens : []
  if (!lista.length) return { ok: false, erro: 'adicione ao menos um clipe à linha do tempo' }
  if (lista.length > 40) return { ok: false, erro: 'máximo de 40 clipes por exportação' }

  const normalizados: ItemNormalizado[] = []
  for (let i = 0; i < lista.length; i++) {
    const item = lista[i]
    if (!item || typeof item.arquivo !== 'string' || !item.arquivo.trim()) {
      return { ok: false, erro: 'clipe ' + (i + 1) + ' sem arquivo' }
    }
    const invalido = validarEntrada(item.arquivo, 'midia')
    if (invalido) return { ok: false, erro: 'clipe ' + (i + 1) + ': ' + invalido }
    const info = await sondarMidia(item.arquivo)
    if ('erro' in info) return { ok: false, erro: 'clipe ' + (i + 1) + ': ' + info.erro }
    if (info.tipo !== 'imagem' && !info.duracaoSeg) {
      return { ok: false, erro: 'clipe ' + (i + 1) + ': duração desconhecida em ' + basename(item.arquivo) }
    }
    normalizados.push(normalizarItem(item, info))
  }
  return { ok: true, itens: normalizados, duracaoSeg: duracaoTotal(normalizados) }
}

export async function exportarLinhaTempo(
  raiz: string,
  opts: OpcoesLinhaTempo,
  onProgresso?: (etapa: string, atual: number, total: number) => void
): Promise<RespostaMidia> {
  const analise = await analisarLinhaTempo(opts.itens)
  if (!analise.ok || !analise.itens) return { ok: false, erro: analise.erro || 'linha do tempo inválida' }
  const itens = analise.itens
  const total = analise.duracaoSeg || 0

  let musica = ''
  if (typeof opts.audioFundo === 'string' && opts.audioFundo.trim()) {
    const invalido = validarEntrada(opts.audioFundo, 'audio')
    if (invalido) return { ok: false, erro: 'música de fundo: ' + invalido }
    musica = opts.audioFundo
  }

  const largura = arredondarPar(clamp(opts.largura, 320, 1920, 1280))
  const altura = arredondarPar(clamp(opts.altura, 240, 1080, 720))
  const fps = Math.round(clamp(opts.fps, 15, 60, 30))
  const destino = destinoArquivo(raiz, nomeArquivo('linha-tempo', '.mp4'), opts.saida)
  const tmp = join(pastaMidia(raiz), '.tmp-editor-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6))
  mkdirSync(tmp, { recursive: true })

  try {
    const segmentos: string[] = []
    for (let i = 0; i < itens.length; i++) {
      const seg = join(tmp, 'seg-' + String(i).padStart(3, '0') + '.mp4')
      onProgresso?.('renderizando', i + 1, itens.length)
      const r = await rodar(
        binarioResolvido('ffmpeg'),
        construirArgsSegmentoEditor(itens[i], seg, { largura, altura, fps }),
        600_000
      )
      if (!r.ok || !existsSync(seg)) {
        return {
          ok: false,
          erro:
            'ffmpeg falhou no clipe ' +
            (i + 1) +
            ' (' +
            itens[i].nome +
            '): ' +
            (r.erro || r.stderr.split(/\r?\n/).slice(-2).join(' ')).slice(0, 300)
        }
      }
      segmentos.push(seg)
    }

    onProgresso?.('concatenando', itens.length, itens.length)
    const lista = join(tmp, 'lista.txt')
    writeFileSync(lista, construirListaConcat(segmentos), 'utf8')
    const base = join(tmp, 'base.mp4')
    let r = await rodar(binarioResolvido('ffmpeg'), ['-y', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', base], 600_000)
    if (!r.ok || !existsSync(base)) {
      r = await rodar(
        binarioResolvido('ffmpeg'),
        [
          '-y', '-f', 'concat', '-safe', '0', '-i', lista,
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
          '-c:a', 'aac', '-b:a', '160k', base
        ],
        900_000
      )
    }
    if (!r.ok || !existsSync(base)) {
      return {
        ok: false,
        erro: 'ffmpeg falhou ao concatenar: ' + (r.erro || r.stderr.split(/\r?\n/).slice(-2).join(' ')).slice(0, 300)
      }
    }

    onProgresso?.('finalizando', itens.length, itens.length)
    r = await rodar(
      binarioResolvido('ffmpeg'),
      construirArgsFinal(base, destino, {
        duracaoSeg: total,
        fadeEntrada: opts.fadeEntrada,
        fadeSaida: opts.fadeSaida,
        musica: musica || undefined,
        volumeMusica: opts.volumeFundo
      }),
      900_000
    )
    if (!r.ok || !existsSync(destino) || statSync(destino).size < 2000) {
      return {
        ok: false,
        erro: 'ffmpeg falhou ao finalizar: ' + (r.erro || r.stderr.split(/\r?\n/).slice(-2).join(' ')).slice(0, 300)
      }
    }

    return {
      ok: true,
      caminho: destino,
      caminhoRel: caminhoRelativo(raiz, destino),
      bytes: statSync(destino).size,
      mime: 'video/mp4',
      duracaoSeg: total,
      detalhes: {
        clipes: itens.length,
        largura,
        altura,
        fps,
        musica: musica || null,
        itens: itens.map((i) => ({
          nome: i.nome,
          tipo: i.tipo,
          inicio: i.inicio,
          duracao: i.duracao,
          volume: i.volume,
          mudo: i.mudo
        }))
      },
      aviso: 'Linha do tempo renderizada localmente (ffmpeg, grátis).'
    }
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}

/** Gera uma imagem de forma de onda (PNG) para prévia no editor. */
export async function gerarOnda(
  raiz: string,
  opts: { entrada: string; largura?: number; altura?: number; cor?: string; saida?: string }
): Promise<RespostaMidia> {
  const invalido = validarEntrada(opts.entrada, 'midia')
  if (invalido) return { ok: false, erro: invalido }
  const largura = Math.round(clamp(opts.largura, 200, 4000, 1200))
  const altura = Math.round(clamp(opts.altura, 40, 600, 200))
  const cor = (typeof opts.cor === 'string' ? opts.cor : '').replace(/[^0-9a-fA-FxX]/g, '') || '0x3fb950'
  const destino = destinoArquivo(raiz, nomeArquivo('onda', '.png'), opts.saida)
  const r = await rodar(
    binarioResolvido('ffmpeg'),
    [
      '-y', '-i', opts.entrada,
      '-filter_complex', 'showwavespic=s=' + largura + 'x' + altura + ':colors=' + cor,
      '-frames:v', '1', destino
    ],
    180_000
  )
  if (!r.ok || !existsSync(destino)) {
    return {
      ok: false,
      erro: 'ffmpeg falhou ao gerar a onda: ' + (r.erro || r.stderr.split(/\r?\n/).slice(-2).join(' ')).slice(0, 300)
    }
  }
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: statSync(destino).size,
    mime: 'image/png',
    previewBase64: previewDe(destino)
  }
}
