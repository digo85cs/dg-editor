import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../dglog', () => ({ dglog: vi.fn() }))

import { ajustarCtxOllama, estimarTokensPrompt } from '../num-ctx'

const msgs = [
  { role: 'system', content: 'sys' },
  { role: 'user', content: 'pedido' }
]

function toolFake(name: string, tamKb = 1): { name: string; description: string; inputSchema: unknown } {
  return {
    name,
    description: 'd'.repeat(tamKb * 1000),
    inputSchema: { type: 'object', properties: { x: { type: 'string', description: 'y'.repeat(200) } } }
  }
}

describe('num-ctx: num_ctx derivado do prompt', () => {
  beforeEach(() => vi.clearAllMocks())

  it('prompt pequeno: num_ctx = piso 4096', async () => {
    const r = await ajustarCtxOllama({
      modelo: 'fake:1b',
      mensagens: msgs,
      tools: [toolFake('codigo_ler')],
      contextoMaxOverride: 32768
    })
    expect(r.numCtx).toBe(4096)
    expect(r.removidas).toEqual([])
    expect(r.toolsEfetivas).toHaveLength(1)
  })

  it('prompt medio: num_ctx cobre tokens*1.3 sem passar do teto', async () => {
    // ~3KB de tools => ~750+ tokens estimados => num_ctx ~1024 -> piso 4096
    const tools = Array.from({ length: 3 }, (_, i) => toolFake('codigo_buscar_' + i, 1))
    const r = await ajustarCtxOllama({
      modelo: 'fake:1b',
      mensagens: msgs,
      tools,
      contextoMaxOverride: 32768
    })
    expect(r.numCtx).toBeGreaterThanOrEqual(4096)
    expect(r.numCtx).toBeLessThanOrEqual(32768)
    expect(r.tokensEstimados * 1.3).toBeLessThanOrEqual(r.numCtx + 512)
  })

  it('prompt gigante com contexto pequeno: remove tools ate caber e loga', async () => {
    // 60 tools de ~1KB cada ~= 15k tokens; ctxMax 8192 => orcamento ~6300 tokens
    const tools = [
      toolFake('terminal_exec', 1),
      toolFake('codigo_ler', 1),
      ...Array.from({ length: 58 }, (_, i) => toolFake('midia_tool_' + i, 1))
    ]
    const r = await ajustarCtxOllama({
      modelo: 'fake:1b',
      mensagens: msgs,
      tools,
      contextoMaxOverride: 8192
    })
    expect(r.removidas.length).toBeGreaterThan(0)
    expect(r.toolsEfetivas.length).toBeLessThan(tools.length)
    // intocaveis nunca saem
    expect(r.toolsEfetivas.map((t) => t.name)).toContain('codigo_ler')
    expect(r.toolsEfetivas.map((t) => t.name)).toContain('terminal_exec')
    // o que ficou cabe no orcamento
    expect(r.tokensEstimados).toBeLessThanOrEqual(Math.floor(8192 / 1.3) + 400)
  })

  it('ordem de corte: midia sai antes de tool generica', async () => {
    const tools = [
      toolFake('disco_extra_a', 4),
      toolFake('midia_render', 4),
      toolFake('deploy_push', 4),
      toolFake('git_extra_b', 4)
    ]
    const r = await ajustarCtxOllama({
      modelo: 'fake:1b',
      mensagens: msgs,
      tools,
      contextoMaxOverride: 4096 // orcamento ~3150 tokens; cada tool ~1000tok
    })
    expect(r.removidas[0]).toBe('midia_render')
    expect(r.removidas).toContain('deploy_push')
  })

  it('messages so (sem tools): num_ctx deriva do contexto da conversa', async () => {
    const grande = [{ role: 'user', content: 'x'.repeat(20000) }]
    const r = await ajustarCtxOllama({
      modelo: 'fake:1b',
      mensagens: grande,
      contextoMaxOverride: 32768
    })
    expect(r.numCtx).toBeGreaterThan(4096)
    expect(r.numCtx).toBeLessThanOrEqual(32768)
  })

  it('estimarTokensPrompt: bytes/4', () => {
    const t = estimarTokensPrompt([{ role: 'user', content: 'a'.repeat(400) }])
    expect(t).toBeGreaterThanOrEqual(100)
    expect(t).toBeLessThanOrEqual(120)
  })
})
