import { describe, expect, it } from 'vitest'
import { caminhoArgumentoValido, sanitizarArgs, MAX_ARGS, MAX_ARG_LEN } from '../sanitize'

describe('preload - sanitizacao de argumentos', () => {
  it('aceita caminhos absolutos do Windows (explorer usa caminho absoluto)', () => {
    expect(caminhoArgumentoValido('C:\\dev\\DGEditor')).toBe(true)
    expect(caminhoArgumentoValido('D:\\CURSOR\\DG Editor\\src')).toBe(true)
    expect(caminhoArgumentoValido('C:/dev/DGEditor/src/main/index.ts')).toBe(true)
  })

  it('aceita caminhos absolutos POSIX e relativos', () => {
    expect(caminhoArgumentoValido('/home/user/projeto')).toBe(true)
    expect(caminhoArgumentoValido('/Users/user/projeto')).toBe(true)
    expect(caminhoArgumentoValido('src/main/ipc/chat.ts')).toBe(true)
  })

  it('rejeita payload invalido sem derrubar o canal', () => {
    expect(caminhoArgumentoValido('')).toBe(false)
    expect(caminhoArgumentoValido(null as unknown)).toBe(false)
    expect(caminhoArgumentoValido(123 as unknown)).toBe(false)
    expect(caminhoArgumentoValido('x'.repeat(1001))).toBe(false)
    expect(caminhoArgumentoValido('C:\\proj\0malicioso')).toBe(false)
  })

  it('sanitizarArgs limita numero de argumentos', () => {
    expect(() => sanitizarArgs(Array.from({ length: MAX_ARGS }, (_, i) => i))).not.toThrow()
    expect(() => sanitizarArgs(Array.from({ length: MAX_ARGS + 1 }, (_, i) => i))).toThrow(
      'Demais argumentos'
    )
  })

  it('sanitizarArgs limita tamanho de string', () => {
    expect(() => sanitizarArgs(['x'.repeat(MAX_ARG_LEN)])).not.toThrow()
    expect(() => sanitizarArgs(['x'.repeat(MAX_ARG_LEN + 1)])).toThrow('Argumento excede tamanho')
  })
})
