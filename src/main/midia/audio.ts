/**
 * Ferramentas de áudio via ffmpeg: normalização EBU R128, equalização
 * (graves/agudos), compressão, fade, volume, corte e conversão de formato.
 * Tudo local e gratuito; a saída fica dentro do projeto.
 */
import { existsSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import {
  caminhoRelativo,
  destinoArquivo,
  mimePorExt,
  nomeArquivo,
  parseTempo,
  rodar,
  validarEntrada,
  type RespostaMidia
} from './core'

export type FormatoAudio = 'mp3' | 'wav' | 'm4a' | 'ogg'

export type OpcoesAudio = {
  entrada: string
  normalizar?: boolean
  ganhoDb?: number
  gravesDb?: number
  agudosDb?: number
  compressao?: number
  fadeInSeg?: number
  fadeOutSeg?: number
  inicio?: string | number
  fim?: string | number
  formato?: FormatoAudio
  saida?: string
}

const FORMATOS: Record<FormatoAudio, { ext: string; args: string[]; mime: string }> = {
  mp3: { ext: '.mp3', args: ['-c:a', 'libmp3lame', '-b:a', '192k'], mime: 'audio/mpeg' },
  wav: { ext: '.wav', args: ['-c:a', 'pcm_s16le'], mime: 'audio/wav' },
  m4a: { ext: '.m4a', args: ['-c:a', 'aac', '-b:a', '192k'], mime: 'audio/mp4' },
  ogg: { ext: '.ogg', args: ['-c:a', 'libvorbis', '-q:a', '6'], mime: 'audio/ogg' }
}

function clamp(v: unknown, min: number, max: number, padrao: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : padrao
  return Math.min(max, Math.max(min, n))
}

/**
 * Monta a cadeia de filtros na ordem correta: volume/eq → compressão → fades →
 * normalização (loudnorm por último para não ser desfeito pelos ganhos).
 */
export function construirFiltrosAudio(o: OpcoesAudio, duracaoSeg?: number): string[] {
  const filtros: string[] = []
  const ganho = clamp(o.ganhoDb, -30, 30, 0)
  if (Math.abs(ganho) > 0.01) filtros.push('volume=' + ganho.toFixed(1) + 'dB')
  const graves = clamp(o.gravesDb, -20, 20, 0)
  if (Math.abs(graves) > 0.01) filtros.push('bass=g=' + graves.toFixed(1))
  const agudos = clamp(o.agudosDb, -20, 20, 0)
  if (Math.abs(agudos) > 0.01) filtros.push('treble=g=' + agudos.toFixed(1))
  const comp = clamp(o.compressao, 1, 20, 1)
  if (comp > 1.01) {
    filtros.push('acompressor=threshold=-18dB:ratio=' + comp.toFixed(1) + ':attack=10:release=200')
  }
  const fadeIn = clamp(o.fadeInSeg, 0, 60, 0)
  if (fadeIn > 0.01) filtros.push('afade=t=in:st=0:d=' + fadeIn.toFixed(2))
  const fadeOut = clamp(o.fadeOutSeg, 0, 60, 0)
  if (fadeOut > 0.01 && typeof duracaoSeg === 'number' && duracaoSeg > 0) {
    const inicio = Math.max(0, duracaoSeg - fadeOut)
    filtros.push('afade=t=out:st=' + inicio.toFixed(2) + ':d=' + Math.min(fadeOut, duracaoSeg).toFixed(2))
  }
  if (o.normalizar === true) filtros.push('loudnorm=I=-16:TP=-1.5:LRA=11')
  return filtros
}

async function sonda(caminho: string): Promise<{
  duracaoSeg?: number
  codec?: string
  taxa?: number
  canais?: number
  bitrateKbps?: number
}> {
  const r = await rodar(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration,bit_rate', '-of', 'json', caminho],
    30_000
  )
  if (!r.ok) return {}
  try {
    const j = JSON.parse(r.stdout) as {
      streams?: { codec_name?: string; sample_rate?: string; channels?: number }[]
      format?: { duration?: string; bit_rate?: string }
    }
    const s = j.streams?.[0] || {}
    const dur = Number(j.format?.duration)
    const br = Number(j.format?.bit_rate)
    return {
      duracaoSeg: Number.isFinite(dur) ? +dur.toFixed(2) : undefined,
      codec: s.codec_name,
      taxa: s.sample_rate ? Number(s.sample_rate) : undefined,
      canais: s.channels,
      bitrateKbps: Number.isFinite(br) ? Math.round(br / 1000) : undefined
    }
  } catch {
    return {}
  }
}

export type AnaliseAudio = {
  ok: boolean
  erro?: string
  duracaoSeg?: number
  codec?: string
  taxa?: number
  canais?: number
  bitrateKbps?: number
  mediaDb?: number
  picoDb?: number
}

/** Mede duração/codec e volume médio/pico (volumedetect) para orientar o ajuste. */
export async function analisarAudio(entrada: string): Promise<AnaliseAudio> {
  const invalido = validarEntrada(entrada, 'audio')
  if (invalido) return { ok: false, erro: invalido }
  const info = await sonda(entrada)
  const r = await rodar(
    'ffmpeg',
    ['-hide_banner', '-i', entrada, '-af', 'volumedetect', '-f', 'null', '-'],
    120_000
  )
  const txt = r.stderr || ''
  const media = /mean_volume:\s*(-?[\d.]+)/.exec(txt)
  const pico = /max_volume:\s*(-?[\d.]+)/.exec(txt)
  return {
    ok: true,
    ...info,
    mediaDb: media ? Number(media[1]) : undefined,
    picoDb: pico ? Number(pico[1]) : undefined
  }
}

export async function processarAudio(raiz: string, opts: OpcoesAudio): Promise<RespostaMidia> {
  const invalido = validarEntrada(opts.entrada, 'audio')
  if (invalido) return { ok: false, erro: invalido }

  const formato: FormatoAudio = opts.formato && FORMATOS[opts.formato] ? opts.formato : 'mp3'
  let ini = 0
  if (opts.inicio !== undefined && opts.inicio !== '') {
    const p = parseTempo(opts.inicio)
    if (p === null) return { ok: false, erro: 'tempo inicial inválido (use 12, 1:30 ou 00:01:30)' }
    ini = p
  }
  let fim: number | null = null
  if (opts.fim !== undefined && opts.fim !== '') {
    const p = parseTempo(opts.fim)
    if (p === null) return { ok: false, erro: 'tempo final inválido (use 12, 1:30 ou 00:01:30)' }
    fim = p
  }
  if (fim !== null && fim <= ini) return { ok: false, erro: 'o fim precisa ser maior que o início' }

  const info = await sonda(opts.entrada)
  if (info.duracaoSeg === undefined) return { ok: false, erro: 'não foi possível ler o áudio de entrada' }
  const duracaoSaida = fim !== null ? +(fim - ini).toFixed(2) : +(info.duracaoSeg - ini).toFixed(2)
  if (duracaoSaida <= 0) return { ok: false, erro: 'início maior que a duração do áudio' }
  const filtros = construirFiltrosAudio(opts, duracaoSaida)

  const nome = basename(opts.entrada, extname(opts.entrada))
  const destino = destinoArquivo(raiz, nomeArquivo(nome + '-audio', FORMATOS[formato].ext), opts.saida)
  const args = ['-y']
  if (ini && ini > 0) args.push('-ss', ini.toFixed(3))
  args.push('-i', opts.entrada)
  if (fim !== null) args.push('-t', duracaoSaida.toFixed(3))
  args.push('-vn', '-af', filtros.length ? filtros.join(',') : 'anull', ...FORMATOS[formato].args, destino)

  const r = await rodar('ffmpeg', args, 900_000)
  if (!r.ok || !existsSync(destino) || statSync(destino).size < 500) {
    return {
      ok: false,
      erro: 'ffmpeg falhou: ' + (r.erro || r.stderr.split(/\r?\n/).slice(-3).join(' ')).slice(0, 400)
    }
  }
  const final = await sonda(destino)
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: statSync(destino).size,
    mime: FORMATOS[formato].mime || mimePorExt(FORMATOS[formato].ext),
    duracaoSeg: final.duracaoSeg ?? duracaoSaida,
    detalhes: { filtros, formato, ...final },
    aviso: 'Processamento local via ffmpeg (grátis).'
  }
}
