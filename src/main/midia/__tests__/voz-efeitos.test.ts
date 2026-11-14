import { describe, expect, it } from 'vitest'
import { catalogoVoz, construirFiltrosVoz, PRESETS_VOZ } from '../voz-efeitos'

describe('efeitos de voz (presets RealVoice)', () => {
  it('lista presets e formatos', () => {
    const c = catalogoVoz()
    expect(c.presets.length).toBe(13)
    expect(c.presets.map((p) => p.id)).toContain('grave')
    expect(c.formatos).toEqual(['mp3', 'wav', 'm4a', 'ogg'])
    expect(PRESETS_VOZ.filter((p) => p.usaPitch).length).toBeGreaterThan(3)
  })

  it('grave reduz o tom com rubberband e reforça graves', () => {
    const f = construirFiltrosVoz('grave', 1).join(',')
    expect(f).toContain('rubberband=pitch=0.780')
    expect(f).toContain('equalizer=f=180')
    expect(f).toContain('afftdn=nf=-28')
    expect(f).toContain('loudnorm=I=-16')
  })

  it('criança desloca formantes e monstro combina tom grave e eco', () => {
    expect(construirFiltrosVoz('crianca', 1).join(',')).toContain('formant=shifted')
    const monstro = construirFiltrosVoz('monstro', 1).join(',')
    expect(monstro).toContain('formant=shifted')
    expect(monstro).toContain('lowpass=f=5000')
    expect(monstro).toContain('aecho=')
  })

  it('telefone e rádio limitam a banda e comprimem', () => {
    const tel = construirFiltrosVoz('telefone').join(',')
    expect(tel).toContain('highpass=f=300')
    expect(tel).toContain('lowpass=f=3400')
    expect(tel).toContain('acompressor=')
    const radio = construirFiltrosVoz('radio').join(',')
    expect(radio).toContain('lowpass=f=5000')
    expect(radio).toContain('aecho=')
  })

  it('robô, caverna, megafone, sussurro e coro têm assinaturas próprias', () => {
    expect(construirFiltrosVoz('robo').join(',')).toContain('aphaser=')
    expect(construirFiltrosVoz('caverna').join(',')).toContain('aecho=0.8:0.9:60|120')
    expect(construirFiltrosVoz('megafone').join(',')).toContain('volume=2')
    expect(construirFiltrosVoz('sussurro').join(',')).toContain('highpass=f=900')
    expect(construirFiltrosVoz('coro').join(',')).toContain('chorus=')
  })

  it('original aplica só limpeza e respeita as opções', () => {
    const comLimpeza = construirFiltrosVoz('original', 0.7).join(',')
    expect(comLimpeza).toContain('afftdn=')
    expect(comLimpeza).toContain('loudnorm=')
    const semRuido = construirFiltrosVoz('original', 0.7, { reduzirRuido: false, normalizar: false }).join(',')
    expect(semRuido).not.toContain('afftdn=')
    expect(semRuido).not.toContain('loudnorm=')
    expect(semRuido).toBe('anull')
  })

  it('de-esser e corte de silêncios entram quando pedidos', () => {
    const f = construirFiltrosVoz('agudo', 0.5, { deesser: true, cortarSilencios: true }).join(',')
    expect(f).toContain('deesser=')
    expect(f).toContain('silenceremove=')
    expect(f).toContain('areverse')
    expect(f).toContain('rubberband=pitch=1.110')
  })

  it('intensidade modula o desvio de tom', () => {
    const leve = construirFiltrosVoz('grave', 0.2).join(',')
    const forte = construirFiltrosVoz('grave', 1).join(',')
    expect(leve).toContain('pitch=0.956')
    expect(forte).toContain('pitch=0.780')
  })
})
