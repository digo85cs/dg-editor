import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listarMusicas, mixarMusica, pastaMusicas } from '../musicas'

const dir = mkdtempSync(join(tmpdir(), 'dg-musicas-'))
const anterior = process.env.DG_MUSICAS_DIR

beforeAll(() => {
  process.env.DG_MUSICAS_DIR = dir
  writeFileSync(join(dir, 'trilha-teste.mp3'), 'nao-e-audio-real', 'utf8')
  writeFileSync(join(dir, 'ignorar.txt'), 'x', 'utf8')
})

afterAll(() => {
  if (anterior === undefined) delete process.env.DG_MUSICAS_DIR
  else process.env.DG_MUSICAS_DIR = anterior
  rmSync(dir, { recursive: true, force: true })
})

describe('banco de músicas', () => {
  it('usa a pasta configurada e lista apenas áudio', () => {
    expect(pastaMusicas()).toBe(dir)
    const r = listarMusicas()
    expect(r.ok).toBe(true)
    expect(r.total).toBe(1)
    expect(r.itens[0].nome).toBe('trilha-teste.mp3')
  })

  it('recusa vídeo inexistente sem chamar ffmpeg', async () => {
    const r = await mixarMusica(dir, {
      video: join(dir, 'nao-existe.mp4'),
      musica: join(dir, 'trilha-teste.mp3')
    })
    expect(r.ok).toBe(false)
    expect(String(r.erro)).toMatch(/não encontrado/i)
  })
})
