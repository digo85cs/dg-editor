/**
 * Núcleo do Estúdio de mídia.
 *
 * Só usa ferramentas gratuitas:
 * - Pollinations (imagem, sem chave; 1 imagem/45s por IP);
 * - mermaid.ink (diagramas);
 * - ffmpeg/ffprobe (upscale, slideshow, corte, junção, capa, legendas);
 * - faster-whisper (transcrição local);
 * - edge-tts (narração neural gratuita).
 *
 * Sem importações do Electron: o mesmo código roda no processo principal e no
 * subprocesso do servidor MCP.
 */
import { spawn } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { homedir } from 'node:os'
import { caminhoDentroDaRaiz } from '../paths'
import {
  acharVoz,
  arquivoKokoro,
  arquivoPiper,
  diagnosticoVozes,
  pastaTts,
  type DiagnosticoVozes,
  type Voz
} from './vozes'

export type RespostaMidia = {
  ok: boolean
  erro?: string
  codigo?: string
  caminho?: string
  caminhoRel?: string
  bytes?: number
  mime?: string
  previewBase64?: string
  aviso?: string
  retrySegundos?: number
  duracaoSeg?: number
  texto?: string
  detalhes?: Record<string, unknown>
}

export type StatusMidia = {
  ok: boolean
  ferramentas: Record<string, { ok: boolean; versao?: string; erro?: string }>
  vozes?: DiagnosticoVozes
  online: Record<string, string>
  pasta?: string
}

const LIMITE_PREVIEW = 4 * 1024 * 1024
const LIMITE_DOWNLOAD = 25 * 1024 * 1024

const EXTS_IMAGEM = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])
const EXTS_VIDEO = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'])
const EXTS_AUDIO = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac'])

function bin(nome: string, env: string): string {
  const custom = process.env[env]
  return custom && custom.trim() ? custom.trim() : nome
}

function ffmpegBin(): string {
  return bin('ffmpeg', 'DG_FFMPEG')
}

function ffprobeBin(): string {
  return bin('ffprobe', 'DG_FFPROBE')
}

function pythonBin(): string {
  return bin('python', 'DG_PYTHON')
}

function edgeTtsBin(): string {
  return bin('edge-tts', 'DG_EDGE_TTS')
}

function clampNum(valor: unknown, min: number, max: number, padrao: number): number {
  const n = typeof valor === 'number' && Number.isFinite(valor) ? valor : padrao
  return Math.min(max, Math.max(min, n))
}

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Nome de arquivo seguro (sem acentos/símbolos), com limite de tamanho. */
export function slug(texto: string, max = 48): string {
  const base = String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return (base || 'midia').slice(0, max).replace(/-+$/g, '') || 'midia'
}

/** Nome com carimbo de tempo + sufixo curto para evitar colisão. */
export function nomeArquivo(prefixo: string, ext: string, quando = new Date()): string {
  const p = slug(prefixo, 40)
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp =
    quando.getFullYear() +
    pad(quando.getMonth() + 1) +
    pad(quando.getDate()) +
    '-' +
    pad(quando.getHours()) +
    pad(quando.getMinutes()) +
    pad(quando.getSeconds())
  const rand = Math.random().toString(36).slice(2, 6)
  return p + '-' + stamp + '-' + rand + (ext.startsWith('.') ? ext : '.' + ext)
}

/** Pasta padrão de saída: <projeto>/.dg-editor/midia. */
export function pastaMidia(raiz: string): string {
  const p = join(resolve(raiz), '.dg-editor', 'midia')
  mkdirSync(p, { recursive: true })
  return p
}

/**
 * Resolve o destino dentro do projeto. `saida` pode ser:
 * - vazio: pasta padrão de mídia;
 * - um diretório (sem extensão);
 * - um arquivo absoluto/relativo (com extensão).
 * Caminhos fora da raiz são recusados.
 */
export function destinoArquivo(raiz: string, nome: string, saida?: string): string {
  const base = typeof saida === 'string' ? saida.trim() : ''
  let alvo: string
  if (!base) alvo = join(pastaMidia(raiz), nome)
  else {
    const abs = resolve(raiz, base)
    alvo = extname(abs) ? abs : join(abs, nome)
  }
  const dentro = caminhoDentroDaRaiz(raiz, alvo)
  mkdirSync(dirname(dentro.abs), { recursive: true })
  return dentro.abs
}

/** Valida um arquivo de entrada e o formato esperado. Retorna erro ou null. */
export function validarEntrada(caminho: string, tipos: 'imagem' | 'video' | 'audio' | 'midia'): string | null {
  if (typeof caminho !== 'string' || !caminho.trim()) return 'informe o caminho do arquivo'
  if (!existsSync(caminho)) return 'arquivo não encontrado: ' + caminho
  let st: ReturnType<typeof statSync>
  try {
    st = statSync(caminho)
  } catch {
    return 'arquivo inacessível: ' + caminho
  }
  if (!st.isFile()) return 'o caminho não é um arquivo: ' + caminho
  const ext = extname(caminho).toLowerCase()
  const ok =
    (tipos === 'imagem' && EXTS_IMAGEM.has(ext)) ||
    (tipos === 'video' && EXTS_VIDEO.has(ext)) ||
    (tipos === 'audio' && EXTS_AUDIO.has(ext)) ||
    (tipos === 'midia' && (EXTS_IMAGEM.has(ext) || EXTS_VIDEO.has(ext) || EXTS_AUDIO.has(ext)))
  return ok ? null : 'formato não suportado (' + ext + ') para ' + tipos
}

