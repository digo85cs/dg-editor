/**
 * Efeitos de vídeo gratuitos inspirados em editores comerciais
 * (Topaz Video, PowerDirector, Filmora) — tudo com o ffmpeg embutido.
 *
 * Cobre: upscale/aprimoramento, interpolação de quadros e slow motion,
 * velocidade, boomerang, transições, picture-in-picture, chroma key,
 * títulos, presets de cor, reframe vertical, remoção de logo, blur de
 * região, proxy, correção de lente, GIF, extração de áudio e detecção
 * de cenas para montar destaques.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import {
  caminhoRelativo,
  destinoArquivo,
  mimePorExt,
  nomeArquivo,
  pastaMidia,
  previewDe,
  rodar,
  validarEntrada,
  binarioResolvido,
  type RespostaMidia
} from './core'

export type EfeitoVideoId =
  | 'aprimorar'
  | 'interpolar'
  | 'velocidade'
  | 'boomerang'
  | 'transicao'
  | 'pip'
  | 'chromakey'
  | 'titulo'
  | 'cor'
  | 'reframe'
  | 'delogo'
  | 'borrar-regiao'
  | 'proxy'
  | 'lente'
  | 'gif'
  | 'extrair-audio'

export type PresetCor = 'cinema' | 'quente' | 'frio' | 'pb' | 'vintage' | 'vivo' | 'suave'

export type Regiao = { x: number; y: number; w: number; h: number }

export type OpcoesEfeitoVideo = {
  entrada: string
  efeito: EfeitoVideoId
  saida?: string
  segunda?: string
  fator?: number
  denoise?: number
  nitidez?: number
  grao?: number
  fps?: number
  suave?: boolean
  slow?: number
  taxa?: number
  preset?: PresetCor
  texto?: string
  cor?: string
  tamanho?: number
  posicao?: 'centro' | 'topo' | 'base'
  duracao?: number
  tipo?: string
  escala?: number
  posicaoPip?: 'inferior-direito' | 'inferior-esquerdo' | 'superior-direito' | 'superior-esquerdo'
  opacidade?: number
  similaridade?: number
  mistura?: number
  regiao?: Regiao
  intensidade?: number
}

type InfoMidia = {
  duracao: number
  largura: number
  altura: number
  fps: number
  temAudio: boolean
}

export const TRANSICOES = [
  'fade',
  'wipeleft',
  'wiperight',
  'wipeup',
  'wipedown',
  'slideleft',
  'slideright',
  'slideup',
  'slidedown',
  'fadeblack',
  'fadewhite',
  'dissolve',
  'pixelize',
  'radial',
  'circleopen',
  'circleclose',
  'smoothleft',
  'smoothright',
  'horzopen',
  'horzclose',
  'vertopen',
  'vertclose',
  'diagtl',
  'diagtr',
  'diagbl',
  'diagbr'
] as const

export const PRESETS_COR: { id: PresetCor; rotulo: string; filtros: string[] }[] = [
  { id: 'cinema', rotulo: 'Cinema (contraste + tons frios)', filtros: ['eq=contrast=1.12:saturation=0.92:brightness=-0.02', 'colorbalance=rs=-0.03:bs=0.04'] },
  { id: 'quente', rotulo: 'Quente (pôr do sol)', filtros: ['colorbalance=rs=0.08:gs=0.02:bs=-0.06', 'eq=saturation=1.08'] },
  { id: 'frio', rotulo: 'Frio (azulado)', filtros: ['colorbalance=rs=-0.06:bs=0.08', 'eq=saturation=0.98'] },
  { id: 'pb', rotulo: 'Preto e branco', filtros: ['hue=s=0', 'eq=contrast=1.1'] },
  { id: 'vintage', rotulo: 'Vintage (filme antigo)', filtros: ['curves=preset=vintage', 'noise=alls=6:allf=t'] },
  { id: 'vivo', rotulo: 'Vivo (HDR pop)', filtros: ['eq=saturation=1.28:contrast=1.08'] },
  { id: 'suave', rotulo: 'Suave (beleza)', filtros: ['smartblur=lr=1.4:ls=-0.6:lt=6', 'eq=brightness=0.03:saturation=0.96'] }
]

export const CATALOGO_EFEITOS: {
  id: EfeitoVideoId
  rotulo: string
  categoria: 'qualidade' | 'movimento' | 'composicao' | 'cor' | 'utilidades'
  descricao: string
  opcoes: string[]
  precisaSegundo?: boolean
}[] = [
  {
    id: 'aprimorar',
    rotulo: 'Aprimorar / upscale (estilo Topaz)',
    categoria: 'qualidade',
    descricao: 'Aumenta a resolução com Lanczos, remove ruído, realça detalhes e adiciona grão opcional.',
    opcoes: ['fator', 'denoise', 'nitidez', 'grao']
  },
  {
    id: 'interpolar',
    rotulo: 'Interpolar quadros / slow motion (estilo Topaz)',
    categoria: 'movimento',
    descricao: 'Gera quadros intermediários para 60/120 fps e cria câmera lenta mais fluida.',
    opcoes: ['fps', 'suave', 'slow']
  },
  {
    id: 'velocidade',
    rotulo: 'Velocidade (0,25× a 4×)',
    categoria: 'movimento',
    descricao: 'Acelera ou desacelera vídeo e áudio mantendo o tom da voz.',
    opcoes: ['taxa']
  },
  {
    id: 'boomerang',
    rotulo: 'Boomerang (ida e volta)',
    categoria: 'movimento',
    descricao: 'Repete o clipe em sentido inverso, com áudio sincronizado.',
    opcoes: []
  },
  {
    id: 'transicao',
    rotulo: 'Transição entre dois vídeos',
    categoria: 'composicao',
    descricao: 'Junta dois clipes com fade, wipe, dissolve, pixelize e outras transições.',
    opcoes: ['tipo', 'duracao'],
    precisaSegundo: true
  },
  {
    id: 'pip',
    rotulo: 'Picture-in-picture / sobreposição',
    categoria: 'composicao',
    descricao: 'Coloca uma imagem ou vídeo sobre o vídeo principal, com escala, posição e opacidade.',
    opcoes: ['escala', 'posicaoPip', 'opacidade'],
    precisaSegundo: true
  },
  {
    id: 'chromakey',
    rotulo: 'Chroma key (fundo verde/azul)',
    categoria: 'composicao',
    descricao: 'Remove o fundo verde/azul do clipe e compõe sobre outra imagem ou vídeo.',
    opcoes: ['cor', 'similaridade', 'mistura'],
    precisaSegundo: true
  },
  {
    id: 'titulo',
    rotulo: 'Título / legenda fixa',
    categoria: 'composicao',
    descricao: 'Escreve um texto sobre o vídeo com cor, tamanho e posição.',
    opcoes: ['texto', 'cor', 'tamanho', 'posicao']
  },
  {
    id: 'cor',
    rotulo: 'Cor e look (estilo ColorDirector)',
    categoria: 'cor',
    descricao: 'Aplica looks prontos: cinema, quente, frio, P&B, vintage, vivo e suave.',
    opcoes: ['preset']
  },
  {
    id: 'reframe',
    rotulo: 'Reenquadrar vertical 9:16 (estilo Filmora)',
    categoria: 'composicao',
    descricao: 'Converte para vertical com fundo desfocado, pronto para Reels/Shorts/TikTok.',
    opcoes: []
  },
  {
    id: 'delogo',
    rotulo: 'Remover logo / marca d’água',
    categoria: 'utilidades',
    descricao: 'Aplica delogo numa região retangular (funciona melhor em fundos uniformes).',
    opcoes: ['regiao']
  },
  {
    id: 'borrar-regiao',
    rotulo: 'Borrar ou esconder região',
    categoria: 'utilidades',
    descricao: 'Desfoca uma área para ocultar rostos, placas, números ou marcas.',
    opcoes: ['regiao', 'intensidade']
  },
  {
    id: 'proxy',
    rotulo: 'Proxy leve para edição',
    categoria: 'utilidades',
    descricao: 'Gera uma cópia 540p leve para editar sem travar em PCs modestos.',
    opcoes: []
  },
  {
    id: 'lente',
    rotulo: 'Correção de lente (action cam)',
    categoria: 'utilidades',
    descricao: 'Corrige distorção de lentes grande-angulares (GoPro, drones, webcams).',
    opcoes: ['intensidade']
  },
  {
    id: 'gif',
    rotulo: 'Exportar GIF',
    categoria: 'utilidades',
    descricao: 'Cria um GIF otimizado a partir de até 10 segundos do vídeo.',
    opcoes: ['duracao', 'tamanho']
  },
  {
    id: 'extrair-audio',
    rotulo: 'Extrair áudio (MP3)',
    categoria: 'utilidades',
    descricao: 'Separa a trilha sonora em MP3 para reutilizar em outro projeto.',
    opcoes: []
  }
]

function clamp(v: unknown, min: number, max: number, padrao: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : padrao
  return Math.min(max, Math.max(min, n))
}

function corHex(cor: unknown): string {
  const c = String(cor || '').trim()
  return /^#[0-9a-f]{6}$/i.test(c) ? c : '#ffffff'
}

function escaparFiltroCaminho(caminho: string): string {
  return caminho.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

export function cadeiaAtempo(taxa: number): string[] {
  let restante = Math.min(16, Math.max(0.0625, taxa))
  const partes: string[] = []
  while (restante > 2 + 1e-9) {
    partes.push('atempo=2')
    restante /= 2
  }
  while (restante < 0.5 - 1e-9) {
    partes.push('atempo=0.5')
    restante /= 0.5
  }
  if (Math.abs(restante - 1) > 0.001) partes.push('atempo=' + String(+restante.toFixed(4)))
  return partes
}

export function filtrosAprimorar(o: Pick<OpcoesEfeitoVideo, 'fator' | 'denoise' | 'nitidez' | 'grao'>): string[] {
  const fator = clamp(o.fator, 1, 4, 2)
  const denoise = clamp(o.denoise, 0, 1, 0.25)
  const nitidez = clamp(o.nitidez, 0, 2, 0.7)
  const grao = clamp(o.grao, 0, 100, 0)
  const filtros: string[] = []
  if (fator > 1.001) filtros.push('scale=trunc(iw*' + fator + '/2)*2:trunc(ih*' + fator + '/2)*2:flags=lanczos')
  if (denoise > 0.001) filtros.push('hqdn3d=' + (denoise * 6).toFixed(2) + ':' + (denoise * 4).toFixed(2) + ':' + (denoise * 8).toFixed(2))
  if (nitidez > 0.001) filtros.push('unsharp=5:5:' + nitidez.toFixed(2) + ':5:5:0')
  if (grao > 0.001) filtros.push('noise=alls=' + Math.round(grao) + ':allf=t')
  return filtros.length ? filtros : ['null']
}

export function filtrosInterpolar(o: Pick<OpcoesEfeitoVideo, 'fps' | 'suave' | 'slow'>): { video: string[]; audio: string[] } {
  const fps = Math.round(clamp(o.fps, 15, 240, 60))
  const slow = clamp(o.slow, 1, 8, 1)
  const modo = o.suave ? 'blend' : 'mci'
  const video = [
    'minterpolate=fps=' + fps + ':mi_mode=' + modo + (modo === 'mci' ? ':mc_mode=aobmc:me_mode=bidir:vsbmc=1' : '')
  ]
  const audio: string[] = []
  if (slow > 1.001) {
    video.push('setpts=PTS*' + slow.toFixed(3))
    audio.push(...cadeiaAtempo(1 / slow))
  }
  return { video, audio }
}

export function filtrosVelocidade(taxa: number): { video: string[]; audio: string[] } {
  const t = clamp(taxa, 0.25, 4, 1)
  return {
    video: Math.abs(t - 1) < 0.001 ? [] : ['setpts=PTS/' + t.toFixed(4)],
    audio: Math.abs(t - 1) < 0.001 ? [] : cadeiaAtempo(t)
  }
}

export function filtrosCorPreset(preset: unknown): string[] {
  const p = PRESETS_COR.find((x) => x.id === preset) || PRESETS_COR[0]
  return p.filtros
}

export function filtroTitulo(o: Pick<OpcoesEfeitoVideo, 'cor' | 'tamanho' | 'posicao'>, caminhoTexto: string): string {
  const posicao = o.posicao || 'base'
  const xy =
    posicao === 'centro'
      ? '(w-text_w)/2:(h-text_h)/2'
      : posicao === 'topo'
        ? '(w-text_w)/2:40'
        : '(w-text_w)/2:h-text_h-40'
  const tamanho = Math.round(clamp(o.tamanho, 12, 200, 48))
  return (
    "drawtext=textfile='" +
    escaparFiltroCaminho(caminhoTexto) +
    "':fontcolor=" +
    corHex(o.cor) +
    ':fontsize=' +
    tamanho +
    ':x=' +
    xy.split(':')[0] +
    ':y=' +
    xy.split(':')[1] +
    ':box=1:boxcolor=black@0.45:boxborderw=14'
  )
}

export function filtroDelogo(regiao: Regiao, largura: number, altura: number): string {
  const x = Math.round(Math.min(Math.max(1, regiao.x), Math.max(1, largura - 4)))
  const y = Math.round(Math.min(Math.max(1, regiao.y), Math.max(1, altura - 4)))
  const w = Math.round(Math.min(Math.max(2, regiao.w), Math.max(2, largura - x - 1)))
  const h = Math.round(Math.min(Math.max(2, regiao.h), Math.max(2, altura - y - 1)))
  return 'delogo=x=' + x + ':y=' + y + ':w=' + w + ':h=' + h
}

export function filtrosBorrarRegiao(regiao: Regiao, intensidade: number): string {
  const x = Math.max(0, Math.round(regiao.x))
  const y = Math.max(0, Math.round(regiao.y))
  const w = Math.max(2, Math.round(regiao.w))
  const h = Math.max(2, Math.round(regiao.h))
  const forca = Math.round(clamp(intensidade, 1, 30, 10))
  return [
    'split[base][area]',
    '[area]crop=' + w + ':' + h + ':' + x + ':' + y + ',boxblur=' + forca + ':' + Math.max(1, Math.round(forca / 5)) + '[borrado]',
    '[base][borrado]overlay=' + x + ':' + y
  ].join(';')
}

export function filtrosReframe(largura: number, altura: number): string {
  const W = 1080
  const H = 1920
  const fgW = Math.round((Math.min(largura / altura, W / H) * H) / 2) * 2
  return [
    'split[bg][fg]',
    '[bg]scale=' + W + ':' + H + ':force_original_aspect_ratio=increase,crop=' + W + ':' + H + ',gblur=sigma=40[bg2]',
    '[fg]scale=' + fgW + ':-2:flags=lanczos[fg2]',
    '[bg2][fg2]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p'
  ].join(';')
}

export function filtrosPip(
  escala: number,
  posicao: OpcoesEfeitoVideo['posicaoPip'],
  opacidade: number
): string {
  const e = clamp(escala, 0.05, 1, 0.3)
  const a = clamp(opacidade, 0.05, 1, 1)
  const x =
    posicao === 'inferior-esquerdo' || posicao === 'superior-esquerdo' ? '24' : 'W-w-24'
  const y = posicao === 'superior-direito' || posicao === 'superior-esquerdo' ? '24' : 'H-h-24'
  return (
    '[1:v]scale=trunc(iw*' +
    e.toFixed(3) +
    '/2)*2:-2,format=rgba,colorchannelmixer=aa=' +
    a.toFixed(2) +
    '[pip];[0:v][pip]overlay=' +
    x +
    ':' +
    y +
    ':shortest=1'
  )
}

export function filtrosChroma(cor: string, similaridade: number, mistura: number, largura: number, altura: number): string {
  const c = /^#?[0-9a-f]{6}$/i.test(String(cor || '').trim()) ? String(cor).replace('#', '').toLowerCase() : '00ff00'
  const s = clamp(similaridade, 0.01, 1, 0.16)
  const b = clamp(mistura, 0, 1, 0.1)
  return [
    '[0:v]chromakey=0x' + c + ':' + s.toFixed(2) + ':' + b.toFixed(2) + '[fg]',
    '[1:v]scale=' + largura + ':' + altura + ':force_original_aspect_ratio=increase,crop=' + largura + ':' + altura + '[bg]',
    '[bg][fg]overlay=shortest=1,format=yuv420p'
  ].join(';')
}

export function larguraAlturaTransicao(info: InfoMidia): { w: number; h: number; fps: number } {
  const w = info.largura > 0 ? info.largura : 1280
  const h = info.altura > 0 ? info.altura : 720
  return { w: w - (w % 2), h: h - (h % 2), fps: clamp(info.fps, 15, 120, 30) }
}

export function filtrosTransicao(
  durA: number,
  duracao: number,
  tipo: string,
  info: InfoMidia,
  comAudio: boolean
): string {
  const t = (TRANSICOES as readonly string[]).includes(tipo) ? tipo : 'fade'
  const d = clamp(duracao, 0.2, Math.max(0.2, durA - 0.1), 1)
  const offset = Math.max(0.05, durA - d).toFixed(3)
  const { w, h, fps } = larguraAlturaTransicao(info)
  const normalizar = (i: number) =>
    '[' + i + ':v]scale=' + w + ':' + h + ':force_original_aspect_ratio=decrease,' +
    'pad=' + w + ':' + h + ':(ow-iw)/2:(oh-ih)/2,setsar=1,fps=' + fps + ',format=yuv420p[v' + i + ']'
  const partes = [normalizar(0), normalizar(1)]
  partes.push('[v0][v1]xfade=transition=' + t + ':duration=' + d.toFixed(2) + ':offset=' + offset + '[v]')
  if (comAudio) {
    partes.push('[0:a]aresample=async=1:first_pts=0,aformat=sample_rates=48000:channel_layouts=stereo[a0]')
    partes.push('[1:a]aresample=async=1:first_pts=0,aformat=sample_rates=48000:channel_layouts=stereo[a1]')
    partes.push('[a0][a1]acrossfade=d=' + d.toFixed(2) + ':c1=tri:c2=tri[a]')
  }
  return partes.join(';')
}

async function probeInfo(entrada: string): Promise<InfoMidia> {
  const r = await rodar(
    binarioResolvido('ffprobe'),
    ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate', '-of', 'json', entrada],
    30_000
  )
  const vazio: InfoMidia = { duracao: 0, largura: 0, altura: 0, fps: 0, temAudio: false }
  if (!r.ok) return vazio
  try {
    const j = JSON.parse(r.stdout) as {
      format?: { duration?: string }
      streams?: { codec_type?: string; width?: number; height?: number; r_frame_rate?: string }[]
    }
    const v = (j.streams || []).find((s) => s.codec_type === 'video')
    const audio = (j.streams || []).some((s) => s.codec_type === 'audio')
    let fps = 0
    if (v?.r_frame_rate) {
      const [n, d] = v.r_frame_rate.split('/').map(Number)
      if (d > 0) fps = n / d
    }
    return {
      duracao: Number(j.format?.duration) || 0,
      largura: Number(v?.width) || 0,
      altura: Number(v?.height) || 0,
      fps,
      temAudio: audio
    }
  } catch {
    return vazio
  }
}

function falhaFfmpeg(r: { erro?: string; stderr: string }): string {
  return 'ffmpeg falhou: ' + (r.erro || r.stderr.split(/\r?\n/).slice(-3).join(' ')).slice(0, 400)
}

function saidaOk(raiz: string, destino: string, extra?: Partial<RespostaMidia>): RespostaMidia {
  const ext = extname(destino).toLowerCase()
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: statSync(destino).size,
    mime: mimePorExt(ext),
    previewBase64: ext === '.gif' || /^\.(png|jpe?g|webp)$/.test(ext) ? previewDe(destino) : undefined,
    aviso: 'Efeito local via ffmpeg (grátis).',
    ...extra
  }
}

/** Catálogo de efeitos para a UI e para o agente. */
export function catalogoEfeitos(): {
  efeitos: typeof CATALOGO_EFEITOS
  cores: { id: PresetCor; rotulo: string }[]
  transicoes: string[]
} {
  return {
    efeitos: CATALOGO_EFEITOS,
    cores: PRESETS_COR.map((p) => ({ id: p.id, rotulo: p.rotulo })),
    transicoes: [...TRANSICOES]
  }
}

