import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  anexarChunk,
  cancelarGravacao,
  caminhoGravacao,
  converterParaMp4,
  finalizarGravacao,
  iniciarGravacao,
  listarGravacoes,
  nomeGravacaoSeguro,
  pastaGravacoes
} from '../index'

let raiz = ''

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'dg-gravacao-'))
})

afterEach(() => {
  rmSync(raiz, { recursive: true, force: true })
})

describe('gravador de tela (arquivo)', () => {
  it('nome seguro rejeita separadores e aceita nome simples', () => {
    expect(nomeGravacaoSeguro('aula-01')).toBe('aula-01')
    expect(nomeGravacaoSeguro('aula.webm')).toBe('aula')
    expect(nomeGravacaoSeguro('../fora')).toBeNull()
    expect(nomeGravacaoSeguro('a/b')).toBeNull()
    expect(nomeGravacaoSeguro('   ')).toBeNull()
  })

  it('inicia, anexa chunks e finaliza gravando WebM', async () => {
    const s = iniciarGravacao(raiz, 'teste')
    expect(s.caminho.startsWith(pastaGravacoes(raiz))).toBe(true)
    expect(await anexarChunk(s.id, new Uint8Array([1, 2, 3]))).toMatchObject({ ok: true, bytes: 3 })
    expect(await anexarChunk(s.id, new Uint8Array([4, 5]))).toMatchObject({ ok: true, bytes: 5 })
    const fim = await finalizarGravacao(s.id)
    expect(fim.ok).toBe(true)
    if (fim.ok) {
      expect(fim.bytes).toBe(5)
      expect(readFileSync(fim.caminho)).toEqual(Buffer.from([1, 2, 3, 4, 5]))
    }
    expect(await anexarChunk(s.id, new Uint8Array([9]))).toMatchObject({ ok: false })
  })

  it('finalizar sem dados remove o arquivo e devolve erro', async () => {
    const s = iniciarGravacao(raiz, 'vazia')
    const fim = await finalizarGravacao(s.id)
    expect(fim.ok).toBe(false)
    expect(existsSync(s.caminho)).toBe(false)
  })

  it('cancelar apaga o arquivo parcial', async () => {
    const s = iniciarGravacao(raiz, 'cancelada')
    await anexarChunk(s.id, new Uint8Array([7, 7, 7]))
    await cancelarGravacao(s.id)
    expect(existsSync(s.caminho)).toBe(false)
  })

  it('lista gravações ordenando por data e ignorando outros arquivos', () => {
    const a = iniciarGravacao(raiz, 'antiga')
    const b = iniciarGravacao(raiz, 'nova')
    writeFileSync(a.caminho, 'x')
    writeFileSync(b.caminho, 'yy')
    utimesSync(a.caminho, new Date(1000), new Date(1000))
    utimesSync(b.caminho, new Date(2000), new Date(2000))
    writeFileSync(join(pastaGravacoes(raiz), 'ignorar.txt'), 'no')
    const lista = listarGravacoes(raiz)
    expect(lista.map((g) => g.nome)).toEqual(['nova.webm', 'antiga.webm'])
    expect(lista.every((g) => g.caminhoRel.startsWith('.dg-editor/gravacoes/'))).toBe(true)
  })

  it('gravação fora do projeto é recusada na conversão', async () => {
    const fora = mkdtempSync(join(tmpdir(), 'dg-fora-'))
    try {
      const arquivo = join(fora, 'x.webm')
      writeFileSync(arquivo, 'x')
      const r = await converterParaMp4(raiz, { entrada: arquivo })
      expect(r.ok).toBe(false)
    } finally {
      rmSync(fora, { recursive: true, force: true })
    }
  })

  it('caminho padrão usa carimbo de tempo quando não há nome', () => {
    const p = caminhoGravacao(raiz)
    expect(/gravacao-\d{8}-\d{6}\.webm$/.test(p)).toBe(true)
  })
})
