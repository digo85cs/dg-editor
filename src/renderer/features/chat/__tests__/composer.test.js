import { describe, expect, it, vi } from 'vitest'
import { deveEnviarPorEnter } from '../composer.js'

describe('chat composer', () => {
  it('Enter chama enviar', () => {
    expect(deveEnviarPorEnter({ key: 'Enter', shiftKey: false })).toBe(true)
  })
  it('Shift+Enter não envia', () => {
    expect(deveEnviarPorEnter({ key: 'Enter', shiftKey: true })).toBe(false)
  })
  it('texto vazio/sem Enter não envia', () => {
    expect(deveEnviarPorEnter({ key: 'a', shiftKey: false })).toBe(false)
  })
})
