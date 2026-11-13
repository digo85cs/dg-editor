/**
 * Qualidade de vídeo e imagem via ffmpeg: estabilização (vidstab 2 passadas),
 * denoise, nitidez, correção de cor, re-render (escala/CRF/preset/fps) e
 * normalização de áudio. Tudo local e gratuito.
 */
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import {
  caminhoRelativo,
  destinoArquivo,
  mimePorExt,
  nomeArquivo,
  previewDe,
  rodar,
  validarEntrada,
  type RespostaMidia
} from './core'

export type OpcoesCor = {
  denoise?: number // 0..1
  nitidez?: number // 0..2
  brilho?: number // -100..100 (%)
  contraste?: number // -100..100 (%)
  saturacao?: number // 0..200 (%)
  gamma?: number // 0.1..10
}

export type OpcoesVideoQualidade = OpcoesCor & {
  entrada: string
  estabilizar?: boolean
  escala?: number // 1..2
  fps?: number // 0 = manter
  crf?: number // 0..51
  preset?: 'rapido' | 'equilibrado' | 'qualidade'
  normalizarAudio?: boolean
  saida?: string
}

export type OpcoesImagemQualidade = OpcoesCor & {
  entrada: string
  escala?: number // 1..4
  formato?: 'png' | 'jpg'
  qualidade?: number // 2..31 (menor = melhor)
  saida?: string
}

export type AnaliseVideo = {
  ok: boolean
  erro?: string
  largura?: number
  altura?: number
  fps?: number
  duracaoSeg?: number
  codec?: string
  bitrateKbps?: number
  temAudio?: boolean
  codecAudio?: string
  dicas: string[]
}

function clamp(v: unknown, min: number, max: number, padrao: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : padrao
  return Math.min(max, Math.max(min, n))
}

