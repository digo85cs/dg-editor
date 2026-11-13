import { describe, it, expect } from 'vitest'
import {
  calcularUso,
  custoEstimadoUSD,
  estimarTokens,
  resumirUso
} from '../brain/custo-sessao'

describe('custo-sessao', () => {
  it('estimarTokens usa ~4 caracteres por token com piso 1', () => {
    expect(estimarTokens('')).toBe(0)
    expect(estimarTokens(null)).toBe(0)
    expect(estimarTokens('abcd')).toBe(1)
    expect(estimarTokens('a'.repeat(401))).toBe(101)
  })

  it('custoEstimadoUSD zera local e retorna null para provider sem preco tabelado', () => {
    expect(custoEstimadoUSD('ollama:qwen2.5-coder', 1000, 500)).toBe(0)
    expect(custoEstimadoUSD('mock', 1000, 500)).toBeNull()
    expect(custoEstimadoUSD('', 10, 10)).toBeNull()
  })

  it('custoEstimadoUSD aplica tabela do registry (id:modelo)', () => {
    const c = custoEstimadoUSD('openai:gpt-6-luna', 1_000_000, 1_000_000)
    expect(c).toBeCloseTo(0.6, 6)
  })

  it('calcularUso devolve entrada/saida/total e marca estimado', () => {
    const u = calcularUso('ollama:modelo', 'a'.repeat(400), 'b'.repeat(80))
    expect(u).toEqual({
      entrada: 100,
      saida: 20,
      total: 120,
      custoUSD: 0,
      estimado: true
    })
  })

  it('resumirUso soma apenas mensagens com usage', () => {
    const r = resumirUso([
      { usage: { entrada: 100, saida: 40, custoUSD: 0.001 } },
      { role: 'user' },
      { usage: { entrada: 50, saida: 10, custoUSD: null } }
    ])
    expect(r.tokensEntrada).toBe(150)
    expect(r.tokensSaida).toBe(50)
    expect(r.tokensTotal).toBe(200)
    expect(r.turnos).toBe(2)
    expect(r.custoUSD).toBeCloseTo(0.001, 6)
  })
})
