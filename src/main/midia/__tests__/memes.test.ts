import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gerarMeme, listarMemes, quebrarLegenda, statusMemes } from '../memes'

const dirTeste = mkdtempSync(join(tmpdir(), 'dg-memes-'))
let envAnterior: string | undefined

beforeAll(() => {
  envAnterior = process.env.DG_MEMES_DIR
  process.env.DG_MEMES_DIR = dirTeste
})

afterAll(() => {
  if (envAnterior === undefined) delete process.env.DG_MEMES_DIR
  else process.env.DG_MEMES_DIR = envAnterior
  rmSync(dirTeste, { recursive: true, force: true })
})

describe('legendas de meme', () => {
  it('quebra texto longo respeitando o limite de caracteres', () => {
    const linhas = quebrarLegenda('quando o codigo compila de primeira e ninguem acredita', 20)
    expect(linhas.length).toBeGreaterThan(1)
    for (const l of linhas) expect(l.length).toBeLessThanOrEqual(20)
  })

  it('mantém palavras inteiras', () => {
    const linhas = quebrarLegenda('DG Editor gera meme local sem chave paga', 12)
    for (const l of linhas) for (const p of l.split(' ')) expect(p).not.toBe('')
    expect(linhas.join(' ')).toBe('DG Editor gera meme local sem chave paga')
  })

  it('texto vazio vira lista vazia e palavra única não é cortada', () => {
    expect(quebrarLegenda('   ', 10)).toEqual([])
    expect(quebrarLegenda('supercalifragilistico', 5)).toEqual(['supercalifragilistico'])
  })
})

describe('banco de memes sem sincronização', () => {
  it('status informa banco não sincronizado', () => {
    const s = statusMemes()
    expect(s.ok).toBe(false)
    expect(s.total).toBe(0)
    expect(s.desatualizado).toBe(true)
    expect(s.pasta).toContain('dg-memes-')
  })

  it('listar retorna erro orientando sincronizar', () => {
    const r = listarMemes()
    expect(r.ok).toBe(false)
    expect(r.erro).toMatch(/sincroniz/i)
    expect(r.templates).toEqual([])
  })

  it('gerar sem banco pede sincronização', async () => {
    const r = await gerarMeme(dirTeste, { template: '1', topo: 'oi' })
    expect(r.ok).toBe(false)
    expect(r.erro).toMatch(/sincroniz/i)
  })
})
