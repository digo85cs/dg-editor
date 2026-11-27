import { describe, expect, it } from 'vitest'
import { resgatarToolCallDoContent } from '../providers'

const NOMES = new Set(['codigo_ler', 'codigo_criar', 'terminal_exec'])

describe('resgate de tool_call no content (providers)', () => {
  it('aceita {"name","arguments"} puro', () => {
    const r = resgatarToolCallDoContent(
      '{"name":"codigo_ler","arguments":{"caminho":"a.ts"}}',
      NOMES
    )
    expect(r).toHaveLength(1)
    expect(r[0].function.name).toBe('codigo_ler')
    expect(r[0].function.arguments).toEqual({ caminho: 'a.ts' })
  })

  it('aceita {"tool","parameters"}', () => {
    const r = resgatarToolCallDoContent(
      '{"tool":"terminal_exec","parameters":{"comando":"dir"}}',
      NOMES
    )
    expect(r[0].function.name).toBe('terminal_exec')
    expect(r[0].function.arguments).toEqual({ comando: 'dir' })
  })

  it('aceita bloco ```json cercado', () => {
    const r = resgatarToolCallDoContent(
      'Vou chamar a tool.\n```json\n{"name":"codigo_criar","arguments":{"caminho":"x.ts","conteudo":""}}\n```',
      NOMES
    )
    // formato com texto em volta: o bloco inteiro nao parseia, mas o
    // scanner de chaves balanceadas encontra o objeto interno
    expect(r).toHaveLength(1)
    expect(r[0].function.name).toBe('codigo_criar')
  })

  it('aceita JSON com texto antes/depois (bloco balanceado)', () => {
    const r = resgatarToolCallDoContent(
      'Aqui esta: {"name":"codigo_ler","arguments":{"caminho":"b.ts"}} fim',
      NOMES
    )
    expect(r).toHaveLength(1)
    expect(r[0].function.name).toBe('codigo_ler')
  })

  it('recusa nome que nao existe no pacote', () => {
    const r = resgatarToolCallDoContent('{"name":"tool_inexistente","arguments":{}}', NOMES)
    expect(r).toHaveLength(0)
  })

  it('recusa JSON invalido e texto puro (trata como texto)', () => {
    expect(resgatarToolCallDoContent('{"name":"codigo_ler",', NOMES)).toHaveLength(0)
    expect(resgatarToolCallDoContent('resposta em texto normal', NOMES)).toHaveLength(0)
    expect(resgatarToolCallDoContent('', NOMES)).toHaveLength(0)
  })

  it('arguments como string JSON e parseado', () => {
    const r = resgatarToolCallDoContent(
      '{"name":"codigo_ler","arguments":"{\\"caminho\\":\\"c.ts\\"}"}',
      NOMES
    )
    expect(r[0].function.arguments).toEqual({ caminho: 'c.ts' })
  })

  it('arguments ausente vira objeto vazio', () => {
    const r = resgatarToolCallDoContent('{"name":"codigo_ler"}', NOMES)
    expect(r[0].function.arguments).toEqual({})
  })
})
