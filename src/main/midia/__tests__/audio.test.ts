import { describe, expect, it } from 'vitest'
import { construirFiltrosAudio, analisarAudio } from '../audio'

describe('filtros de audio', () => {
  it('normaliza por padrao apenas quando pedido', () => {
    expect(construirFiltrosAudio({ entrada: 'a.mp3' })).toEqual([])
    expect(construirFiltrosAudio({ entrada: 'a.mp3', normalizar: true })).toEqual([
      'loudnorm=I=-16:TP=-1.5:LRA=11'
    ])
  })

  it('aplica ganho, eq e compressao na ordem', () => {
    const f = construirFiltrosAudio({
      entrada: 'a.mp3',
      ganhoDb: 3,
      gravesDb: 4.5,
      agudosDb: -2,
      compressao: 3,
      normalizar: true
    })
    expect(f).toEqual([
      'volume=3.0dB',
      'bass=g=4.5',
      'treble=g=-2.0',
      'acompressor=threshold=-18dB:ratio=3.0:attack=10:release=200',
      'loudnorm=I=-16:TP=-1.5:LRA=11'
    ])
  })

  it('calcula fade de saida pela duracao', () => {
    const f = construirFiltrosAudio({ entrada: 'a.mp3', fadeInSeg: 2, fadeOutSeg: 3 }, 10)
    expect(f).toEqual(['afade=t=in:st=0:d=2.00', 'afade=t=out:st=7.00:d=3.00'])
  })

  it('limita valores extremos', () => {
    const f = construirFiltrosAudio({ entrada: 'a.mp3', ganhoDb: 999, compressao: 99 })
    expect(f[0]).toBe('volume=30.0dB')
    expect(f[1]).toBe('acompressor=threshold=-18dB:ratio=20.0:attack=10:release=200')
  })

  it('analise recusa arquivo inexistente', async () => {
    const r = await analisarAudio('nao-existe.mp3')
    expect(r.ok).toBe(false)
    expect(r.erro).toMatch(/não encontrado/)
  })
})
