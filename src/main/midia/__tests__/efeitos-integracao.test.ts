/**
 * Validação real dos efeitos de vídeo e voz com ffmpeg.
 * Não roda no `npm test` padrão: use `DG_TEST_MIDIA=1 npx vitest run efeitos-integracao`.
 */
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rodar } from '../core'
import { aplicarEfeitoVideo, detectarCenas } from '../efeitos'
import { aplicarEfeitoVoz } from '../voz-efeitos'

const ligado = process.env.DG_TEST_MIDIA === '1'
let raiz = ''
let video = ''
let video2 = ''
let verde = ''
let fundo = ''
let cores = ''
let voz = ''
let ffmpegOk = false

async function probe(caminho: string): Promise<{ dur: number; w: number; h: number; audio: boolean }> {
  const r = await rodar(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', caminho],
    30_000
  )
  if (!r.ok) return { dur: 0, w: 0, h: 0, audio: false }
  try {
    const j = JSON.parse(r.stdout) as {
      format?: { duration?: string }
      streams?: { codec_type?: string; width?: number; height?: number }[]
    }
    const v = (j.streams || []).find((s) => s.codec_type === 'video')
    return {
      dur: Number(j.format?.duration) || 0,
      w: Number(v?.width) || 0,
      h: Number(v?.height) || 0,
      audio: (j.streams || []).some((s) => s.codec_type === 'audio')
    }
  } catch {
    return { dur: 0, w: 0, h: 0, audio: false }
  }
}

beforeAll(async () => {
  if (!ligado) return
  const v = await rodar('ffmpeg', ['-version'], 10_000)
  ffmpegOk = v.ok
  if (!ffmpegOk) return
  raiz = mkdtempSync(join(tmpdir(), 'dg-efeitos-real-'))
  const clipe = (nome: string) =>
    rodar(
      'ffmpeg',
      [
        '-y',
        '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=30:duration=2',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-shortest', join(raiz, nome)
      ],
      120_000
    )
  video = join(raiz, 'entrada.mp4')
  video2 = join(raiz, 'entrada2.mp4')
  expect((await clipe('entrada.mp4')).ok && existsSync(video)).toBe(true)
  expect((await clipe('entrada2.mp4')).ok && existsSync(video2)).toBe(true)

  verde = join(raiz, 'verde.mp4')
  const g = await rodar(
    'ffmpeg',
    ['-y', '-f', 'lavfi', '-i', 'color=c=0x00ff00:size=320x240:rate=30:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', verde],
    60_000
  )
  expect(g.ok && existsSync(verde)).toBe(true)

  fundo = join(raiz, 'fundo.png')
  const f = await rodar('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=0x2244aa:size=320x240', '-frames:v', '1', fundo], 60_000)
  expect(f.ok && existsSync(fundo)).toBe(true)

  cores = join(raiz, 'cores.mp4')
  const c = await rodar(
    'ffmpeg',
    [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=30:duration=1',
      '-f', 'lavfi', '-i', 'smptebars=size=320x240:rate=30:duration=1',
      '-f', 'lavfi', '-i', 'color=c=black:size=320x240:rate=30:duration=1',
      '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]',
      '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', cores
    ],
    120_000
  )
  expect(c.ok && existsSync(cores)).toBe(true)

  voz = join(raiz, 'voz.wav')
  const s = await rodar('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=1.5', voz], 60_000)
  expect(s.ok && existsSync(voz)).toBe(true)
}, 300_000)

afterAll(() => {
  if (raiz) rmSync(raiz, { recursive: true, force: true })
})