/** Aplica um efeito de vídeo e grava o resultado dentro do projeto. */
export async function aplicarEfeitoVideo(raiz: string, opts: OpcoesEfeitoVideo): Promise<RespostaMidia> {
  const efeito = opts.efeito
  if (!CATALOGO_EFEITOS.some((e) => e.id === efeito)) return { ok: false, erro: 'efeito desconhecido: ' + String(efeito) }
  const invalido = validarEntrada(opts.entrada, 'video')
  if (invalido) return { ok: false, erro: invalido }
  if ((efeito === 'transicao' || efeito === 'pip' || efeito === 'chromakey') && !opts.segunda) {
    return { ok: false, erro: 'este efeito precisa de um segundo arquivo (imagem, vídeo ou fundo)' }
  }
  if (opts.segunda) {
    const invalido2 = validarEntrada(opts.segunda, 'midia')
    if (invalido2) return { ok: false, erro: invalido2 }
  }

  const info = await probeInfo(opts.entrada)
  const ff = binarioResolvido('ffmpeg')
  const baseArgs = ['-y', '-i', opts.entrada]
  const encode = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
  const audioCopy = info.temAudio ? ['-c:a', 'aac', '-b:a', '160k'] : ['-an']

  if (efeito === 'extrair-audio') {
    if (!info.temAudio) return { ok: false, erro: 'o vídeo não tem faixa de áudio' }
    const destino = destinoArquivo(raiz, nomeArquivo('audio-extraido', '.mp3'), opts.saida)
    const r = await rodar(ff, ['-y', '-i', opts.entrada, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', destino], 600_000)
    if (!r.ok || !existsSync(destino)) return { ok: false, erro: falhaFfmpeg(r) }
    return saidaOk(raiz, destino, { aviso: 'Áudio extraído em MP3 (grátis).' })
  }

  if (efeito === 'gif') {
    const dur = clamp(opts.duracao, 1, 10, 5)
    const largura = Math.round(clamp(opts.tamanho, 160, 960, 480))
    const destino = destinoArquivo(raiz, nomeArquivo('animacao', '.gif'), opts.saida)
    const vf =
      'fps=12,scale=' + largura + ':-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse'
    const r = await rodar(
      ff,
      ['-y', '-t', String(dur), '-i', opts.entrada, '-vf', vf, '-loop', '0', destino],
      600_000
    )
    if (!r.ok || !existsSync(destino)) return { ok: false, erro: falhaFfmpeg(r) }
    return saidaOk(raiz, destino, { aviso: 'GIF de ' + dur.toFixed(0) + 's a 12 fps (grátis).' })
  }

  if (efeito === 'titulo') {
    const texto = String(opts.texto || '').trim()
    if (!texto) return { ok: false, erro: 'informe o texto do título' }
    if (texto.length > 200) return { ok: false, erro: 'título muito longo (máx. 200 caracteres)' }
    const destino = destinoArquivo(raiz, nomeArquivo('titulo', '.mp4'), opts.saida)
    const tmp = mkdtempSync(join(tmpdir(), 'dg-titulo-'))
    try {
      const txt = join(tmp, 'titulo.txt')
      writeFileSync(txt, texto, 'utf8')
      const vf = filtroTitulo(opts, txt)
      const r = await rodar(ff, [...baseArgs, '-vf', vf, ...encode, ...audioCopy, destino], 1_800_000)
      if (!r.ok || !existsSync(destino)) return { ok: false, erro: falhaFfmpeg(r) }
      return saidaOk(raiz, destino, { aviso: 'Título gravado no vídeo (grátis).' })
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }

  if (efeito === 'delogo' || efeito === 'borrar-regiao') {
    const reg = opts.regiao
    if (!reg || ![reg.x, reg.y, reg.w, reg.h].every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return { ok: false, erro: 'informe a região (x, y, w, h em pixels)' }
    }
    const w = info.largura || 1920
    const h = info.altura || 1080
    const destino = destinoArquivo(raiz, nomeArquivo(efeito, '.mp4'), opts.saida)
    if (efeito === 'delogo') {
      const r = await rodar(
        ff,
        [...baseArgs, '-vf', filtroDelogo(reg, w, h), ...encode, ...audioCopy, destino],
        1_800_000
      )
      if (!r.ok || !existsSync(destino)) return { ok: false, erro: falhaFfmpeg(r) }
    } else {
      const fc = filtrosBorrarRegiao(reg, opts.intensidade ?? 10) + '[v]'
      const args = ['-y', '-i', opts.entrada, '-filter_complex', fc, '-map', '[v]', ...encode]
      if (info.temAudio) args.push('-map', '0:a?', '-c:a', 'aac', '-b:a', '160k')
      args.push(destino)
      const r = await rodar(ff, args, 1_800_000)
      if (!r.ok || !existsSync(destino)) return { ok: false, erro: falhaFfmpeg(r) }
    }
    return saidaOk(raiz, destino)
  }

  if (efeito === 'reframe') {
    const destino = destinoArquivo(raiz, nomeArquivo('vertical', '.mp4'), opts.saida)
    const vf = filtrosReframe(info.largura || 1920, info.altura || 1080)
    const r = await rodar(ff, [...baseArgs, '-filter_complex', vf, ...encode, ...audioCopy, destino], 1_800_000)
    if (!r.ok || !existsSync(destino)) return { ok: false, erro: falhaFfmpeg(r) }
    return saidaOk(raiz, destino, { aviso: 'Reenquadrado em 1080×1920 com fundo desfocado (grátis).' })
  }

  if (efeito === 'transicao') {
    if (!opts.segunda) return { ok: false, erro: 'informe o segundo vídeo' }
    const infoB = await probeInfo(opts.segunda)
    const dA = info.duracao || 1
    const comAudio = info.temAudio && infoB.temAudio
    const destino = destinoArquivo(raiz, nomeArquivo('transicao', '.mp4'), opts.saida)
    const fc = filtrosTransicao(dA, opts.duracao ?? 1, String(opts.tipo || 'fade'), info, comAudio)
    const args = ['-y', '-i', opts.entrada, '-i', opts.segunda, '-filter_complex', fc, '-map', '[v]']
    if (comAudio) args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '160k')
    else args.push('-an')
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', destino)
    const r = await rodar(ff, args, 1_800_000)
    if (!r.ok || !existsSync(destino)) return { ok: false, erro: falhaFfmpeg(r) }
    return saidaOk(raiz, destino, {
      aviso: 'Transição "' + String(opts.tipo || 'fade') + '" aplicada (grátis).' + (comAudio ? '' : ' O resultado ficou sem áudio porque os clipes diferem na faixa de áudio.')
    })
  }

  if (efeito === 'pip' || efeito === 'chromakey') {
    if (!opts.segunda) return { ok: false, erro: 'informe o segundo arquivo' }
    const destino = destinoArquivo(raiz, nomeArquivo(efeito, '.mp4'), opts.saida)
    const extSeg = extname(opts.segunda).toLowerCase()
    const ehImagem = /^\.(png|jpe?g|webp|bmp|gif)$/.test(extSeg)
    const entradaSeg = ehImagem ? ['-loop', '1', '-i', opts.segunda] : ['-i', opts.segunda]
    const fc =
      efeito === 'pip'
        ? filtrosPip(opts.escala ?? 0.3, opts.posicaoPip, opts.opacidade ?? 1)
        : filtrosChroma(String(opts.cor || '#00ff00'), opts.similaridade ?? 0.16, opts.mistura ?? 0.1, info.largura || 1280, info.altura || 720)
    const args = ['-y', '-i', opts.entrada, ...entradaSeg, '-filter_complex', fc, '-map', '0:a?']
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart')
    if (info.temAudio) args.push('-c:a', 'aac', '-b:a', '160k')
    args.push('-shortest', destino)
    const r = await rodar(ff, args, 1_800_000)
    if (!r.ok || !existsSync(destino)) return { ok: false, erro: falhaFfmpeg(r) }
    return saidaOk(raiz, destino)
  }

  if (efeito === 'boomerang') {
    const destino = destinoArquivo(raiz, nomeArquivo('boomerang', '.mp4'), opts.saida)
    const partes = ['[0:v]split=2[v1][v2]', '[v2]reverse[vr]', '[v1][vr]concat=n=2:v=1:a=0[v]']
    if (info.temAudio) {
      partes.push('[0:a]asplit=2[a1][a2]', '[a2]areverse[ar]', '[a1][ar]concat=n=2:v=0:a=1[a]')
    }
    const args = ['-y', '-i', opts.entrada, '-filter_complex', partes.join(';'), '-map', '[v]']
    if (info.temAudio) args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '160k')
    else args.push('-an')
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', destino)
    const r = await rodar(ff, args, 1_800_000)
    if (!r.ok || !existsSync(destino)) return { ok: false, erro: falhaFfmpeg(r) }
    return saidaOk(raiz, destino, { duracaoSeg: info.duracao ? +(info.duracao * 2).toFixed(2) : undefined })
  }

  // Efeitos de fluxo simples: uma entrada, -vf/-af.
  let vf: string[] = []
  let af: string[] = []
  let crf = '20'
  let preset = 'veryfast'

  if (efeito === 'aprimorar') {
    vf = filtrosAprimorar(opts)
  } else if (efeito === 'interpolar') {
    const f = filtrosInterpolar(opts)
    vf = f.video
    af = f.audio
  } else if (efeito === 'velocidade') {
    const f = filtrosVelocidade(opts.taxa ?? 1)
    vf = f.video
    af = f.audio
  } else if (efeito === 'cor') {
    vf = filtrosCorPreset(opts.preset)
  } else if (efeito === 'lente') {
    const i = clamp(opts.intensidade, -1, 1, 0.3)
    vf = ['lenscorrection=k1=' + (-0.35 * i).toFixed(3) + ':k2=' + (0.12 * i).toFixed(3)]
  } else if (efeito === 'proxy') {
    vf = ['scale=-2:540:flags=lanczos']
    crf = '28'
    preset = 'ultrafast'
  }

  const destino = destinoArquivo(raiz, nomeArquivo(efeito, '.mp4'), opts.saida)
  const args = [...baseArgs]
  if (vf.length) args.push('-vf', vf.join(','))
  if (af.length && info.temAudio) args.push('-af', af.join(','))
  args.push('-c:v', 'libx264', '-preset', preset, '-crf', crf, '-pix_fmt', 'yuv420p', '-movflags', '+faststart')
  if (info.temAudio) args.push('-c:a', 'aac', '-b:a', '160k')
  else args.push('-an')
  args.push(destino)
  const r = await rodar(ff, args, 3_600_000)
  if (!r.ok || !existsSync(destino)) return { ok: false, erro: falhaFfmpeg(r) }
  return saidaOk(raiz, destino, {
    duracaoSeg:
      efeito === 'velocidade' && info.duracao
        ? +(info.duracao / clamp(opts.taxa, 0.25, 4, 1)).toFixed(2)
        : efeito === 'interpolar' && info.duracao
          ? +(info.duracao * clamp(opts.slow, 1, 8, 1)).toFixed(2)
          : info.duracao || undefined
  })
}

/** Detecta cortes de cena e gera miniaturas — base para montar destaques. */
export async function detectarCenas(
  raiz: string,
  opts: { entrada: string; limiar?: number; max?: number }
): Promise<RespostaMidia> {
  const invalido = validarEntrada(opts.entrada, 'video')
  if (invalido) return { ok: false, erro: invalido }
  const limiar = clamp(opts.limiar, 0.05, 0.95, 0.32)
  const max = Math.round(clamp(opts.max, 1, 60, 12))
  const r = await rodar(
    binarioResolvido('ffmpeg'),
    ['-y', '-i', opts.entrada, '-vf', "select='gt(scene," + limiar + ")',showinfo", '-an', '-f', 'null', '-'],
    1_800_000
  )
  if (!r.ok) return { ok: false, erro: falhaFfmpeg(r) }
  const tempos = [...r.stderr.matchAll(/pts_time:([0-9.]+)/g)].map((m) => Number(m[1])).filter((n) => Number.isFinite(n))
  const unicos = [...new Set(tempos.map((t) => +t.toFixed(2)))].slice(0, max)
  if (!unicos.length) return { ok: false, erro: 'nenhuma mudança de cena acima do limiar ' + limiar }
  const dir = join(pastaMidia(raiz), 'cenas-' + Date.now())
  mkdirSync(dir, { recursive: true })
  const cenas: { tempo: number; miniatura: string }[] = []
  for (let i = 0; i < unicos.length; i++) {
    const jpg = join(dir, 'cena-' + String(i + 1).padStart(2, '0') + '.jpg')
    const f = await rodar(
      binarioResolvido('ffmpeg'),
      ['-y', '-ss', unicos[i].toFixed(2), '-i', opts.entrada, '-frames:v', '1', '-vf', 'scale=480:-2:flags=lanczos', jpg],
      120_000
    )
    if (f.ok && existsSync(jpg)) cenas.push({ tempo: unicos[i], miniatura: caminhoRelativo(raiz, jpg) })
  }
  const manifest = join(dir, 'cenas.json')
  writeFileSync(manifest, JSON.stringify({ limiar, cenas }, null, 2), 'utf8')
  return {
    ok: true,
    caminho: manifest,
    caminhoRel: caminhoRelativo(raiz, manifest),
    bytes: statSync(manifest).size,
    mime: 'application/json',
    detalhes: { cenas, total: cenas.length },
    aviso: cenas.length + ' corte(s) de cena detectado(s) — use os tempos para montar os destaques na linha do tempo.'
  }
}
