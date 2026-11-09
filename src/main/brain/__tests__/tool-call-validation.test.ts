import { describe, expect, it } from 'vitest'
import { normalizarArgs, sanitizarArgs, validarChamadaTool } from '../tool-call-validation'
import type { McpTool } from '../../mcp/client'

const tools: McpTool[] = [
  { name: 'codigo_ler', description: '', inputSchema: { type: 'object', properties: { nome: { type: 'string' } }, required: ['nome'] } },
  { name: 'projeto_arvore', description: '', inputSchema: { type: 'object', properties: { maxProfundidade: { type: 'number' } }, required: [] } },
  { name: 'agente_executar', description: '', inputSchema: { type: 'object', properties: { mensagem: { type: 'string' } }, required: ['mensagem'] } },
]

describe('tool-call validation (Block 5)', () => {
  it('normaliza arguments string JSON para objeto', () => {
    expect(normalizarArgs('{"nome":"x"}')).toEqual({ nome: 'x' })
    expect(normalizarArgs('  ')).toEqual({})
    expect(normalizarArgs('{bad')).toEqual({})
  })

  it('sanitiza artefatos de schema e coage tipos', () => {
    const schema = { properties: { maxProfundidade: { type: 'number' }, ok: { type: 'boolean' } } }
    expect(sanitizarArgs({ maxProfundidade: '3', ok: 'true', type: 'object', properties: {} }, schema)).toEqual({ maxProfundidade: 3, ok: true })
  })

  it('rejeita tool desconhecida', () => {
    const r = validarChamadaTool('nao_existe', {}, tools)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/tool desconhecida/)
  })

  it('rejeita agente_executar no loop interno', () => {
    const r = validarChamadaTool('agente_executar', { mensagem: 'x' }, tools)
    expect(r.ok).toBe(false)
  })

  it('rejeita required ausente', () => {
    const r = validarChamadaTool('codigo_ler', {}, tools)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/obrigatórios ausentes/)
  })

  it('aceita chamada válida e saneia args', () => {
    const r = validarChamadaTool('codigo_ler', { nome: 'src/a.ts', type: 'object' }, tools)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.args).toEqual({ nome: 'src/a.ts' })
  })
})