describe.skipIf(!ligado)('efeitos reais com ffmpeg', () => {
  it('acelera o vídeo para 2× mantendo áudio', async () => {
    if (!ffmpegOk) return
    const r = await aplicarEfeitoVideo(raiz, { entrada: video, efeito: 'velocidade', taxa: 2 })
    expect(r.ok).toBe(true)
    const info = await probe(r.caminho as string)
    expect(info.dur).toBeGreaterThan(0.6)
    expect(info.dur).toBeLessThan(1.4)
    expect(info.audio).toBe(true)
  }, 120_000)

  it('aprimora com upscale 2×', async () => {
    if (!ffmpegOk) return
    const r = await aplicarEfeitoVideo(raiz, { entrada: video, efeito: 'aprimorar', fator: 2, denoise: 0.2, nitidez: 0.5 })
    expect(r.ok).toBe(true)
    const info = await probe(r.caminho as string)
    expect(info.w).toBe(640)
    expect(info.h).toBe(480)
  }, 180_000)

  it('aplica look preto e branco e título', async () => {
    if (!ffmpegOk) return
    const pb = await aplicarEfeitoVideo(raiz, { entrada: video, efeito: 'cor', preset: 'pb' })
    expect(pb.ok).toBe(true)
    const t = await aplicarEfeitoVideo(raiz, { entrada: video, efeito: 'titulo', texto: 'Destaques DG', tamanho: 32, posicao: 'topo' })
    expect(t.ok).toBe(true)
  }, 240_000)

  it('gera GIF e extrai o áudio em MP3', async () => {
    if (!ffmpegOk) return
    const g = await aplicarEfeitoVideo(raiz, { entrada: video, efeito: 'gif', duracao: 1, tamanho: 240 })
    expect(g.ok).toBe(true)
    expect(String(g.caminho).toLowerCase().endsWith('.gif')).toBe(true)
    const a = await aplicarEfeitoVideo(raiz, { entrada: video, efeito: 'extrair-audio' })
    expect(a.ok).toBe(true)
    expect(String(a.caminho).toLowerCase().endsWith('.mp3')).toBe(true)
    expect(statSync(a.caminho as string).size).toBeGreaterThan(1000)
  }, 240_000)

  it('faz transição, PiP e chroma key entre arquivos', async () => {
    if (!ffmpegOk) return
    const tr = await aplicarEfeitoVideo(raiz, { entrada: video, segunda: video2, efeito: 'transicao', tipo: 'wipeleft', duracao: 0.5 })
    expect(tr.ok).toBe(true)
    const pip = await aplicarEfeitoVideo(raiz, { entrada: video, segunda: fundo, efeito: 'pip', escala: 0.4 })
    expect(pip.ok).toBe(true)
    const ck = await aplicarEfeitoVideo(raiz, { entrada: verde, segunda: fundo, efeito: 'chromakey', cor: '#00ff00' })
    expect(ck.ok).toBe(true)
  }, 300_000)

  it('cria boomerang com o dobro da duração', async () => {
    if (!ffmpegOk) return
    const r = await aplicarEfeitoVideo(raiz, { entrada: video, efeito: 'boomerang' })
    expect(r.ok).toBe(true)
    const info = await probe(r.caminho as string)
    expect(info.dur).toBeGreaterThan(3)
  }, 240_000)

  it('reenquadra em 1080×1920 e esconde uma região', async () => {
    if (!ffmpegOk) return
    const v = await aplicarEfeitoVideo(raiz, { entrada: video, efeito: 'reframe' })
    expect(v.ok).toBe(true)
    const info = await probe(v.caminho as string)
    expect(info.w).toBe(1080)
    expect(info.h).toBe(1920)
    const b = await aplicarEfeitoVideo(raiz, { entrada: video, efeito: 'borrar-regiao', regiao: { x: 20, y: 20, w: 100, h: 60 }, intensidade: 12 })
    expect(b.ok).toBe(true)
  }, 300_000)

  it('detecta cortes de cena para montar destaques', async () => {
    if (!ffmpegOk) return
    const r = await detectarCenas(raiz, { entrada: cores, limiar: 0.2, max: 5 })
    expect(r.ok).toBe(true)
    const cenas = (r.detalhes as { cenas?: { tempo: number }[] })?.cenas || []
    expect(cenas.length).toBeGreaterThanOrEqual(2)
    expect(cenas[0].tempo).toBeGreaterThan(0)
  }, 180_000)

  it('aplica preset de voz grave e limpa ruído', async () => {
    if (!ffmpegOk) return
    const r = await aplicarEfeitoVoz(raiz, { entrada: voz, preset: 'grave', reduzirRuido: true })
    expect(r.ok).toBe(true)
    expect(String(r.caminho).toLowerCase().endsWith('.mp3')).toBe(true)
    expect(statSync(r.caminho as string).size).toBeGreaterThan(1000)
    const tel = await aplicarEfeitoVoz(raiz, { entrada: voz, preset: 'telefone', formato: 'wav', cortarSilencios: true })
    expect(tel.ok).toBe(true)
  }, 180_000)
})
