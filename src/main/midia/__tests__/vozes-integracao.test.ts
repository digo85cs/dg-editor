/**
 * Validação real dos motores de voz (Python + modelos baixados + ffmpeg).
 * Não roda no `npm test` padrão: use `DG_TEST_TTS=1 npx vitest run vozes-integracao`.
 */
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { narrar, previaVoz } from '../core'
import { diagnosticoVozes } from '../vozes'

const ligado = process.env.DG_TEST_TTS === '1'
const FRASE = 'Era uma vez um pequeno robô que adorava desenhar estrelas no céu do Brasil.'

let raiz = ''
let envAnterior: string | undefined

beforeAll(() => {
  envAnterior = process.env.DG_TTS_DIR
  delete process.env.DG_TTS_DIR
  raiz = mkdtempSync(join(tmpdir(), 'dg-vozes-real-'))
})

afterAll(() => {
  if (envAnterior !== undefined) process.env.DG_TTS_DIR = envAnterior
  if (raiz) rmSync(raiz, { recursive: true, force: true })
})

describe.skipIf(!ligado)('narração real por motor', () => {
  const casos = [
    { voz: 'st:f1', motor: 'supertonic' },
    { voz: 'st:m2', motor: 'supertonic' },
    { voz: 'kokoro:dora', motor: 'kokoro' },
    { voz: 'piper:cadu', motor: 'piper' },
    { voz: 'infantil:bia', motor: 'supertonic' },
    { voz: 'infantil:theo', motor: 'supertonic' }
  ] as const

  it(
    'gera MP3 válido para cada motor e voz infantil',
    { timeout: 900_000 },
    async () => {
      const diag = await diagnosticoVozes()
      const falhas: string[] = []
      for (const caso of casos) {
        const motor = diag[caso.motor]
        if (!motor.ok) {
          falhas.push(caso.voz + ': motor indisponível (' + (motor.motivo || 'sem motivo') + ')')
          continue
        }
        const r = await narrar(raiz, { texto: FRASE, voz: caso.voz, saida: 'vozes/' + caso.voz.replace(':', '-') + '.mp3' })
        if (!r.ok) {
          falhas.push(caso.voz + ': ' + r.erro)
          continue
        }
        const caminho = r.caminho || ''
        if (!caminho || !existsSync(caminho)) {
          falhas.push(caso.voz + ': arquivo não criado')
          continue
        }
        const bytes = statSync(caminho).size
        if (bytes < 4000) falhas.push(caso.voz + ': MP3 muito pequeno (' + bytes + ' bytes)')
        if (r.mime !== 'audio/mpeg') falhas.push(caso.voz + ': mime inesperado ' + r.mime)
        if (caso.voz.startsWith('infantil:') && !/infantil derivada/.test(r.aviso || '')) {
          falhas.push(caso.voz + ': aviso sem marca de voz derivada')
        }
        if (motor.modelos && !(Number(r.duracaoSeg) > 0.5)) {
          falhas.push(caso.voz + ': duração inválida ' + r.duracaoSeg)
        }
      }
      expect(falhas).toEqual([])
    }
  )

  it('prévia devolve data URI tocável', { timeout: 300_000 }, async () => {
    const r = await previaVoz('st:f1', 'Amostra curta de voz natural.')
    expect(r.ok).toBe(true)
    expect(r.previewBase64 || '').toMatch(/^data:audio\/mpeg;base64,/)
  })

  it('velocidade altera a duração sem quebrar o áudio', { timeout: 600_000 }, async () => {
    const normal = await narrar(raiz, { texto: FRASE, voz: 'st:f1', saida: 'vozes/lento-normal.mp3' })
    const lento = await narrar(raiz, { texto: FRASE, voz: 'st:f1', taxa: '-20%', saida: 'vozes/lento-20.mp3' })
    expect(normal.ok).toBe(true)
    expect(lento.ok).toBe(true)
    expect(Number(lento.duracaoSeg)).toBeGreaterThan(Number(normal.duracaoSeg))
  })
})
