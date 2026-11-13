import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  construirArgsCorte,
  construirArgsSegmento,
  construirArgsUpscale,
  construirListaConcat,
  destinoArquivo,
  extrairLimitePollinations,
  nomeArquivo,
  parseTempo,
  pastaMidia,
  slug,
  urlPollinations,
  validarEntrada
} from '../core'

const raiz = mkdtempSync(join(tmpdir(), 'dg-midia-'))

afterAll(() => {
  rmSync(raiz, { recursive: true, force: true })
})

describe('estúdio de mídia — núcleo', () => {
  it('gera slug sem acentos e limitado', () => {
    expect(slug('  Notícias do Coração!  ')).toBe('noticias-do-coracao')
    expect(slug('***')).toBe('midia')
    expect(slug('a'.repeat(100)).length).toBe(48)
  })

  it('nomeia arquivos com prefixo, carimbo e extensão', () => {
    const nome = nomeArquivo('Minha Imagem', 'png', new Date(2026, 0, 2, 3, 4, 5))
    expect(nome.startsWith('minha-imagem-20260102-030405-')).toBe(true)
    expect(nome.endsWith('.png')).toBe(true)
  })

  it('monta URL do Pollinations com limites e parâmetros gratuitos', () => {
    const url = urlPollinations({ prompt: 'gato azul', largura: 9999, altura: 10, seed: 7.9 })
    const u = new URL(url)
    expect(u.hostname).toBe('image.pollinations.ai')
    expect(u.pathname).toContain(encodeURIComponent('gato azul'))
    expect(u.searchParams.get('width')).toBe('1536')
    expect(u.searchParams.get('height')).toBe('64')
    expect(u.searchParams.get('nologo')).toBe('true')
    expect(u.searchParams.get('seed')).toBe('7')
    expect(u.searchParams.get('model')).toBeNull()
  })

  it('extrai o retry do limite gratuito', () => {
    const corpo = JSON.stringify({
      status: 402,
      error: { code: 'FREE_LIMIT', message: 'Free limit reached: 1 image every 45 seconds per IP. Retry after 22s.' }
    })
    const r = extrairLimitePollinations(corpo)
    expect(r.retrySegundos).toBe(22)
    expect(r.mensagem).toMatch(/free limit/i)
    expect(extrairLimitePollinations('texto solto').mensagem).toBe('texto solto')
  })

  it('monta filtro de upscale + nitidez', () => {
    const args = construirArgsUpscale('in.png', 'out.png', 2, 0.6)
    expect(args).toContain('-vf')
    const filtro = args[args.indexOf('-vf') + 1]
    expect(filtro).toContain('scale=iw*2:ih*2:flags=lanczos')
    expect(filtro).toContain('unsharp=5:5:0.6')
    expect(args[args.length - 1]).toBe('out.png')
  })

  it('escapa nomes na lista de concatenação', () => {
    const txt = construirListaConcat(["C:\\midia\\a'b.mp4", 'C:\\midia\\c.mp4'])
    expect(txt).toContain("file 'C:/midia/a'\\''b.mp4'")
    expect(txt).toContain("file 'C:/midia/c.mp4'")
    expect(txt.endsWith('\n')).toBe(true)
  })

  it('interpreta tempos em segundos e hh:mm:ss', () => {
    expect(parseTempo(12)).toBe(12)
    expect(parseTempo('1:30')).toBe(90)
    expect(parseTempo('01:02:03')).toBe(3723)
    expect(parseTempo('1,5')).toBe(1.5)
    expect(parseTempo('abc')).toBeNull()
    expect(parseTempo('1:2:3:4')).toBeNull()
  })

  it('monta corte com duração calculada', () => {
    const args = construirArgsCorte('in.mp4', 'out.mp4', 5, 8)
    expect(args[args.indexOf('-ss') + 1]).toBe('5.000')
    expect(args[args.indexOf('-t') + 1]).toBe('3.000')
    expect(args[args.length - 1]).toBe('out.mp4')
  })

  it('monta segmento de slideshow com escala e fps', () => {
    const args = construirArgsSegmento('foto.jpg', 'seg.mp4', 2.5, 1920, 1080, 30)
    const filtro = args[args.indexOf('-vf') + 1]
    expect(filtro).toContain('scale=1920:1080:force_original_aspect_ratio=decrease')
    expect(filtro).toContain('pad=1920:1080')
    expect(filtro).toContain('fps=30')
    expect(args).toContain('-loop')
  })

  it('mantém saída dentro do projeto e recusa fuga', () => {
    const dentro = destinoArquivo(raiz, 'teste.png')
    expect(dentro.startsWith(pastaMidia(raiz))).toBe(true)
    expect(() => destinoArquivo(raiz, 'x.png', join('..', 'fora.png'))).toThrow()
  })

  it('valida formato de entrada', () => {
    const png = join(raiz, 'ok.png')
    writeFileSync(png, Buffer.from('89504e47', 'hex'))
    expect(validarEntrada(png, 'imagem')).toBeNull()
    expect(validarEntrada(png, 'video')).toMatch(/formato não suportado/)
    expect(validarEntrada(join(raiz, 'nao-existe.png'), 'imagem')).toMatch(/não encontrado/)
  })
})
