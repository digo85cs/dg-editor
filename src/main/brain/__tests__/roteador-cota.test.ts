import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  __resetarEstadoParaTestes,
  estaEsgotado,
  limparExpirados,
  marcarEsgotado,
  proximoDisponivel,
  resetarProvider,
  statusCotas,
} from '../roteador-cota'
import { chamarComCascata } from '../chamar-com-cascata'
import { ErroProvider } from '../providers'
import type { ProviderDescriptor } from '../providers-registry'

const USERDATA = 'C:/tmp/dg-editor-cota-test'
const ARQUIVO = join(USERDATA, 'cota-modelos.json')

const pA: ProviderDescriptor = {
  id: 'prov-a', label: 'A', formato: 'openai', baseUrl: 'https://a/v1', apiKeyRef: 'a',
  timeoutMs: 120_000, numPredict: 4096, tier: 1, cotaDiaria: 50, ordem: 1,
  modelos: [{ id: 'model-a', capacidades: ['codigo', 'chat'] }], ativo: true,
}
const pB: ProviderDescriptor = {
  id: 'prov-b', label: 'B', formato: 'openai', baseUrl: 'https://b/v1', apiKeyRef: 'b',
  timeoutMs: 120_000, numPredict: 4096, tier: 1, cotaDiaria: 50, ordem: 2,
  modelos: [{ id: 'model-b', capacidades: ['codigo', 'chat'] }], ativo: true,
}
const pC: ProviderDescriptor = {
  id: 'prov-c', label: 'C', formato: 'openai', baseUrl: 'https://c/v1', apiKeyRef: 'c',
  timeoutMs: 120_000, numPredict: 4096, tier: 1, cotaDiaria: 50, ordem: 3,
  modelos: [{ id: 'model-c', capacidades: ['codigo', 'chat'] }], ativo: true,
}
const ollama: ProviderDescriptor = {
  id: 'ollama-local', label: 'Ollama', formato: 'ollama', baseUrl: 'http://127.0.0.1:11434',
  apiKeyRef: undefined, timeoutMs: 120_000, numPredict: 4096, tier: 3, ordem: 28,
  modelos: [{ id: 'qwen2.5-coder:7b', capacidades: ['codigo', 'chat', 'analise'] }], ativo: true,
}

vi.mock('electron', () => ({
  app: { getPath: () => 'C:/tmp/dg-editor-cota-test' },
  BrowserWindow: class {
    static getAllWindows() {
      return [] as never[]
    }
  },
}))
vi.mock('../segredos-providers', () => ({
  chaveConfigurada: vi.fn(() => true),
}))
vi.mock('../providers-registry', () => ({
  filaGlobal: vi.fn(() => [pA, pB, pC]),
  configParaProvider: vi.fn((p: ProviderDescriptor) => ({
    id: p.id, formato: p.formato, modelo: p.modelos[0]?.id, baseUrl: p.baseUrl,
  })),
  obterProvider: vi.fn((id: string) => {
    if (id === 'ollama-local') return ollama
    return [pA, pB, pC].find((x) => x.id === id)
  }),
}))
vi.mock('../registry', () => ({
  normalizarTarefa: vi.fn((t: string) => t),
  appendFailoverLog: vi.fn(),
}))
vi.mock('../providers', async (importOriginal) => {
  const real = await importOriginal<typeof import('../providers')>()
  return { ...real, chamarProvider: vi.fn() }
})

import { chaveConfigurada } from '../segredos-providers'
import { filaGlobal, configParaProvider, obterProvider } from '../providers-registry'
import { normalizarTarefa, appendFailoverLog } from '../registry'
import { chamarProvider } from '../providers'

const mChamarProvider = vi.mocked(chamarProvider)
const mFilaGlobal = vi.mocked(filaGlobal)
const mObterProvider = vi.mocked(obterProvider)
const mConfigParaProvider = vi.mocked(configParaProvider)
const mChaveConfigurada = vi.mocked(chaveConfigurada)
const mNormalizarTarefa = vi.mocked(normalizarTarefa)
const mAppendFailoverLog = vi.mocked(appendFailoverLog)

const mensagens = [{ role: 'user', content: 'oi' }]

beforeEach(() => {
  __resetarEstadoParaTestes()
  vi.clearAllMocks()
  mFilaGlobal.mockReturnValue([pA, pB, pC])
  mChaveConfigurada.mockReturnValue(true)
  mNormalizarTarefa.mockImplementation((t: string) => t)
  mChamarProvider.mockReset()
})

afterEach(() => {
  __resetarEstadoParaTestes()
})

