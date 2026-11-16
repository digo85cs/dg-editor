import { describe, expect, it } from 'vitest'
import { lerCatalogoMcp } from '../mercado'

describe('mcp/mercado', () => {
  it('catalogo tem servidores com campos obrigatorios', () => {
    const cat = lerCatalogoMcp()
    expect(cat.length).toBeGreaterThanOrEqual(5)
    for (const s of cat) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/)
      expect(s.nome.length).toBeGreaterThan(0)
      expect(s.descricao.length).toBeGreaterThan(10)
      expect(s.comando.length).toBeGreaterThan(0)
      expect(s.config.command).toBeTruthy()
      expect(Array.isArray(s.config.args)).toBe(true)
    }
  })

  it('ids sao unicos', () => {
    const ids = lerCatalogoMcp().map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
