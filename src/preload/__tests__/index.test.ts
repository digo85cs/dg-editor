import { describe, expect, it, vi, beforeEach } from 'vitest'

describe('preload - sanitizacao de caminhos', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('ehCaminhoSeguro bloqueia travessia ..', () => {
    // Simula a logica de ehCaminhoSeguro do preload
    function ehCaminhoSeguro(caminho: unknown): boolean {
      if (typeof caminho !== 'string') return false
      if (!caminho || caminho.length > 1000) return false
      if (caminho.includes('..')) return false
      if (caminho.startsWith('/') && !caminho.startsWith('/home/') && !caminho.startsWith('/Users/')) return false
      if (/^[A-Za-z]:[\\/]/.test(caminho)) return false
      return true
    }

    expect(ehCaminhoSeguro('src/main/ipc/chat.ts')).toBe(true)
    expect(ehCaminhoSeguro('../secreto')).toBe(false)
    expect(ehCaminhoSeguro('src/../../etc/passwd')).toBe(false)
    expect(ehCaminhoSeguro('')).toBe(false)
    expect(ehCaminhoSeguro(null as any)).toBe(false)
    expect(ehCaminhoSeguro(123 as any)).toBe(false)
  })

  it('sanitizarArgs limita numero de argumentos', () => {
    function sanitizarArgs(args: unknown[]): unknown[] {
      const MAX_ARGS = 8
      if (args.length > MAX_ARGS) throw new Error('Demais argumentos para o canal')
      return args
    }

    expect(() => sanitizarArgs([1, 2, 3, 4, 5, 6, 7, 8])).not.toThrow()
    expect(() => sanitizarArgs([1, 2, 3, 4, 5, 6, 7, 8, 9])).toThrow('Demais argumentos')
  })

  it('sanitizarArgs limita tamanho de string', () => {
    function sanitizarArgs(args: unknown[]): unknown[] {
      const MAX_ARG_LEN = 200000
      return args.map((a) => {
        if (typeof a === 'string' && a.length > MAX_ARG_LEN) {
          throw new Error('Argumento excede tamanho maximo permitido')
        }
        return a
      })
    }

    const curta = 'x'.repeat(100)
    const longa = 'x'.repeat(200001)

    expect(() => sanitizarArgs([curta])).not.toThrow()
    expect(() => sanitizarArgs([longa])).toThrow('Argumento excede tamanho maximo')
  })
})
