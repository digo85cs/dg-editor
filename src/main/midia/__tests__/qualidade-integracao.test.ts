/**
 * Validação real de qualidade de vídeo/imagem: sintetiza um clipe com ffmpeg,
 * aplica filtros, re-render, estabilização e ajustes de imagem.
 * Não roda no `npm test` padrão: use `DG_TEST_MIDIA=1 npx vitest run qualidade-integracao`.
 */
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rodar } from '../core'
import { analisarVideo, processarImagem, processarVideo } from '../qualidade'

const ligado = process.env.DG_TEST_MIDIA === '1'

let base = ''
let video = ''
let frame = ''
let ffmpegOk = false

async function dimensoes(caminho: string): Promise<{ largura?: number; altura?: number }> {
  const r = await rodar(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', caminho],
    30_000
  )
  if (!r.ok) return {}
  try {
    const j = JSON.parse(r.stdout) as { streams?: { width?: number; height?: number }[] }
    return { largura: j.streams?.[0]?.width, altura: j.streams?.[0]?.height }
  } catch {
    return {}
  }
}

beforeAll(async () => {
  if (!ligado) return
  const v = await rodar('ffmpeg', ['-version'], 10_000)
  ffmpegOk = v.ok
  if (!ffmpegOk) return
  base = mkdtempSync(join(tmpdir(), 'dg-qualidade-real-'))
  video = join(base, 'entrada.mp4')
  const g = await rodar(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=320x240:rate=30:duration=2',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      video
    ],
    120_000
  )
  expect(g.ok && existsSync(video)).toBe(true)
  frame = join(base, 'quadro.png')
  const f = await rodar('ffmpeg', ['-y', '-i', video, '-frames:v', '1', frame], 60_000)
  expect(f.ok && existsSync(frame)).toBe(true)
}, 240_000)

afterAll(() => {
  if (base) rmSync(base, { recursive: true, force: true })
})

describe.skipIf(!ligado)('qualidade real de vídeo e imagem', () => {
  it('analisa o clipe sintetizado', async () => {
    if (!ffmpegOk) return
    const a = await analisarVideo(video)
    expect(a.ok).toBe(true)
    expect(a.largura).toBe(320)
    expect(a.altura).toBe(240)
    expect(a.fps).toBeGreaterThan(28)
    expect(a.duracaoSeg).toBeGreaterThan(1.5)
    expect(a.temAudio).toBe(true)
    expect(a.dicas.length).toBeGreaterThan(0)
  })

  it('re-renderiza com nitidez, cor e escala 2×', { timeout: 300_000 }, async () => {
    if (!ffmpegOk) return
    const r = await processarVideo(base, {
      entrada: video,
      nitidez: 1,
      brilho: 5,
      contraste: 10,
      escala: 2,
      crf: 18,
      preset: 'rapido',
      normalizarAudio: true,
      saida: 'melhorado'
    })
    expect(r.ok).toBe(true)
    expect(r.caminho && existsSync(r.caminho)).toBe(true)
    expect(statSync(r.caminho as string).size).toBeGreaterThan(10_000)
    const d = await dimensoes(r.caminho as string)
    expect(d.largura).toBe(640)
    expect(d.altura).toBe(480)
    const analise = await analisarVideo(r.caminho as string)
    expect(analise.duracaoSeg).toBeGreaterThan(1.5)
    expect(analise.temAudio).toBe(true)
  })

  it('tenta estabilização em 2 passadas', { timeout: 600_000 }, async () => {
    if (!ffmpegOk) return
    const r = await processarVideo(base, {
      entrada: video,
      estabilizar: true,
      crf: 23,
      preset: 'rapido',
      saida: 'estabilizado'
    })
    if (!r.ok) {
      // Builds de ffmpeg sem vidstab devem explicar a indisponibilidade.
      expect(String(r.erro)).toMatch(/vidstab/i)
      return
    }
    expect(r.caminho && existsSync(r.caminho)).toBe(true)
    expect((r.detalhes as { estabilizado?: boolean }).estabilizado).toBe(true)
  })

  it('ajusta a imagem (nitidez, cor, escala 2×) e troca para JPG', { timeout: 120_000 }, async () => {
    if (!ffmpegOk) return
    const r = await processarImagem(base, {
      entrada: frame,
      nitidez: 1.2,
      brilho: 5,
      contraste: 10,
      saturacao: 110,
      escala: 2,
      formato: 'jpg',
      qualidade: 2,
      saida: 'imagem-ajustada'
    })
    expect(r.ok).toBe(true)
    expect(r.caminho && existsSync(r.caminho)).toBe(true)
    expect((r.caminho as string).toLowerCase().endsWith('.jpg')).toBe(true)
    const d = await dimensoes(r.caminho as string)
    expect(d.largura).toBe(640)
    expect(d.altura).toBe(480)
  })
})