export function mimePorExt(ext: string): string {
  const e = ext.toLowerCase()
  if (e === '.png') return 'image/png'
  if (e === '.webp') return 'image/webp'
  if (e === '.gif') return 'image/gif'
  if (e === '.bmp') return 'image/bmp'
  if (e === '.svg') return 'image/svg+xml'
  if (e === '.mp4' || e === '.m4v') return 'video/mp4'
  if (e === '.webm') return 'video/webm'
  if (e === '.mov') return 'video/quicktime'
  if (e === '.mp3') return 'audio/mpeg'
  if (e === '.wav') return 'audio/wav'
  if (e === '.m4a') return 'audio/mp4'
  if (e === '.ogg') return 'audio/ogg'
  return 'image/jpeg'
}

/** Data URI para prévia no renderer (limite de 4 MB). */
export function previewDe(caminho: string): string | undefined {
  try {
    const st = statSync(caminho)
    if (!st.isFile() || st.size > LIMITE_PREVIEW) return undefined
    return 'data:' + mimePorExt(extname(caminho)) + ';base64,' + readFileSync(caminho).toString('base64')
  } catch {
    return undefined
  }
}

export function caminhoRelativo(raiz: string, abs: string): string {
  return relative(resolve(raiz), abs).replace(/\\/g, '/')
}

// ---------------------------------------------------------------- processos

type SaidaProcesso = { ok: boolean; codigo?: number; stdout: string; stderr: string; erro?: string }

export function rodar(
  binario: string,
  args: string[],
  timeoutMs = 120_000,
  env: NodeJS.ProcessEnv = process.env
): Promise<SaidaProcesso> {
  return new Promise((finalizar) => {
    let stdout = ''
    let stderr = ''
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(binario, args, { windowsHide: true, env })
    } catch (e) {
      finalizar({ ok: false, stdout, stderr, erro: e instanceof Error ? e.message : String(e) })
      return
    }
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* */
      }
      finalizar({ ok: false, codigo: -1, stdout, stderr, erro: 'timeout após ' + Math.round(timeoutMs / 1000) + 's' })
    }, timeoutMs)
    child.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString('utf8')
      if (stdout.length > 4_000_000) stdout = stdout.slice(-4_000_000)
    })
    child.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString('utf8')
      if (stderr.length > 4_000_000) stderr = stderr.slice(-4_000_000)
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      finalizar({ ok: false, stdout, stderr, erro: e.message })
    })
    child.on('close', (codigo) => {
      clearTimeout(timer)
      finalizar({ ok: codigo === 0, codigo: codigo ?? undefined, stdout, stderr })
    })
  })
}

async function versaoCmd(binario: string, args: string[], timeoutMs = 6000): Promise<{ ok: boolean; versao?: string; erro?: string }> {
  const r = await rodar(binario, args, timeoutMs)
  if (!r.ok) return { ok: false, erro: r.erro || (r.stderr || '').split(/\r?\n/)[0]?.slice(0, 160) || 'falhou' }
  const linha = (r.stdout || r.stderr || '').split(/\r?\n/).find((l) => l.trim())
  return { ok: true, versao: (linha || '').trim().slice(0, 120) }
}

// ---------------------------------------------------------------- baixar

type Download = {
  ok: boolean
  buffer?: Buffer
  mime?: string
  erro?: string
  codigo?: string
  retrySegundos?: number
  status?: number
}

async function baixarBinario(url: string, timeoutMs = 120_000): Promise<Download> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'DG-Editor/0.2 (estudio-midia)', Accept: 'image/*,text/plain,application/json,*/*' }
    })
    const mime = (res.headers.get('content-type') || '').toLowerCase()
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      if (res.status === 402 || res.status === 429) {
        const lim = extrairLimitePollinations(txt)
        return { ok: false, erro: lim.mensagem, codigo: 'FREE_LIMIT', retrySegundos: lim.retrySegundos, status: res.status }
      }
      return { ok: false, erro: 'HTTP ' + res.status + ' ' + txt.slice(0, 200), status: res.status }
    }
    const ab = await res.arrayBuffer()
    const buffer = Buffer.from(ab)
    if (buffer.length === 0) return { ok: false, erro: 'resposta vazia' }
    if (buffer.length > LIMITE_DOWNLOAD) return { ok: false, erro: 'resposta grande demais (> ' + Math.round(LIMITE_DOWNLOAD / 1024 / 1024) + ' MB)' }
    return { ok: true, buffer, mime }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, erro: /timeout|abort/i.test(msg) ? 'tempo esgotado ao baixar' : msg }
  }
}

/** Extrai "Retry after 22s" da resposta 402 do Pollinations. */
export function extrairLimitePollinations(corpo: string): { retrySegundos?: number; mensagem: string } {
  try {
    const j = JSON.parse(corpo) as { error?: { message?: string }; message?: string }
    const msg = String(j?.error?.message || j?.message || '')
    const m = /retry after\s+(\d+)\s*s/i.exec(msg)
    return { retrySegundos: m ? Number(m[1]) : undefined, mensagem: msg || 'limite gratuito atingido' }
  } catch {
    return { mensagem: (corpo || '').slice(0, 200) || 'limite gratuito atingido' }
  }
}

