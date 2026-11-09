import { describe, expect, it } from 'vitest'
import { escapar } from '../dom.js'

describe('utils/dom escapar', () => {
  it('escapa caracteres HTML', () => {
    expect(escapar('<a & "b">')).toBe('&lt;a &amp; &quot;b&quot;&gt;')
  })
  it('trata null/undefined como vazio', () => {
    expect(escapar(null)).toBe('')
    expect(escapar(undefined)).toBe('')
  })
})
