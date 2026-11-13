import { describe, expect, it } from 'vitest'
import {
  analisarLinhaTempo,
  construirArgsFinal,
  construirArgsSegmentoEditor,
  duracaoTotal,
  filtrosAudioItem,
  normalizarItem,
  type MidiaInfo
} from '../editor'

const ALVO = { largura: 1280, altura: 720, fps: 30 }

const imagem: MidiaInfo = { tipo: 'imagem', temVideo: true, temAudio: false }
const videoComAudio: MidiaInfo = { tipo: 'video', duracaoSeg: 10, temVideo: true, temAudio: true }
const videoSemAudio: MidiaInfo = { tipo: 'video', duracaoSeg: 8, temVideo: true, temAudio: false }
const audio: MidiaInfo = { tipo: 'audio', duracaoSeg: 20, temVideo: false, temAudio: true }

describe('normalizacao da linha do tempo', () => {
  it('usa 3s por padrao em imagens e respeita duracao/fim', () => {
    expect(normalizarItem({ arquivo: 'foto.png' }, imagem).duracao).toBe(3)
    expect(normalizarItem({ arquivo: 'foto.png', duracao: 7 }, imagem).duracao).toBe(7)
    expect(normalizarItem({ arquivo: 'foto.png', fim: 4.5 }, imagem).duracao).toBe(4.5)
  })

  it('recorta video pelo inicio/fim e limita ao tamanho real', () => {
    const n = normalizarItem({ arquivo: 'a.mp4', inicio: 2, fim: 5 }, videoComAudio)
    expect(n.inicio).toBe(2)
    expect(n.duracao).toBe(3)
    const cheio = normalizarItem({ arquivo: 'a.mp4' }, videoComAudio)
    expect(cheio.duracao).toBe(10)
    const estourado = normalizarItem({ arquivo: 'a.mp4', inicio: 9, fim: 99 }, videoComAudio)
    expect(estourado.duracao).toBe(1)
  })

  it('limita volume e fades ao tamanho do clipe', () => {
    const n = normalizarItem(
      { arquivo: 'a.mp4', inicio: 0, fim: 2, volume: 9, fadeIn: 30, fadeOut: 30 },
      videoComAudio
    )
    expect(n.volume).toBe(2)
    expect(n.fadeIn).toBe(2)
    expect(n.fadeOut).toBe(2)
  })

  it('soma a duracao de todos os itens', () => {
    const lista = [
      normalizarItem({ arquivo: 'a.png', duracao: 2 }, imagem),
      normalizarItem({ arquivo: 'b.mp4', inicio: 1, fim: 4 }, videoComAudio)
    ]
    expect(duracaoTotal(lista)).toBe(5)
  })
})

describe('filtros de audio do clipe', () => {
  const base = normalizarItem({ arquivo: 'a.mp4', inicio: 0, fim: 10 }, videoComAudio)

  it('silencia quando mudo', () => {
    expect(filtrosAudioItem({ ...base, mudo: true })).toBe('anull')
  })

  it('aplica volume e fades', () => {
    const f = filtrosAudioItem({ ...base, volume: 0.5, fadeIn: 1, fadeOut: 2 })
    expect(f).toBe('volume=0.50,afade=t=in:st=0:d=1.00,afade=t=out:st=8.00:d=2.00')
  })
})

describe('argumentos do segmento', () => {
  it('imagem vira clipe com video normalizado e audio silencioso', () => {
    const item = normalizarItem({ arquivo: 'foto.png', duracao: 4 }, imagem)
    const args = construirArgsSegmentoEditor(item, 'seg.mp4', ALVO)
    expect(args).toContain('-loop')
    expect(args.join(' ')).toContain('anullsrc=channel_layout=stereo:sample_rate=48000')
    expect(args.join(' ')).toContain('scale=1280:720:force_original_aspect_ratio=decrease')
    expect(args.join(' ')).toContain('fps=30')
    expect(args).toContain('libx264')
  })

  it('video sem trilha recebe audio silencioso para manter o concat uniforme', () => {
    const item = normalizarItem({ arquivo: 'mudo.mp4', inicio: 1, fim: 3 }, videoSemAudio)
    const args = construirArgsSegmentoEditor(item, 'seg.mp4', ALVO)
    expect(args).toContain('-ss')
    expect(args.join(' ')).toContain('anullsrc')
    expect(args.join(' ')).toContain('[1:a]anull[a]')
  })

  it('audio ganha fundo preto na resolucao alvo', () => {
    const item = normalizarItem({ arquivo: 'voz.mp3', inicio: 2, fim: 6 }, audio)
    const args = construirArgsSegmentoEditor(item, 'seg.mp4', ALVO)
    expect(args.join(' ')).toContain('color=c=black:s=1280x720:r=30')
    expect(args.join(' ')).toContain('[0:a]anull')
  })

  it('arredonda a resolucao para numeros pares', () => {
    const item = normalizarItem({ arquivo: 'foto.png' }, imagem)
    const args = construirArgsSegmentoEditor(item, 'seg.mp4', { largura: 1281, altura: 721, fps: 30 })
    expect(args.join(' ')).toContain('scale=1282:722')
  })
})

describe('passo final (fades e musica)', () => {
  it('copia sem reencode quando nao ha fade nem musica', () => {
    expect(construirArgsFinal('base.mp4', 'saida.mp4', { duracaoSeg: 10 })).toEqual([
      '-y',
      '-i',
      'base.mp4',
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      'saida.mp4'
    ])
  })

  it('aplica fades de entrada e saida no video', () => {
    const args = construirArgsFinal('base.mp4', 'saida.mp4', {
      duracaoSeg: 10,
      fadeEntrada: 1,
      fadeSaida: 2
    })
    const vf = args[args.indexOf('-vf') + 1]
    expect(vf).toBe('fade=t=in:st=0:d=1.00,fade=t=out:st=8.00:d=2.00')
    expect(args).toContain('libx264')
    expect(args.join(' ')).toContain('-c:a copy')
  })

  it('mixa musica de fundo repetida e limita a duracao final', () => {
    const args = construirArgsFinal('base.mp4', 'saida.mp4', {
      duracaoSeg: 12,
      fadeSaida: 2,
      musica: 'trilha.mp3',
      volumeMusica: 0.15
    })
    const grafo = args[args.indexOf('-filter_complex') + 1]
    expect(grafo).toContain('[1:a]volume=0.15,afade=t=out:st=10.00:d=2.00[bg]')
    expect(grafo).toContain('amix=inputs=2:duration=first')
    expect(args).toContain('-stream_loop')
    expect(args.join(' ')).toContain('-t 12.000')
  })
})

describe('analise da linha do tempo', () => {
  it('recusa lista vazia', async () => {
    const r = await analisarLinhaTempo([])
    expect(r.ok).toBe(false)
    expect(r.erro).toBeTruthy()
  })

  it('recusa arquivo inexistente antes de chamar ffprobe', async () => {
    const r = await analisarLinhaTempo([{ arquivo: 'nao-existe-xyz.png' }])
    expect(r.ok).toBe(false)
    expect(r.erro).toContain('clipe 1')
  })
})
