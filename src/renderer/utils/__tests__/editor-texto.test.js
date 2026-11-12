import { describe, expect, it } from 'vitest'
import { detectarFimDeLinha, paraDisco, paraDocumento } from '../../editor-texto.js'

describe('editor como bloco de notas', () => {
  it('detecta CRLF do Windows e LF', () => {
    expect(detectarFimDeLinha('a\r\nb')).toBe('\r\n')
    expect(detectarFimDeLinha('a\nb')).toBe('\n')
  })

  it('mostra LF no editor e grava de volta o CRLF', () => {
    const original = 'linha 1\r\nlinha 2\r\n'
    const doc = paraDocumento(original)
    expect(doc).toBe('linha 1\nlinha 2\n')
    expect(paraDisco(doc + 'nova', '\r\n')).toBe('linha 1\r\nlinha 2\r\nnova')
  })

  it('arquivo vazio continua vazio', () => {
    expect(paraDisco(paraDocumento(''), '\n')).toBe('')
  })
})
