import { describe, expect, it } from 'vitest'
import {
  cadeiaAtempo,
  catalogoEfeitos,
  filtroDelogo,
  filtroTitulo,
  filtrosAprimorar,
  filtrosBorrarRegiao,
  filtrosChroma,
  filtrosCorPreset,
  filtrosInterpolar,
  filtrosPip,
  filtrosReframe,
  filtrosTransicao,
  filtrosVelocidade,
  TRANSICOES
} from '../efeitos'

describe('efeitos de vídeo (construtores de filtros)', () => {
  it('encadeia atempo dentro dos limites do ffmpeg', () => {
    expect(cadeiaAtempo(0.25)).toEqual(['atempo=0.5', 'atempo=0.5'])
    expect(cadeiaAtempo(4)).toEqual(['atempo=2', 'atempo=2'])
    expect(cadeiaAtempo(1.5)).toEqual(['atempo=1.5'])
    expect(cadeiaAtempo(1)).toEqual([])
    expect(cadeiaAtempo(0.01)).toEqual(['atempo=0.5', 'atempo=0.5', 'atempo=0.5', 'atempo=0.5'])
  })

  it('velocidade ajusta vídeo e áudio sem mudar o tom', () => {
    expect(filtrosVelocidade(2)).toEqual({ video: ['setpts=PTS/2.0000'], audio: ['atempo=2'] })
    expect(filtrosVelocidade(0.5)).toEqual({ video: ['setpts=PTS/0.5000'], audio: ['atempo=0.5'] })
    expect(filtrosVelocidade(1)).toEqual({ video: [], audio: [] })
  })

  it('interpolação usa minterpolate e slow motion sincronizado', () => {
    const rapido = filtrosInterpolar({ fps: 60, suave: true })
    expect(rapido.video[0]).toContain('minterpolate=fps=60:mi_mode=blend')
    expect(rapido.audio).toEqual([])
    const lento = filtrosInterpolar({ fps: 120, slow: 4 })
    expect(lento.video[0]).toContain('mi_mode=mci')
    expect(lento.video[1]).toBe('setpts=PTS*4.000')
    expect(lento.audio).toEqual(['atempo=0.5', 'atempo=0.5'])
  })

  it('aprimorar combina upscale, denoise, nitidez e grão', () => {
    const f = filtrosAprimorar({ fator: 3, denoise: 0.5, nitidez: 1.2, grao: 12 }).join(',')
    expect(f).toContain('scale=trunc(iw*3/2)*2')
    expect(f).toContain('hqdn3d=3.00')
    expect(f).toContain('unsharp=5:5:1.20')
    expect(f).toContain('noise=alls=12:allf=t')
    expect(filtrosAprimorar({ fator: 1, denoise: 0, nitidez: 0 })).toEqual(['null'])
  })

  it('presets de cor caem no padrão quando desconhecidos', () => {
    expect(filtrosCorPreset('pb')).toContain('hue=s=0')
    expect(filtrosCorPreset('vivo').join(',')).toContain('saturation=1.28')
    expect(filtrosCorPreset('inexistente')).toEqual(filtrosCorPreset('cinema'))
  })

  it('título escapa o caminho do texto e respeita tamanho', () => {
    const f = filtroTitulo({ cor: '#ffcc00', tamanho: 999, posicao: 'centro' }, 'C:\\tmp\\a b\\t.txt')
    expect(f).toContain("textfile='C\\:/tmp/a b/t.txt'")
    expect(f).toContain('fontcolor=#ffcc00')
    expect(f).toContain('fontsize=200')
    expect(f).toContain('x=(w-text_w)/2')
    expect(f).toContain('y=(h-text_h)/2')
  })

  it('delogo mantém a região dentro do quadro', () => {
    expect(filtroDelogo({ x: 0, y: 0, w: 10, h: 10 }, 320, 240)).toBe('delogo=x=1:y=1:w=10:h=10')
    expect(filtroDelogo({ x: 500, y: 500, w: 400, h: 400 }, 320, 240)).toBe('delogo=x=316:y=236:w=3:h=3')
  })

  it('blur de região usa split/crop/boxblur/overlay', () => {
    const f = filtrosBorrarRegiao({ x: 10, y: 20, w: 100, h: 50 }, 12)
    expect(f).toContain('split[base][area]')
    expect(f).toContain('crop=100:50:10:20')
    expect(f).toContain('boxblur=12')
    expect(f).toContain('overlay=10:20')
  })

  it('chroma key compõe sobre o fundo normalizado', () => {
    const f = filtrosChroma('#00ff00', 0.2, 0.05, 1280, 720)
    expect(f).toContain('[0:v]chromakey=0x00ff00:0.20:0.05[fg]')
    expect(f).toContain('[1:v]scale=1280:720')
    expect(f).toContain('[bg][fg]overlay=shortest=1')
  })

  it('PiP posiciona e aplica opacidade', () => {
    const dir = filtrosPip(0.4, 'superior-esquerdo', 0.6)
    expect(dir).toContain('scale=trunc(iw*0.400/2)*2')
    expect(dir).toContain('colorchannelmixer=aa=0.60')
    expect(dir).toContain('overlay=24:24')
    expect(filtrosPip(0.4, 'inferior-direito', 1)).toContain('overlay=W-w-24:H-h-24')
  })

  it('reframe vertical gera 1080×1920 com fundo desfocado', () => {
    const f = filtrosReframe(1920, 1080)
    expect(f).toContain('gblur=sigma=40')
    expect(f).toContain('overlay=(W-w)/2:(H-h)/2')
    expect(f).toContain('1080:1920')
  })

  it('transição normaliza os dois clipes e faz crossfade de áudio', () => {
    const info = { duracao: 4, largura: 1920, altura: 1080, fps: 30, temAudio: true }
    const f = filtrosTransicao(4, 1, 'wipeleft', info, true)
    expect(f).toContain('xfade=transition=wipeleft:duration=1.00:offset=3.000')
    expect(f).toContain('acrossfade=d=1.00')
    expect(f).toContain('scale=1920:1080')
    expect(filtrosTransicao(4, 1, 'nao-existe', info, false)).toContain('transition=fade')
    expect(TRANSICOES.length).toBeGreaterThan(20)
  })

  it('catálogo lista efeitos, looks e transições', () => {
    const c = catalogoEfeitos()
    expect(c.efeitos.length).toBe(16)
    expect(c.cores.map((x) => x.id)).toContain('cinema')
    expect(c.transicoes).toContain('fade')
  })
})
