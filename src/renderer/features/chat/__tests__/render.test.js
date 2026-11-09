import { describe, expect, it } from 'vitest'
import { normalizarMensagensChat, bolhaHtml } from '../render.js'

describe('chat render', () => {
  it('normaliza mensagens', () => {
    expect(normalizarMensagensChat([{ role: 'user' }])).toHaveLength(1)
    expect(normalizarMensagensChat({ mensagens: [{ role: 'user' }] })).toHaveLength(1)
    expect(normalizarMensagensChat(null)).toEqual([])
  })
  it('mensagem usuario -> classe e conteúdo escapado', () => {
    const b = bolhaHtml('user', '<oi>', null)
    expect(b.cls).toBe('msg user')
    expect(b.html).toContain('&lt;oi&gt;')
  })
  it('mensagem assistant com provider', () => {
    const b = bolhaHtml('assistant', 'ok', 'openai')
    expect(b.cls).toBe('msg assistant')
    expect(b.html).toContain('msg-provider')
  })
})
