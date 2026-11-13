import { describe, expect, it } from 'vitest'
import { linhaPorFracao, resumoLinha } from '../minimap-math.js'

describe('minimapa: matematica', () => {
  it('resumoLinha separa indentacao de conteudo', () => {
    expect(resumoLinha('    const x = 1   ')).toEqual({ indent: 4, len: 11 })
    expect(resumoLinha('')).toEqual({ indent: 0, len: 0 })
    expect(resumoLinha(null)).toEqual({ indent: 0, len: 0 })
  })

  it('linhaPorFracao respeita limites', () => {
    expect(linhaPorFracao(0, 100)).toBe(1)
    expect(linhaPorFracao(0.5, 100)).toBe(51)
    expect(linhaPorFracao(1, 100)).toBe(100)
    expect(linhaPorFracao(-3, 10)).toBe(1)
    expect(linhaPorFracao(9, 10)).toBe(10)
    expect(linhaPorFracao(0.4, 0)).toBe(1)
  })
})