/** URL do Pollinations (modelo gratuito padrão). */
export function urlPollinations(o: { prompt: string; largura?: number; altura?: number; seed?: number; modelo?: string }): string {
  const largura = Math.round(clampNum(o.largura, 64, 1536, 1024))
  const altura = Math.round(clampNum(o.altura, 64, 1536, 1024))
  const params = new URLSearchParams()
  params.set('width', String(largura))
  params.set('height', String(altura))
  params.set('nologo', 'true')
  params.set('referrer', 'dg-editor')
  if (typeof o.seed === 'number' && Number.isFinite(o.seed)) params.set('seed', String(Math.floor(o.seed)))
  if (o.modelo && o.modelo.trim()) params.set('model', o.modelo.trim())
  return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(o.prompt.trim().slice(0, 1200)) + '?' + params.toString()
}

// ---------------------------------------------------------------- imagem

export async function gerarImagem(
  raiz: string,
  opts: { prompt: string; largura?: number; altura?: number; seed?: number; modelo?: string; saida?: string; esperarLimite?: boolean }
): Promise<RespostaMidia> {
  const prompt = String(opts.prompt || '').trim()
  if (!prompt) return { ok: false, erro: 'informe o prompt' }
  if (prompt.length > 1200) return { ok: false, erro: 'prompt muito longo (máx. 1200 caracteres)' }
  const url = urlPollinations(opts)
  const base = destinoArquivo(raiz, nomeArquivo(prompt, '.jpg'), opts.saida)

  let erro = ''
  let retrySegundos: number | undefined
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await baixarBinario(url, 180_000)
    if (r.ok && r.buffer) {
      const mime = r.mime || 'image/jpeg'
      if (!/^image\//.test(mime)) return { ok: false, erro: 'resposta inesperada: ' + mime }
      const ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg'
      const destino = base.replace(/\.jpg$/i, ext)
      writeFileSync(destino, r.buffer)
      return {
        ok: true,
        caminho: destino,
        caminhoRel: caminhoRelativo(raiz, destino),
        bytes: r.buffer.length,
        mime,
        previewBase64: previewDe(destino),
        aviso: 'Grátis via Pollinations (1 imagem a cada 45s por IP).'
      }
    }
    retrySegundos = r.retrySegundos
    if (r.codigo === 'FREE_LIMIT' && tentativa === 0 && opts.esperarLimite !== false && (retrySegundos || 0) <= 90) {
      await dormir((retrySegundos || 45) * 1000)
      continue
    }
    erro = r.erro || 'falha ao gerar imagem'
    break
  }
  return {
    ok: false,
    erro,
    codigo: 'FREE_LIMIT',
    retrySegundos,
    aviso: retrySegundos ? 'Aguarde ' + retrySegundos + 's ou use o ComfyUI local (ilimitado).' : undefined
  }
}

export async function gerarDiagrama(
  raiz: string,
  opts: { codigo: string; formato?: 'png' | 'svg'; tema?: 'light' | 'dark'; fundo?: string; saida?: string }
): Promise<RespostaMidia> {
  const codigo = String(opts.codigo || '').trim()
  if (!codigo) return { ok: false, erro: 'informe o código Mermaid' }
  if (codigo.length > 20_000) return { ok: false, erro: 'diagrama muito grande (máx. 20 mil caracteres)' }
  const formato = opts.formato === 'svg' ? 'svg' : 'png'
  const tema = opts.tema === 'dark' ? 'dark' : 'default'
  const payload = JSON.stringify({ code: codigo, mermaid: { theme: tema } })
  const b64 = Buffer.from(payload, 'utf8').toString('base64url')
  const fundo = opts.fundo || (tema === 'dark' ? '#111111' : 'white')
  const url = 'https://mermaid.ink/' + (formato === 'svg' ? 'svg' : 'img') + '/' + b64 + '?bgColor=' + encodeURIComponent(fundo)
  const r = await baixarBinario(url, 90_000)
  if (!r.ok || !r.buffer) return { ok: false, erro: r.erro || 'falha ao gerar diagrama' }
  const ext = formato === 'svg' ? '.svg' : '.png'
  const destino = destinoArquivo(raiz, nomeArquivo('diagrama', ext), opts.saida)
  writeFileSync(destino, r.buffer)
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: r.buffer.length,
    mime: formato === 'svg' ? 'image/svg+xml' : r.mime || 'image/png',
    previewBase64: formato === 'png' ? previewDe(destino) : undefined,
    aviso: 'Grátis via mermaid.ink.'
  }
}

export function construirArgsUpscale(entrada: string, saida: string, fator: number, nitidez: number): string[] {
  const f = clampNum(fator, 1, 4, 2)
  const a = clampNum(nitidez, 0, 2, 0.8)
  const filtros: string[] = []
  if (f > 1.001) filtros.push('scale=iw*' + f + ':ih*' + f + ':flags=lanczos')
  if (a > 0.001) filtros.push('unsharp=5:5:' + a)
  if (!filtros.length) filtros.push('null')
  return ['-y', '-i', entrada, '-vf', filtros.join(','), '-frames:v', '1', saida]
}

export async function melhorarImagem(
  raiz: string,
  opts: { entrada: string; fator?: number; nitidez?: number; formato?: 'png' | 'jpg'; saida?: string }
): Promise<RespostaMidia> {
  const invalido = validarEntrada(opts.entrada, 'imagem')
  if (invalido) return { ok: false, erro: invalido }
  const ext = opts.formato === 'jpg' ? '.jpg' : '.png'
  const destino = destinoArquivo(raiz, nomeArquivo(basename(opts.entrada, extname(opts.entrada)) + '-melhorada', ext), opts.saida)
  const args = construirArgsUpscale(opts.entrada, destino, clampNum(opts.fator, 1, 4, 2), clampNum(opts.nitidez, 0, 2, 0.8))
  const r = await rodar(ffmpegBin(), args, 180_000)
  if (!r.ok || !existsSync(destino)) {
    return { ok: false, erro: 'ffmpeg falhou: ' + (r.erro || r.stderr.split(/\r?\n/).slice(-3).join(' ')).slice(0, 300) }
  }
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: statSync(destino).size,
    mime: mimePorExt(ext),
    previewBase64: previewDe(destino),
    aviso: 'Upscale + nitidez locais via ffmpeg (grátis).'
  }
}

