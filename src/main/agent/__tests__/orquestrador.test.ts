import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../brain/agent', () => ({
  executarAgente: vi.fn()
}))

vi.mock('../../brain/agentes', () => ({
  listarAgentes: vi.fn(() => [
    { id: 'dg-engenheiro', nome: 'DG Engenheiro', especialidade: 'teste', skills: [], arquivo: '' },
    { id: 'revisor', nome: 'Revisor', especialidade: 'teste', skills: [], arquivo: '' }
  ])
}))

vi.mock('../../dglog', () => ({
  dglog: vi.fn()
}))

import { orquestrarAgentes } from '../orquestrador'
import { executarAgente } from '../../brain/agent'
import { resetarMetricas } from '../../metrics'

const mockExecutarAgente = vi.mocked(executarAgente)

describe('orquestrarAgentes', () => {
  beforeEach(() => {
    resetarMetricas()
    vi.clearAllMocks()
  })

  it('deve pular agente que falha e seguir para o proximo', async () => {
    // Primeiro agente: rejeita com erro de timeout (simula travamento)
    mockExecutarAgente.mockRejectedValueOnce(new Error('timeout: 30s'))

    // Segundo agente: responde rapidamente
    mockExecutarAgente.mockResolvedValueOnce({
      ok: true,
      texto: 'resultado do agente rapido',
      modelo: 'test-model',
      passos: [],
      duracaoMs: 500
    })

    const resultado = await orquestrarAgentes(
      '/tmp/test',
      'fazer algo',
      ['dg-engenheiro', 'revisor']
    )

    expect(mockExecutarAgente).toHaveBeenCalledTimes(2)
    expect(resultado.passos.length).toBe(2)
    expect(resultado.passos[0].agente).toBe('dg-engenheiro')
    expect(resultado.passos[0].ok).toBe(false)
    expect(resultado.passos[0].erro).toContain('timeout')
    expect(resultado.passos[1].agente).toBe('revisor')
    expect(resultado.passos[1].ok).toBe(true)
    expect(resultado.textoFinal).toBe('resultado do agente rapido')
  })

  it('deve continuar mesmo quando todos os agentes falham', async () => {
    mockExecutarAgente.mockRejectedValue(new Error('timeout: 30s'))

    const resultado = await orquestrarAgentes(
      '/tmp/test',
      'fazer algo',
      ['dg-engenheiro', 'revisor']
    )

    expect(mockExecutarAgente).toHaveBeenCalledTimes(2)
    expect(resultado.passos.length).toBe(2)
    expect(resultado.passos.every((p) => !p.ok)).toBe(true)
    expect(resultado.textoFinal).toBe('')
  })

  it('deve usar fila padrao quando nao fornecida', async () => {
    mockExecutarAgente.mockResolvedValueOnce({
      ok: true,
      texto: 'ok',
      duracaoMs: 100
    })

    await orquestrarAgentes('/tmp/test', 'fazer algo', undefined, undefined, {
      pararNoPrimeiroSucesso: true
    })

    expect(mockExecutarAgente).toHaveBeenCalledTimes(1)
    const opts = mockExecutarAgente.mock.calls[0][2]
    expect(opts.agente).toBe('dg-engenheiro')
  })
})
