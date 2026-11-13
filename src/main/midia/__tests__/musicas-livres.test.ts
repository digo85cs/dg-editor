import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CATALOGO, ESTILOS, acharFaixa, catalogoLivres } from '../musicas-livres'

let dir = ''
const anterior = process.env.DG_MUSICAS_DIR

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dg-musicas-livres-'))
  process.env.DG_MUSICAS_DIR = dir
})

afterEach(() => {
  if (anterior === undefined) delete process.env.DG_MUSICAS_DIR
  else process.env.DG_MUSICAS_DIR = anterior
  rmSync(dir, { recursive: true, force: true })
})

describe('catalogo de musicas livres', () => {
  it('tem ids unicos e estilos validos', () => {
    const ids = CATALOGO.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    const estilos = new Set(ESTILOS.map((e) => e.id))
    for (const f of CATALOGO) {
      expect(estilos.has(f.estilo)).toBe(true)
      expect(f.url).toMatch(/^https:\/\//)
      expect(f.licenca).toBe('CC BY 4.0')
      expect(f.credito.toLowerCase()).toContain('kevin macleod')
    }
  })

  it('todo estilo tem ao menos uma faixa', () => {
    for (const e of ESTILOS) {
      expect(CATALOGO.some((f) => f.estilo === e.id)).toBe(true)
    }
  })

  it('marca faixas ja baixadas sem acessar a rede', () => {
    const faixa = CATALOGO[0]
    const pasta = join(dir, faixa.estilo)
    mkdirSync(pasta, { recursive: true })
    writeFileSync(join(pasta, faixa.id + '.mp3'), Buffer.alloc(200 * 1024))
    const cat = catalogoLivres()
    const item = cat.estilos.flatMap((e) => e.faixas).find((f) => f.id === faixa.id)
    expect(item?.baixada).toBe(true)
    expect(item?.bytes).toBeGreaterThan(100 * 1024)
    expect(acharFaixa(faixa.id)?.titulo).toBe(faixa.titulo)
  })

  it('rejeita estilo desconhecido sem baixar nada', async () => {
    const { baixarFaixas } = await import('../musicas-livres')
    const r = await baixarFaixas({ estilo: 'inexistente' })
    expect(r.ok).toBe(false)
    expect(r.erro).toMatch(/estilo desconhecido/)
  })
})
