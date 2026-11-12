import { describe, expect, it } from 'vitest'
import { pedidoSoConversacional, resolverRotaChat } from '../agent-router'

describe('roteador estilo Cursor', () => {
  it('cumprimento curto fica no chat sem tools', () => {
    expect(pedidoSoConversacional('oi')).toBe(true)
    expect(resolverRotaChat('auto', 'oi').kind).toBe('chat')
  })

  it('pedido de acao vai para agente com tools', () => {
    const r = resolverRotaChat('auto', 'liste os arquivos do projeto e valide as skills')
    expect(r.kind).toBe('agente')
    expect(r.agente).toBeTruthy()
  })

  it('configurar UI tambem usa agente', () => {
    const r = resolverRotaChat('auto', 'configure provedores de ia')
    expect(r.kind).toBe('agente')
  })
})
