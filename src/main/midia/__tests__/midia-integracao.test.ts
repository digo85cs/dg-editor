/**
 * Validação real de mídia: baixa uma faixa livre e processa áudio com ffmpeg.
 * Não roda no `npm test` padrão: use `DG_TEST_MIDIA=1 npx vitest run midia-integracao`.
 */
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { analisarAudio, processarAudio } from '../audio'
import { baixarFaixas, catalogoLivres } from '../musicas-livres'

const ligado = process.env.DG_TEST_MIDIA === '1'

let base = ''
let envMusicas: string | undefined

beforeAll(() => {
  envMusicas = process.env.DG_MUSICAS_DIR
  base = mkdtempSync(join(tmpdir(), 'dg-midia-real-'))
  process.env.DG_MUSICAS_DIR = join(base, 'musicas')
})

afterAll(() => {
  if (envMusicas !== undefined) process.env.DG_MUSICAS_DIR = envMusicas
  else delete process.env.DG_MUSICAS_DIR
  if (base) rmSync(base, { recursive: true, force: true })
})

describe.skipIf(!ligado)('catálogo e áudio reais', () => {
  it('catálogo cobre 10 estilos e 20+ faixas', () => {
    const c = catalogoLivres()
    expect(c.ok).toBe(true)
    expect(c.estilos).toHaveLength(10)
    expect(c.total).toBeGreaterThanOrEqual(20)
    for (const e of c.estilos) expect(e.total).toBeGreaterThan(0)
  })

  it(
    'baixa uma faixa CC BY e grava créditos',
    { timeout: 300_000 },
    async () => {
      const r = await baixarFaixas({ ids: ['carefree'] })
      expect(r.ok).toBe(true)
      expect(r.falhas).toEqual([])
      expect(r.baixadas).toHaveLength(1)
      const faixa = r.baixadas[0]
      expect(existsSync(faixa.caminho)).toBe(true)
      expect(statSync(faixa.caminho).size).toBeGreaterThan(100 * 1024)
      expect(faixa.duracaoSeg).toBeGreaterThan(10)
      expect(r.creditos && existsSync(r.creditos)).toBe(true)
    }
  )

  it('analisa, normaliza, equaliza e faz fade real', { timeout: 300_000 }, async () => {
    const entrada = join(base, 'musicas', 'alegre', 'carefree.mp3')
    if (!existsSync(entrada)) return
    const antes = await analisarAudio(entrada)
    expect(antes.ok).toBe(true)
    expect(antes.duracaoSeg).toBeGreaterThan(10)

    const saida = await processarAudio(base, {
      entrada,
      normalizar: true,
      gravesDb: 3,
      agudosDb: -1.5,
      fadeInSeg: 1,
      fadeOutSeg: 2,
      formato: 'wav',
      saida: 'processado'
    })
    expect(saida.ok).toBe(true)
    expect(saida.caminho && existsSync(saida.caminho)).toBe(true)
    expect(saida.caminho && saida.caminho.endsWith('.wav')).toBe(true)

    const depois = await analisarAudio(saida.caminho as string)
    expect(depois.ok).toBe(true)
    expect(depois.duracaoSeg).toBeGreaterThan(9)
    // loudnorm mira -16 LUFS; volumedetect (média RMS aproximada) fica próximo.
    expect(depois.mediaDb).toBeGreaterThan(-24)
    expect(depois.mediaDb).toBeLessThan(-8)
    expect(depois.picoDb).toBeLessThanOrEqual(0)
  })

  it('corta trecho e converte formato', { timeout: 120_000 }, async () => {
    const entrada = join(base, 'musicas', 'alegre', 'carefree.mp3')
    if (!existsSync(entrada)) return
    const r = await processarAudio(base, {
      entrada,
      inicio: 5,
      fim: 8,
      formato: 'ogg',
      saida: 'trecho'
    })
    expect(r.ok).toBe(true)
    expect(r.duracaoSeg).toBeGreaterThan(2.5)
    expect(r.duracaoSeg).toBeLessThan(3.6)
  })
})