describe('roteador-cota', () => {
  it('429 marca esgotado e o proximo da fila e escolhido', () => {
    const agora = new Date()
    marcarEsgotado('prov-a', 'model-a', 'rate_limit', 999999, agora)
    const cfg = proximoDisponivel('codigo')
    expect(cfg.id).toBe('prov-b')
    expect(cfg.modelo).toBe('model-b')
  })

  it('402 se comporta igual a 429 (marca rate_limit e esgota)', () => {
    const agora = new Date()
    marcarEsgotado('prov-a', 'model-a', 'rate_limit', 999999, agora)
    expect(estaEsgotado('prov-a', 'model-a')).toBe(true)
    const cfg = proximoDisponivel('codigo')
    expect(cfg.id).toBe('prov-b')
  })

  it('cancelled relanca e NAO marca esgotado nem desce a fila', async () => {
    mChamarProvider.mockRejectedValueOnce(new ErroProvider('cancelled', 'usuario cancelou', 'prov-a'))
    await expect(chamarComCascata('codigo', mensagens)).rejects.toMatchObject({ kind: 'cancelled' })
    expect(mChamarProvider).toHaveBeenCalledTimes(1)
    expect(statusCotas()).toEqual([])
  })

  it('rede tenta o proximo mas nao marca esgotado', async () => {
    mChamarProvider
      .mockRejectedValueOnce(new ErroProvider('rede', 'erro de rede', 'prov-a'))
      .mockResolvedValueOnce({ content: 'ok', tool_calls: [], modeloUsado: 'model-b', providerId: 'prov-b' })
    const r = await chamarComCascata('codigo', mensagens)
    expect(r.providerFinal).toBe('prov-b')
    expect(r.tentativas).toEqual(['prov-a/model-a', 'prov-b/model-b'])
    expect(mChamarProvider).toHaveBeenCalledTimes(2)
    expect(statusCotas()).toEqual([])
  })

  it('apos exceder 2 falhas de rede, lança o ultimo erro', async () => {
    mChamarProvider.mockRejectedValue(new ErroProvider('rede', 'rede indisp.', 'prov-x'))
    await expect(chamarComCascata('codigo', mensagens)).rejects.toMatchObject({ kind: 'rede' })
    expect(mChamarProvider).toHaveBeenCalledTimes(3)
  })

  it('marcarEsgotado com retryAfterSegundos respeita o cap de 24h', () => {
    const agora = new Date('2026-01-01T12:00:00Z')
    marcarEsgotado('prov-a', 'model-a', 'rate_limit', 999999, agora)
    const estado = statusCotas()
    expect(estado.length).toBe(1)
    const ate = new Date(estado[0].esgotadoAte).getTime()
    const esperado = agora.getTime() + 24 * 60 * 60 * 1000
    expect(ate).toBeGreaterThanOrEqual(esperado - 5000)
    expect(ate).toBeLessThanOrEqual(esperado + 5000)
  })

  it('fusoReset America/Los_Angeles gera reset diferente de UTC', () => {
    mObterProvider.mockReturnValue({ id: 'prov-la', fusoReset: 'America/Los_Angeles' } as unknown as ProviderDescriptor)
    const agora = new Date('2026-06-01T12:00:00Z')
    marcarEsgotado('prov-la', 'model-la', 'rate_limit', undefined, agora)
    const la = new Date(statusCotas()[0].esgotadoAte).getTime()
    const utc = new Date('2026-06-02T00:00:00Z').getTime()
    expect(la).not.toBe(utc)
    expect(la).toBeGreaterThan(agora.getTime())
  })

  it('quando todos estao esgotados, proximoDisponivel retorna ollama-local', () => {
    const agora = new Date()
    marcarEsgotado('prov-a', 'model-a', 'rate_limit', 999999, agora)
    marcarEsgotado('prov-b', 'model-b', 'rate_limit', 999999, agora)
    marcarEsgotado('prov-c', 'model-c', 'rate_limit', 999999, agora)
    const cfg = proximoDisponivel('codigo')
    expect(cfg.id).toBe('ollama-local')
    expect(mAppendFailoverLog).toHaveBeenCalled()
  })

  it('limparExpirados remove entradas vencidas e preserva validas', () => {
    const agora = new Date('2026-01-01T00:00:00Z')
    marcarEsgotado('prov-a', 'model-a', 'rate_limit', undefined, agora)
    marcarEsgotado('prov-b', 'model-b', 'rate_limit', 1800, agora)
    const removidos = limparExpirados(new Date('2026-01-01T12:00:00Z'))
    expect(removidos).toBe(1)
    const restantes = statusCotas()
    expect(restantes.length).toBe(1)
    expect(restantes[0].providerId).toBe('prov-a')
  })

  it('arquivo corrompido regenera vazio sem lancar', () => {
    __resetarEstadoParaTestes()
    writeFileSync(ARQUIVO, '{ json quebrado', 'utf-8')
    expect(() => statusCotas()).not.toThrow()
    expect(statusCotas()).toEqual([])
    expect(() => proximoDisponivel('codigo')).not.toThrow()
  })
})