/** Escapa caminho para uso dentro de uma cadeia de filtros ffmpeg (Windows incluído). */
export function escaparCaminhoFiltro(caminho: string): string {
  return caminho.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

/** Filtros de cor/ruído compartilhados por vídeo e imagem. */
export function filtrosCor(o: OpcoesCor): string[] {
  const f: string[] = []
  const ruido = clamp(o.denoise, 0, 1, 0)
  if (ruido > 0.01) {
    const l = ruido.toFixed(2)
    f.push('hqdn3d=' + l + ':' + (ruido * 0.75).toFixed(2) + ':' + (ruido * 1.5).toFixed(2) + ':' + (ruido * 1.5).toFixed(2))
  }
  const brilho = clamp(o.brilho, -100, 100, 0) / 100
  const contraste = 1 + clamp(o.contraste, -100, 100, 0) / 100
  const saturacao = clamp(o.saturacao, 0, 200, 100) / 100
  const gamma = clamp(o.gamma, 0.1, 10, 1)
  const eq: string[] = []
  if (Math.abs(brilho) > 0.001) eq.push('brightness=' + brilho.toFixed(3))
  if (Math.abs(contraste - 1) > 0.001) eq.push('contrast=' + contraste.toFixed(3))
  if (Math.abs(saturacao - 1) > 0.001) eq.push('saturation=' + saturacao.toFixed(3))
  if (Math.abs(gamma - 1) > 0.001) eq.push('gamma=' + gamma.toFixed(2))
  if (eq.length) f.push('eq=' + eq.join(':'))
  const nitidez = clamp(o.nitidez, 0, 2, 0)
  if (nitidez > 0.01) f.push('unsharp=5:5:' + nitidez.toFixed(2) + ':5:5:0')
  return f
}

export function filtrosEscala(fator: unknown, max = 2): string | null {
  const e = clamp(fator, 1, max, 1)
  if (e <= 1.001) return null
  return 'scale=trunc(iw*' + e.toFixed(2) + '/2)*2:trunc(ih*' + e.toFixed(2) + '/2)*2:flags=lanczos'
}

/** Cadeia de vídeo; `trf` adiciona a segunda passada da estabilização. */
export function construirFiltrosVideo(o: OpcoesVideoQualidade, trf?: string): string[] {
  const f: string[] = []
  if (trf) f.push('vidstabtransform=input=' + escaparCaminhoFiltro(trf) + ':smoothing=10:zoom=5:optzoom=1')
  f.push(...filtrosCor(o))
  const escala = filtrosEscala(o.escala, 2)
  if (escala) f.push(escala)
  const fps = clamp(o.fps, 0, 120, 0)
  if (fps >= 1) f.push('fps=' + Math.round(fps))
  return f.length ? f : ['null']
}

const PRESETS = { rapido: 'veryfast', equilibrado: 'medium', qualidade: 'slow' } as const

export function construirArgsVideo(entrada: string, destino: string, o: OpcoesVideoQualidade, trf?: string): string[] {
  const filtros = construirFiltrosVideo(o, trf)
  const crf = Math.round(clamp(o.crf, 0, 51, 20))
  const preset = PRESETS[o.preset || 'equilibrado'] || PRESETS.equilibrado
  const args = [
    '-y',
    '-i',
    entrada,
    '-vf',
    filtros.join(','),
    '-c:v',
    'libx264',
    '-preset',
    preset,
    '-crf',
    String(crf),
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart'
  ]
  if (o.normalizarAudio === true) {
    args.push('-c:a', 'aac', '-b:a', '192k', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11')
  } else {
    args.push('-c:a', 'aac', '-b:a', '160k')
  }
  args.push(destino)
  return args
}

export function construirArgsEstabilizacao(entrada: string, trf: string): string[] {
  return [
    '-y',
    '-i',
    entrada,
    '-vf',
    'vidstabdetect=shakiness=5:accuracy=15:result=' + escaparCaminhoFiltro(trf),
    '-an',
    '-f',
    'null',
    '-'
  ]
}

function sondaVideo(entrada: string): Promise<{
  largura?: number
  altura?: number
  fps?: number
  duracaoSeg?: number
  codec?: string
  bitrateKbps?: number
  temAudio?: boolean
  codecAudio?: string
}> {
  return rodar(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type,codec_name,width,height,avg_frame_rate:format=duration,bit_rate',
      '-of',
      'json',
      entrada
    ],
    60_000
  ).then((r) => {
    if (!r.ok) return {}
    try {
      const j = JSON.parse(r.stdout) as {
        streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; avg_frame_rate?: string }[]
        format?: { duration?: string; bit_rate?: string }
      }
      const v = (j.streams || []).find((s) => s.codec_type === 'video') || {}
      const a = (j.streams || []).find((s) => s.codec_type === 'audio')
      const [num, den] = String(v.avg_frame_rate || '').split('/').map(Number)
      const fps = den > 0 && Number.isFinite(num) ? +(num / den).toFixed(2) : undefined
      const dur = Number(j.format?.duration)
      const br = Number(j.format?.bit_rate)
      return {
        largura: v.width,
        altura: v.height,
        fps,
        duracaoSeg: Number.isFinite(dur) ? +dur.toFixed(2) : undefined,
        codec: v.codec_name,
        bitrateKbps: Number.isFinite(br) ? Math.round(br / 1000) : undefined,
        temAudio: Boolean(a),
        codecAudio: a?.codec_name
      }
    } catch {
      return {}
    }
  })
}

export async function analisarVideo(entrada: string): Promise<AnaliseVideo> {
  const invalido = validarEntrada(entrada, 'video')
  if (invalido) return { ok: false, erro: invalido, dicas: [] }
  const info = await sondaVideo(entrada)
  if (!info.largura) return { ok: false, erro: 'não foi possível ler o vídeo de entrada', dicas: [] }
  const dicas: string[] = []
  if ((info.largura || 0) < 1280) dicas.push('Resolução SD: escala 1,5–2× com Lanczos melhora a definição em telas grandes.')
  if ((info.fps || 0) > 0 && (info.fps || 0) < 24) dicas.push('Taxa de quadros baixa: 30 fps deixa o movimento mais fluido.')
  if ((info.bitrateKbps || 0) > 0 && (info.bitrateKbps || 0) < 1000) dicas.push('Bitrate baixo: re-render com CRF 18–20 reduz artefatos de compressão.')
  if ((info.altura || 0) >= 1080) dicas.push('Já em Full HD ou mais: use CRF 18–20 e evite upscale.')
  if ((info.fps || 0) > 40) dicas.push('Vídeo com muitos quadros: use preset rápido para não alongar o tempo de render.')
  return { ok: true, ...info, dicas }
}

