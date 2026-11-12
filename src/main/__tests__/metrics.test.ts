import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./dglog', () => ({ dglog: vi.fn() }))

import { registrarMetricaAgente, obterMetricasAgente, listarMetricasAgentes, resetarMetricas } from '../metrics'

describe('metrics', () => {
  beforeEach(() => {
    resetarMetricas()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registra sucesso e obtem metrica', () => {
    registrarMetricaAgente('/tmp/test', 'agente-teste', { ok: true, duracaoMs: 150, foiTimeout: false })

    const m = obterMetricasAgente('agente-teste')
    expect(m).toBeDefined()
    expect(m!.chamadas).toBe(1)
    expect(m!.sucessos).toBe(1)
    expect(m!.erros).toBe(0)
    expect(m!.duracaoTotalMs).toBe(150)
    expect(m!.duracaoMaxMs).toBe(150)
  })

  it('registra timeout como erro', () => {
    registrarMetricaAgente('/tmp/test', 'agente-lento', { ok: false, duracaoMs: 30000, foiTimeout: true })

    const m = obterMetricasAgente('agente-lento')
    expect(m!.timeouts).toBe(1)
    expect(m!.erros).toBe(1)
    expect(m!.sucessos).toBe(0)
  })

  it('acumula chamadas múltiplas', () => {
    registrarMetricaAgente('/tmp/test', 'agente-x', { ok: true, duracaoMs: 100, foiTimeout: false })
    registrarMetricaAgente('/tmp/test', 'agente-x', { ok: false, duracaoMs: 200, foiTimeout: false })
    registrarMetricaAgente('/tmp/test', 'agente-x', { ok: true, duracaoMs: 150, foiTimeout: false })

    const m = obterMetricasAgente('agente-x')
    expect(m!.chamadas).toBe(3)
    expect(m!.sucessos).toBe(2)
    expect(m!.erros).toBe(1)
    expect(m!.duracaoTotalMs).toBe(450)
    expect(m!.duracaoMaxMs).toBe(200)
  })

  it('listarMetricasAgentes retorna todos', () => {
    registrarMetricaAgente('/tmp/test', 'agente-a', { ok: true, duracaoMs: 50, foiTimeout: false })
    registrarMetricaAgente('/tmp/test', 'agente-b', { ok: false, duracaoMs: 100, foiTimeout: true })

    const lista = listarMetricasAgentes()
    expect(lista.length).toBe(2)
    const ids = lista.map((l) => l.agente).sort()
    expect(ids).toEqual(['agente-a', 'agente-b'])
  })

  it('resetarMetricas limpa tudo', () => {
    registrarMetricaAgente('/tmp/test', 'agente-z', { ok: true, duracaoMs: 10, foiTimeout: false })
    resetarMetricas()
    expect(obterMetricasAgente('agente-z')).toBeUndefined()
    expect(listarMetricasAgentes().length).toBe(0)
  })
})
