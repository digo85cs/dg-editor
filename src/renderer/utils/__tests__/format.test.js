import { describe, expect, it, vi } from 'vitest'
import { tempoRelativoCommit } from '../format.js'

describe('utils/format tempoRelativoCommit', () => {
  it('retorna vazio para inválido', () => {
    expect(tempoRelativoCommit(0)).toBe('')
    expect(tempoRelativoCommit(NaN)).toBe('')
  })
  it('formata minutos/horas/dias', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:10:00Z'))
    const now = Math.floor(Date.now() / 1000)
    expect(tempoRelativoCommit(now - 30)).toBe('agora')
    expect(tempoRelativoCommit(now - 120)).toBe('2m')
    expect(tempoRelativoCommit(now - 7200)).toBe('2h')
    expect(tempoRelativoCommit(now - 172800)).toBe('2d')
    vi.useRealTimers()
  })
})