// ---------------------------------------------------------------- vídeo

export function construirListaConcat(caminhos: string[]): string {
  return caminhos
    .map((p) => "file '" + p.replace(/\\/g, '/').replace(/'/g, "'\\''") + "'")
    .join('\n') + '\n'
}

export function construirArgsSegmento(
  imagem: string,
  saida: string,
  segundos: number,
  largura: number,
  altura: number,
  fps: number
): string[] {
  const dur = Math.max(0.5, segundos)
  const filtro = [
    'scale=' + largura + ':' + altura + ':force_original_aspect_ratio=decrease',
    'pad=' + largura + ':' + altura + ':(ow-iw)/2:(oh-ih)/2:color=black',
    'fps=' + fps,
    'format=yuv420p'
  ].join(',')
  return [
    '-y',
    '-loop', '1',
    '-t', String(dur),
    '-i', imagem,
    '-vf', filtro,
    '-an',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-t', String(dur),
    saida
  ]
}

export function parseTempo(valor: string | number): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor) && valor >= 0) return valor
  const t = String(valor || '').trim()
  if (!t) return null
  const partes = t.split(':').map((p) => Number(p.replace(',', '.')))
  if (partes.some((n) => !Number.isFinite(n) || n < 0)) return null
  if (partes.length === 1) return partes[0]
  if (partes.length === 2) return partes[0] * 60 + partes[1]
  if (partes.length === 3) return partes[0] * 3600 + partes[1] * 60 + partes[2]
  return null
}

export function construirArgsCorte(entrada: string, saida: string, inicioSeg: number, fimSeg: number): string[] {
  const ini = Math.max(0, inicioSeg)
  const dur = Math.max(0.1, fimSeg - ini)
  return [
    '-y',
    '-ss', ini.toFixed(3),
    '-i', entrada,
    '-t', dur.toFixed(3),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-movflags', '+faststart',
    saida
  ]
}