async function estabilizar(entrada: string, pastaTemp: string): Promise<{ trf?: string; erro?: string }> {
  const trf = join(pastaTemp, 'transform.trf')
  const r = await rodar('ffmpeg', construirArgsEstabilizacao(entrada, trf), 600_000)
  if (!r.ok || !existsSync(trf)) {
    return {
      erro:
        'estabilização indisponível neste ffmpeg (filtro vidstab): ' +
        (r.erro || r.stderr.split(/\r?\n/).slice(-2).join(' ')).slice(0, 200)
    }
  }
  return { trf }
}

export async function processarVideo(raiz: string, opts: OpcoesVideoQualidade): Promise<RespostaMidia> {
  const invalido = validarEntrada(opts.entrada, 'video')
  if (invalido) return { ok: false, erro: invalido }
  const info = await sondaVideo(opts.entrada)
  if (!info.duracaoSeg) return { ok: false, erro: 'não foi possível ler o vídeo de entrada' }

  let temp = ''
  let trf: string | undefined
  try {
    if (opts.estabilizar === true) {
      temp = mkdtempSync(join(tmpdir(), 'dg-vidstab-'))
      const estab = await estabilizar(opts.entrada, temp)
      if (estab.erro) return { ok: false, erro: estab.erro }
      trf = estab.trf
    }
    const nome = basename(opts.entrada, extname(opts.entrada))
    const destino = destinoArquivo(raiz, nomeArquivo(nome + '-qualidade', '.mp4'), opts.saida)
    const args = construirArgsVideo(opts.entrada, destino, opts, trf)
    const r = await rodar('ffmpeg', args, 1_800_000)
    if (!r.ok || !existsSync(destino) || statSync(destino).size < 1000) {
      return {
        ok: false,
        erro: 'ffmpeg falhou: ' + (r.erro || r.stderr.split(/\r?\n/).slice(-3).join(' ')).slice(0, 400)
      }
    }
    const final = await sondaVideo(destino)
    const filtros = construirFiltrosVideo(opts, trf ? 'transform.trf' : undefined)
    return {
      ok: true,
      caminho: destino,
      caminhoRel: caminhoRelativo(raiz, destino),
      bytes: statSync(destino).size,
      mime: mimePorExt('.mp4'),
      duracaoSeg: final.duracaoSeg ?? info.duracaoSeg,
      detalhes: { filtros, estabilizado: Boolean(trf), crf: opts.crf ?? 20, preset: opts.preset || 'equilibrado', ...final },
      aviso: 'Re-render local via ffmpeg (grátis)' + (trf ? ', com estabilização em 2 passadas.' : '.')
    }
  } finally {
    if (temp) rmSync(temp, { recursive: true, force: true })
  }
}

export function construirArgsImagem(entrada: string, destino: string, o: OpcoesImagemQualidade): string[] {
  const filtros = [...filtrosCor(o)]
  const escala = filtrosEscala(o.escala, 4)
  if (escala) filtros.push(escala)
  if (!filtros.length) filtros.push('null')
  const args = ['-y', '-i', entrada, '-vf', filtros.join(','), '-frames:v', '1']
  if (destino.toLowerCase().endsWith('.jpg')) args.push('-q:v', String(Math.round(clamp(o.qualidade, 2, 31, 3))))
  args.push(destino)
  return args
}

export async function processarImagem(raiz: string, opts: OpcoesImagemQualidade): Promise<RespostaMidia> {
  const invalido = validarEntrada(opts.entrada, 'imagem')
  if (invalido) return { ok: false, erro: invalido }
  const ext = opts.formato === 'jpg' ? '.jpg' : '.png'
  const nome = basename(opts.entrada, extname(opts.entrada))
  const destino = destinoArquivo(raiz, nomeArquivo(nome + '-qualidade', ext), opts.saida)
  const r = await rodar('ffmpeg', construirArgsImagem(opts.entrada, destino, opts), 300_000)
  if (!r.ok || !existsSync(destino) || statSync(destino).size < 200) {
    return {
      ok: false,
      erro: 'ffmpeg falhou: ' + (r.erro || r.stderr.split(/\r?\n/).slice(-3).join(' ')).slice(0, 300)
    }
  }
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: statSync(destino).size,
    mime: mimePorExt(ext),
    previewBase64: previewDe(destino),
    detalhes: { filtros: construirArgsImagem(opts.entrada, destino, opts).join(' '), formato: ext.slice(1) },
    aviso: 'Ajustes de imagem locais via ffmpeg (grátis).'
  }
}
