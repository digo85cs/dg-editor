import { describe, expect, it } from 'vitest'
import {
  construirArgsEstabilizacao,
  construirArgsImagem,
  construirArgsVideo,
  construirFiltrosVideo,
  escaparCaminhoFiltro,
  filtrosCor,
  filtrosEscala
} from '../qualidade'

describe('qualidade de vídeo', () => {
  it('sem ajustes gera cadeia neutra', () => {
    expect(filtrosCor({})).toEqual([])
    expect(construirFiltrosVideo({ entrada: 'a.mp4' })).toEqual(['null'])
  })

  it('monta denoise, cor e nitidez na ordem', () => {
    const f = filtrosCor({ denoise: 0.5, brilho: 10, contraste: 20, saturacao: 150, gamma: 1.2, nitidez: 1 })
    expect(f[0]).toBe('hqdn3d=0.50:0.38:0.75:0.75')
    expect(f[1]).toBe('eq=brightness=0.100:contrast=1.200:saturation=1.500:gamma=1.20')
    expect(f[2]).toBe('unsharp=5:5:1.00:5:5:0')
  })

  it('escala usa Lanczos com dimensões pares e respeita limite', () => {
    expect(filtrosEscala(1)).toBeNull()
    expect(filtrosEscala(1.5, 2)).toBe('scale=trunc(iw*1.50/2)*2:trunc(ih*1.50/2)*2:flags=lanczos')
    expect(filtrosEscala(9, 2)).toContain('iw*2.00')
  })

  it('estabilização escapa caminho e entra antes dos demais filtros', () => {
    expect(escaparCaminhoFiltro('C:\\tmp\\a.trf')).toBe('C\\:/tmp/a.trf')
    const f = construirFiltrosVideo({ entrada: 'a.mp4', nitidez: 0.5, escala: 2, fps: 30 }, 'C:\\tmp\\a.trf')
    expect(f[0]).toBe('vidstabtransform=input=C\\:/tmp/a.trf:smoothing=10:zoom=5:optzoom=1')
    expect(f[1]).toBe('unsharp=5:5:0.50:5:5:0')
    expect(f[2]).toContain('scale=trunc')
    expect(f[3]).toBe('fps=30')
  })

  it('args de re-render usam x264/CRF/preset e áudio AAC', () => {
    const args = construirArgsVideo('in.mp4', 'out.mp4', { entrada: 'in.mp4', crf: 18, preset: 'rapido' })
    expect(args).toContain('-crf')
    expect(args[args.indexOf('-crf') + 1]).toBe('18')
    expect(args[args.indexOf('-preset') + 1]).toBe('veryfast')
    expect(args).toContain('+faststart')
    expect(args).toContain('yuv420p')
    expect(args).not.toContain('loudnorm=I=-16:TP=-1.5:LRA=11')
    expect(args[args.length - 1]).toBe('out.mp4')
  })

  it('normaliza áudio quando pedido', () => {
    const args = construirArgsVideo('in.mp4', 'out.mp4', { entrada: 'in.mp4', normalizarAudio: true })
    expect(args).toContain('loudnorm=I=-16:TP=-1.5:LRA=11')
  })

  it('primeira passada da estabilização vai para null', () => {
    const args = construirArgsEstabilizacao('in.mp4', 'C:\\tmp\\t.trf')
    expect(args.join(' ')).toContain('vidstabdetect=')
    expect(args.join(' ')).toContain('C\\:/tmp/t.trf')
    expect(args).toContain('null')
  })

  it('imagem aplica filtros, uma saída e qualidade JPG', () => {
    const args = construirArgsImagem('a.png', 'a.jpg', { entrada: 'a.png', brilho: 5, escala: 2, qualidade: 4 })
    expect(args).toContain('-frames:v')
    expect(args[args.indexOf('-frames:v') + 1]).toBe('1')
    expect(args[args.indexOf('-q:v') + 1]).toBe('4')
    const vf = args[args.indexOf('-vf') + 1]
    expect(vf).toContain('eq=brightness=0.050')
    expect(vf).toContain('scale=trunc(iw*2.00/2)*2')
  })
})