export async function fotosParaVideo(
  raiz: string,
  opts: {
    imagens: string[]
    segundosPorFoto?: number
    largura?: number
    altura?: number
    fps?: number
    narracao?: string
    voz?: string
    audio?: string
    saida?: string
  }
): Promise<RespostaMidia> {
  const imagens = Array.isArray(opts.imagens) ? opts.imagens.filter((p) => typeof p === 'string' && p.trim()) : []
  if (!imagens.length) return { ok: false, erro: 'selecione ao menos uma foto' }
  for (const img of imagens) {
    const invalido = validarEntrada(img, 'imagem')
    if (invalido) return { ok: false, erro: invalido }
  }
  const segundos = clampNum(opts.segundosPorFoto, 0.5, 15, 3)
  const largura = Math.round(clampNum(opts.largura, 320, 1920, 1920))
  const altura = Math.round(clampNum(opts.altura, 240, 1080, 1080))
  const fps = Math.round(clampNum(opts.fps, 15, 60, 30))
  const destino = destinoArquivo(raiz, nomeArquivo('slideshow', '.mp4'), opts.saida)
  const tmp = join(pastaMidia(raiz), '.tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6))
  mkdirSync(tmp, { recursive: true })

  try {
    const segmentos: string[] = []
    for (let i = 0; i < imagens.length; i++) {
      const seg = join(tmp, 'seg-' + String(i).padStart(3, '0') + '.mp4')
      const r = await rodar(ffmpegBin(), construirArgsSegmento(imagens[i], seg, segundos, largura, altura, fps), 180_000)
      if (!r.ok || !existsSync(seg)) {
        return { ok: false, erro: 'ffmpeg falhou no segmento ' + (i + 1) + ': ' + (r.erro || r.stderr.split(/\r?\n/).slice(-2).join(' ')).slice(0, 300) }
      }
      segmentos.push(seg)
    }

    const lista = join(tmp, 'lista.txt')
    writeFileSync(lista, construirListaConcat(segmentos), 'utf8')
    const semAudio = join(tmp, 'base.mp4')
    let r = await rodar(ffmpegBin(), ['-y', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', semAudio], 300_000)
    if (!r.ok || !existsSync(semAudio)) {
      r = await rodar(
        ffmpegBin(),
        ['-y', '-f', 'concat', '-safe', '0', '-i', lista, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-an', semAudio],
        600_000
      )
    }
    if (!r.ok || !existsSync(semAudio)) {
      return { ok: false, erro: 'ffmpeg falhou ao juntar segmentos: ' + (r.erro || r.stderr.split(/\r?\n/).slice(-2).join(' ')).slice(0, 300) }
    }

    let audio = ''
    if (opts.narracao && String(opts.narracao).trim()) {
      const nar = await narrar(raiz, { texto: String(opts.narracao), voz: opts.voz, saida: join(tmp, 'narracao.mp3') })
      if (!nar.ok || !nar.caminho) return { ok: false, erro: 'narração falhou: ' + (nar.erro || 'erro') }
      audio = nar.caminho
    } else if (opts.audio) {
      const invalido = validarEntrada(opts.audio, 'audio')
      if (invalido) return { ok: false, erro: invalido }
      audio = opts.audio
    }

    if (audio) {
      r = await rodar(
        ffmpegBin(),
        ['-y', '-i', semAudio, '-i', audio, '-c:v', 'copy', '-af', 'apad', '-c:a', 'aac', '-b:a', '160k', '-shortest', destino],
        600_000
      )
      if (!r.ok || !existsSync(destino)) {
        return { ok: false, erro: 'ffmpeg falhou ao adicionar áudio: ' + (r.erro || r.stderr.split(/\r?\n/).slice(-2).join(' ')).slice(0, 300) }
      }
    } else {
      await fsp.rename(semAudio, destino).catch(async () => {
        await fsp.copyFile(semAudio, destino)
      })
    }

    return {
      ok: true,
      caminho: destino,
      caminhoRel: caminhoRelativo(raiz, destino),
      bytes: statSync(destino).size,
      mime: 'video/mp4',
      duracaoSeg: +(imagens.length * segundos).toFixed(2),
      aviso: 'Slideshow local via ffmpeg (grátis)' + (audio ? ' com narração natural' : '') + '.'
    }
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}

export async function cortarVideo(
  raiz: string,
  opts: { entrada: string; inicio: string | number; fim: string | number; saida?: string }
): Promise<RespostaMidia> {
  const invalido = validarEntrada(opts.entrada, 'video')
  if (invalido) return { ok: false, erro: invalido }
  const ini = parseTempo(opts.inicio)
  const fim = parseTempo(opts.fim)
  if (ini === null || fim === null) return { ok: false, erro: 'tempo inválido (use 12, 1:30 ou 00:01:30)' }
  if (fim <= ini) return { ok: false, erro: 'o fim precisa ser maior que o início' }
  const destino = destinoArquivo(raiz, nomeArquivo('corte', '.mp4'), opts.saida)
  const r = await rodar(ffmpegBin(), construirArgsCorte(opts.entrada, destino, ini, fim), 600_000)
  if (!r.ok || !existsSync(destino)) {
    return { ok: false, erro: 'ffmpeg falhou: ' + (r.erro || r.stderr.split(/\r?\n/).slice(-2).join(' ')).slice(0, 300) }
  }
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: statSync(destino).size,
    mime: 'video/mp4',
    duracaoSeg: +(fim - ini).toFixed(2)
  }
}

export async function juntarVideos(
  raiz: string,
  opts: { videos: string[]; saida?: string }
): Promise<RespostaMidia> {
  const videos = Array.isArray(opts.videos) ? opts.videos.filter((p) => typeof p === 'string' && p.trim()) : []
  if (videos.length < 2) return { ok: false, erro: 'selecione ao menos dois vídeos' }
  for (const v of videos) {
    const invalido = validarEntrada(v, 'video')
    if (invalido) return { ok: false, erro: invalido }
  }
  const destino = destinoArquivo(raiz, nomeArquivo('video-junto', '.mp4'), opts.saida)
  const tmp = join(pastaMidia(raiz), '.tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6))
  mkdirSync(tmp, { recursive: true })
  try {
    const lista = join(tmp, 'lista.txt')
    writeFileSync(lista, construirListaConcat(videos), 'utf8')
    const r = await rodar(
      ffmpegBin(),
      ['-y', '-f', 'concat', '-safe', '0', '-i', lista, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '160k', destino],
      900_000
    )
    if (!r.ok || !existsSync(destino)) {
      return {
        ok: false,
        erro:
          'ffmpeg falhou ao juntar (os vídeos precisam ter a mesma resolução/codec): ' +
          (r.erro || r.stderr.split(/\r?\n/).slice(-2).join(' ')).slice(0, 300)
      }
    }
    return {
      ok: true,
      caminho: destino,
      caminhoRel: caminhoRelativo(raiz, destino),
      bytes: statSync(destino).size,
      mime: 'video/mp4'
    }
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}

export async function extrairCapa(
  raiz: string,
  opts: { entrada: string; tempo?: string | number; largura?: number; saida?: string }
): Promise<RespostaMidia> {
  const invalido = validarEntrada(opts.entrada, 'video')
  if (invalido) return { ok: false, erro: invalido }
  const t = parseTempo(opts.tempo ?? 1) ?? 1
  const largura = Math.round(clampNum(opts.largura, 0, 3840, 1280))
  const destino = destinoArquivo(raiz, nomeArquivo('capa', '.jpg'), opts.saida)
  const args = ['-y', '-ss', t.toFixed(3), '-i', opts.entrada, '-frames:v', '1']
  if (largura > 0) args.push('-vf', 'scale=' + largura + ':-2:flags=lanczos')
  args.push(destino)
  const r = await rodar(ffmpegBin(), args, 180_000)
  if (!r.ok || !existsSync(destino)) {
    return { ok: false, erro: 'ffmpeg falhou: ' + (r.erro || r.stderr.split(/\r?\n/).slice(-2).join(' ')).slice(0, 300) }
  }
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: statSync(destino).size,
    mime: 'image/jpeg',
    previewBase64: previewDe(destino)
  }
}

// ---------------------------------------------------------------- áudio

const SCRIPT_TTS = String.raw`import json, os, sys, wave
engine = sys.argv[1]
cfg = json.loads(sys.argv[2])
out = sys.argv[3]
texto = cfg.get("texto", "")
estilo = cfg.get("estilo", "")
vel = float(cfg.get("velocidade", 1.0) or 1.0)
import numpy as np

def salvar(wav, sr):
    arr = np.asarray(wav, dtype=np.float32).reshape(-1)
    pcm = (np.clip(arr, -1.0, 1.0) * 32767.0).astype(np.int16)
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sr))
        w.writeframes(pcm.tobytes())
    return len(arr) / float(sr)

if engine == "kokoro":
    from kokoro_onnx import Kokoro
    k = Kokoro(cfg["modelo"], cfg["vozes"])
    audio, sr = k.create(texto, voice=estilo, speed=vel, lang="pt-br", sentence_pause=0.35, clause_pause=0.12)
    dur = salvar(audio, sr)
elif engine == "supertonic":
    os.environ.setdefault("SUPERTONIC_CACHE_DIR", cfg["cache"])
    from supertonic import TTS
    tts = TTS(auto_download=False)
    wav, _ = tts.synthesize(texto, voice_style=tts.get_voice_style(estilo), speed=vel, lang="pt")
    dur = salvar(wav, 44100)
elif engine == "piper":
    from piper import PiperVoice
    from piper.config import SynthesisConfig
    voz = PiperVoice.load(cfg["modelo"])
    syn = SynthesisConfig(length_scale=1.0 / max(0.6, min(1.6, vel)))
    with wave.open(out, "wb") as w:
        voz.synthesize_wav(texto, w, syn_config=syn)
    with wave.open(out, "rb") as w:
        dur = w.getnframes() / float(w.getframerate())
else:
    raise SystemExit("engine desconhecida: " + engine)
print(json.dumps({"ok": True, "dur": round(dur, 3)}))
`

function fatorVelocidade(taxa?: string): number {
  const m = /^([+-]?\d+)%$/.exec(String(taxa || '').trim())
  if (!m) return 1
  const pct = Math.max(-40, Math.min(60, Number(m[1])))
  return Math.max(0.6, Math.min(1.6, 1 + pct / 100))
}

function ultimaLinha(r: { erro?: string; stderr: string; stdout: string }): string {
  return (r.erro || r.stderr || r.stdout || '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-3)
    .join(' ')
    .slice(0, 400)
}

/** Sintetiza com um motor local (Supertonic/Kokoro/Piper) e grava MP3 normalizado. */
async function sintetizarLocal(texto: string, voz: Voz, velocidade: number, destino: string): Promise<RespostaMidia> {
  const diag = await diagnosticoVozes()
  const motor = diag[voz.motor]
  if (!motor.ok) {
    return {
      ok: false,
      erro:
        'voz indisponível (' + voz.motor + '): ' + (motor.motivo || 'motor não configurado') +
        '. Use "Baixar modelos" no Estúdio de mídia.'
    }
  }
  const env = { ...process.env }
  const cfg: Record<string, unknown> = { texto, estilo: voz.estilo, velocidade }
  if (voz.motor === 'kokoro') {
    const a = arquivoKokoro()
    cfg.modelo = a.modelo
    cfg.vozes = a.vozes
  } else if (voz.motor === 'piper') {
    cfg.modelo = arquivoPiper(voz.estilo)
  } else if (voz.motor === 'supertonic') {
    cfg.cache = join(pastaTts(), 'supertonic3')
    env.SUPERTONIC_CACHE_DIR = cfg.cache as string
  }
  const wav = join(tmpdir(), 'dg-tts-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '.wav')
  const script = join(tmpdir(), 'dg-tts-v1.py')
  writeFileSync(script, SCRIPT_TTS, 'utf8')
  try {
    const r = await rodar(pythonBin(), [script, voz.motor, JSON.stringify(cfg), wav], 600_000, env)
    if (!r.ok || !existsSync(wav) || statSync(wav).size < 800) {
      const dica = /No module named|ModuleNotFoundError/.test(ultimaLinha(r))
        ? 'instale o pacote Python do motor (' + voz.motor + ')'
        : 'verifique os modelos baixados'
      return { ok: false, erro: 'síntese local falhou: ' + (ultimaLinha(r) || 'sem áudio') + ' — ' + dica }
    }
    let dur: number | undefined
    const linhas = r.stdout.trim().split(/\r?\n/).filter(Boolean)
    try {
      const info = JSON.parse(linhas[linhas.length - 1]) as { dur?: number }
      if (typeof info.dur === 'number') dur = +info.dur.toFixed(2)
    } catch {
      /* opcional */
    }
    // Voz derivada: desloca tom e formantes; depois normaliza volume (EBU R128).
    const filtros: string[] = []
    if (typeof voz.tom === 'number' && Math.abs(voz.tom - 1) > 0.001) {
      filtros.push('rubberband=pitch=' + voz.tom.toFixed(3) + ':pitchq=quality')
    }
    filtros.push('loudnorm=I=-16:TP=-1.5:LRA=11')
    const f = await rodar(
      ffmpegBin(),
      ['-y', '-i', wav, '-af', filtros.join(','), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '192k', destino],
      300_000
    )
    if (!f.ok || !existsSync(destino) || statSync(destino).size < 500) {
      return { ok: false, erro: 'ffmpeg falhou ao finalizar a narração: ' + (ultimaLinha(f) || 'arquivo vazio') }
    }
    return {
      ok: true,
      caminho: destino,
      bytes: statSync(destino).size,
      mime: 'audio/mpeg',
      duracaoSeg: dur,
      detalhes: { motor: voz.motor, voz: voz.id, velocidade },
      aviso:
        'Narração natural gratuita e local (' + voz.motor + ' · ' + voz.rotulo + ')' +
        (voz.derivada ? ' — voz infantil derivada de voz natural.' : '.') +
        (voz.categoria === 'parodia' ? ' Arquétipo de paródia: não imita pessoa real.' : '')
    }
  } finally {
    rmSync(wav, { force: true })
  }
}

async function sintetizarEdge(texto: string, voz: Voz, taxa: string | undefined, destino: string): Promise<RespostaMidia> {
  const txt = join(tmpdir(), 'dg-narracao-' + Date.now() + '.txt')
  writeFileSync(txt, texto, 'utf8')
  try {
    const args = ['--voice', voz.estilo, '--file', txt, '--write-media', destino]
    if (taxa && /^[+-]\d+%$/.test(taxa)) args.push('--rate=' + taxa)
    let ultimoErro = ''
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const r = await rodar(edgeTtsBin(), args, 240_000)
      if (r.ok && existsSync(destino) && statSync(destino).size > 0) {
        return {
          ok: true,
          caminho: destino,
          bytes: statSync(destino).size,
          mime: 'audio/mpeg',
          detalhes: { motor: 'edge', voz: voz.id },
          aviso: 'Narração neural gratuita via edge-tts (' + voz.rotulo + '). Precisa de internet.'
        }
      }
      ultimoErro = ultimaLinha(r)
      if (tentativa === 0) await dormir(1200)
    }
    return {
      ok: false,
      erro:
        'edge-tts falhou (precisa de internet e do pacote edge-tts): ' +
        (ultimoErro || 'sem resposta do serviço')
    }
  } finally {
    await fsp.rm(txt, { force: true }).catch(() => {})
  }
}

export async function narrar(
  raiz: string,
  opts: { texto: string; voz?: string; taxa?: string; saida?: string }
): Promise<RespostaMidia> {
  const texto = String(opts.texto || '').trim()
  if (!texto) return { ok: false, erro: 'informe o texto da narração' }
  if (texto.length > 8000) return { ok: false, erro: 'texto muito longo (máx. 8000 caracteres)' }
  const voz = acharVoz(opts.voz)
  if (!voz) {
    return {
      ok: false,
      erro: 'voz desconhecida: ' + String(opts.voz || '') + '. Liste as vozes com midia_vozes_listar.'
    }
  }
  const destino = destinoArquivo(raiz, nomeArquivo('narracao', '.mp3'), opts.saida)
  const taxa = opts.taxa || voz.taxaPadrao
  const r =
    voz.motor === 'edge'
      ? await sintetizarEdge(texto, voz, taxa, destino)
      : await sintetizarLocal(texto, voz, fatorVelocidade(taxa), destino)
  if (r.ok && r.caminho) r.caminhoRel = caminhoRelativo(raiz, r.caminho)
  return r
}

const cachePrevia = new Map<string, RespostaMidia>()

/** Amostra curta de uma voz (para o seletor do Estúdio), em cache por sessão. */
export async function previaVoz(id: string, texto?: string): Promise<RespostaMidia> {
  const voz = acharVoz(id)
  if (!voz) return { ok: false, erro: 'voz desconhecida: ' + id }
  const frase =
    String(texto || '').trim() ||
    'Olá! Eu sou ' + voz.rotulo + '. Esta é uma amostra da minha voz natural em português do Brasil.'
  const chave = voz.id + '|' + frase
  const guardada = cachePrevia.get(chave)
  if (guardada) return guardada
  const dir = join(pastaTts(), 'previas')
  mkdirSync(dir, { recursive: true })
  const destino = join(dir, voz.id.replace(/[^a-z0-9]+/gi, '-') + '.mp3')
  const r = await (voz.motor === 'edge'
    ? sintetizarEdge(frase, voz, voz.taxaPadrao, destino)
    : sintetizarLocal(frase, voz, fatorVelocidade(voz.taxaPadrao), destino))
  if (r.ok) {
    r.previewBase64 = previewDe(destino)
    r.caminho = destino
    r.caminhoRel = undefined
  }
  cachePrevia.set(chave, r)
  return r
}

const SCRIPT_WHISPER = String.raw`import sys, json, os
from faster_whisper import WhisperModel

audio = sys.argv[1]
saida = sys.argv[2]
modelo = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else "base"
idioma = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] and sys.argv[4] != "auto" else None

def ts(t):
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    ms = int(round((t - int(t)) * 1000))
    if ms == 1000:
        ms = 0
        s += 1
    return "%02d:%02d:%02d,%03d" % (h, m, s, ms)

model = WhisperModel(modelo, device="cpu", compute_type="int8")
segmentos, info = model.transcribe(audio, language=idioma, vad_filter=True, beam_size=1)
linhas = []
textos = []
i = 1
for seg in segmentos:
    txt = (seg.text or "").strip()
    if not txt:
        continue
    textos.append(txt)
    linhas.append("%d\n%s --> %s\n%s\n" % (i, ts(seg.start), ts(seg.end), txt))
    i += 1
with open(saida, "w", encoding="utf-8") as f:
    f.write("\n".join(linhas))
print(json.dumps({
    "ok": True,
    "srt": saida,
    "texto": " ".join(textos),
    "idioma": getattr(info, "language", idioma or ""),
    "duracao": getattr(info, "duration", 0),
}))
`

export async function transcrever(
  raiz: string,
  opts: { entrada: string; idioma?: string; modelo?: string; saida?: string }
): Promise<RespostaMidia> {
  const invalido = validarEntrada(opts.entrada, 'midia')
  if (invalido) return { ok: false, erro: invalido }
  const modelo = ['tiny', 'base', 'small', 'medium'].includes(String(opts.modelo)) ? String(opts.modelo) : 'base'
  const idioma = opts.idioma && /^[a-z]{2,5}$/i.test(opts.idioma) ? opts.idioma : 'auto'
  const destino = destinoArquivo(raiz, nomeArquivo('transcricao', '.srt'), opts.saida)
  const script = join(tmpdir(), 'dg-transcrever-v1.py')
  writeFileSync(script, SCRIPT_WHISPER, 'utf8')
  const r = await rodar(pythonBin(), [script, opts.entrada, destino, modelo, idioma], 1_800_000)
  if (!r.ok || !existsSync(destino)) {
    return {
      ok: false,
      erro:
        'transcrição falhou (instale faster-whisper: pip install faster-whisper): ' +
        (r.erro || r.stderr.split(/\r?\n/).slice(-3).join(' ')).slice(0, 400)
    }
  }
  let info: { texto?: string; idioma?: string; duracao?: number } = {}
  const linhas = r.stdout.trim().split(/\r?\n/).filter(Boolean)
  if (linhas.length) {
    try {
      info = JSON.parse(linhas[linhas.length - 1]) as typeof info
    } catch {
      /* */
    }
  }
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: statSync(destino).size,
    mime: 'text/plain',
    texto: (info.texto || '').slice(0, 8000),
    duracaoSeg: typeof info.duracao === 'number' ? +info.duracao.toFixed(2) : undefined,
    detalhes: { modelo, idioma: info.idioma || idioma },
    aviso: 'Transcrição local gratuita (faster-whisper, CPU).'
  }
}

function escaparFiltroSubtitles(caminho: string): string {
  return caminho.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

export async function queimarLegendas(
  raiz: string,
  opts: { video: string; srt: string; saida?: string }
): Promise<RespostaMidia> {
  const invalido = validarEntrada(opts.video, 'video')
  if (invalido) return { ok: false, erro: invalido }
  if (!existsSync(opts.srt) || extname(opts.srt).toLowerCase() !== '.srt') {
    return { ok: false, erro: 'arquivo .srt não encontrado' }
  }
  const destino = destinoArquivo(raiz, nomeArquivo('video-legendas', '.mp4'), opts.saida)
  const vf = "subtitles=filename='" + escaparFiltroSubtitles(opts.srt) + "'"
  const r = await rodar(
    ffmpegBin(),
    ['-y', '-i', opts.video, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'copy', destino],
    1_800_000
  )
  if (!r.ok || !existsSync(destino)) {
    return { ok: false, erro: 'ffmpeg falhou ao gravar legendas: ' + (r.erro || r.stderr.split(/\r?\n/).slice(-3).join(' ')).slice(0, 400) }
  }
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: statSync(destino).size,
    mime: 'video/mp4'
  }
}

// ---------------------------------------------------------------- status

async function comfyStatus(): Promise<{ ok: boolean; versao?: string; erro?: string }> {
  try {
    const res = await fetch('http://127.0.0.1:8188/system_stats', { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return { ok: false, erro: 'HTTP ' + res.status }
    const j = (await res.json()) as { system?: { comfyui_version?: string } }
    return { ok: true, versao: j?.system?.comfyui_version ? 'ComfyUI ' + j.system.comfyui_version : 'online' }
  } catch {
    const base = process.env.DG_COMFY_DIR || (process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'dg-editor', 'comfyui')
      : join(homedir(), '.dg-editor', 'comfyui'))
    return {
      ok: false,
      erro: existsSync(join(base, 'app', 'main.py'))
        ? 'instalado, servidor parado (inicie no Estúdio de mídia)'
        : 'não instalado (opcional — imagem/vídeo ilimitados)'
    }
  }
}

export async function statusMidia(raiz?: string): Promise<StatusMidia> {
  const [ffmpeg, ffprobe, python, vozes] = await Promise.all([
    versaoCmd(ffmpegBin(), ['-version']),
    versaoCmd(ffprobeBin(), ['-version']),
    versaoCmd(pythonBin(), ['--version']),
    diagnosticoVozes().catch(() => null)
  ])
  const whisper = python.ok
    ? await versaoCmd(pythonBin(), ['-c', 'import faster_whisper,sys;print(faster_whisper.__version__)'], 20_000)
    : { ok: false, erro: 'python indisponível' }
  const edge = await versaoCmd(edgeTtsBin(), ['--version'])
  const comfy = await comfyStatus()
  const ferramentas = {
    ffmpeg: { ok: ffmpeg.ok, versao: ffmpeg.versao, erro: ffmpeg.erro },
    ffprobe: { ok: ffprobe.ok, versao: ffprobe.versao, erro: ffprobe.erro },
    python: { ok: python.ok, versao: python.versao, erro: python.erro },
    fasterWhisper: { ok: whisper.ok, versao: whisper.versao, erro: whisper.erro },
    edgeTts: { ok: edge.ok, versao: edge.versao, erro: edge.erro },
    comfyui: { ok: comfy.ok, versao: comfy.versao, erro: comfy.erro }
  }
  return {
    ok: ffmpeg.ok && ffprobe.ok,
    ferramentas,
    vozes: vozes || undefined,
    online: {
      pollinations: 'grátis, sem chave (1 imagem/45s por IP)',
      mermaidInk: 'grátis, sem chave',
      edgeTts: 'grátis (Microsoft Edge voices; precisa de internet)'
    },
    pasta: raiz ? pastaMidia(raiz) : undefined
  }
}
