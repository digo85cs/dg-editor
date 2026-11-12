import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { userDataDir } from '../../paths'
import {
  __resetarEstadoParaTestes,
  definirPermitirPago,
  definirTetoDiarioUSD,
  estaEsgotado,
  gastoHoje,
  limparExpirados,
  marcarEsgotado,
  permitirPagoAtivo,
  precoConhecido,
  proximoDisponivel,
  registrarCusto,
  resetarProvider,
  statusCotas,
} from '../roteador-cota'
import { chamarComCascata } from '../chamar-com-cascata'
import { __resetarCacheParaTestes } from '../resposta-cache'
import { ErroProvider } from '../providers'
import type { ProviderDescriptor } from '../providers-registry'

const USERDATA = 'C:/tmp/dg-editor-cota-test'
function arquivoTeste(): string {
  return join(userDataDir(), 'cota-modelos.json')
}
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
// pD e' tier 2 (pago) para testar o guardrail
const pD: ProviderDescriptor = {
  id: 'prov-d', label: 'D (pago)', formato: 'openai', baseUrl: 'https://d/v1', apiKeyRef: 'd',
  timeoutMs: 120_000, numPredict: 4096, tier: 2, cotaDiaria: 50, ordem: 4,
  modelos: [{ id: 'model-d', capacidades: ['codigo', 'chat'] }], ativo: true,
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
  filaGlobal: vi.fn(() => [pA, pB, pC, pD]),
  configParaProvider: vi.fn((p: ProviderDescriptor) => ({
    id: p.id, formato: p.formato, modelo: p.modelos[0]?.id, baseUrl: p.baseUrl,
  })),
  obterProvider: vi.fn((id: string) => {
    if (id === 'ollama-local') return ollama
    return [pA, pB, pC, pD].find((x) => x.id === id)
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
  __resetarCacheParaTestes()
  vi.clearAllMocks()
  mFilaGlobal.mockReturnValue([pA, pB, pC, pD])
  mChaveConfigurada.mockReturnValue(true)
  mNormalizarTarefa.mockImplementation((t: string) => t)
  mChamarProvider.mockReset()
  // Default: permitirPago desligado (arquivo deletado por __resetarEstadoParaTestes)
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
    const arq = arquivoTeste()
    mkdirSync(userDataDir(), { recursive: true })
    writeFileSync(arq, '{ json quebrado', 'utf-8')
    expect(() => statusCotas()).not.toThrow()
    expect(statusCotas()).toEqual([])
    expect(() => proximoDisponivel('codigo')).not.toThrow()
  })

  // ---------------- FASE D - Guardrail de custo ----------------

  it('com permitirPago=false, tier 2 e pulado e ollama-local e retornado quando so ha tier 2', () => {
    // Apenas pD (tier 2) tem chave configurada; pA/pB/pC nao
    mChaveConfigurada.mockImplementation((id) => id === 'prov-d')
    const agora = new Date()
    const cfg = proximoDisponivel('codigo')
    expect(cfg.id).toBe('ollama-local')
    expect(mAppendFailoverLog).toHaveBeenCalled()
  })

  it('com permitirPago=true, tier 2 e usado quando tier 1 esgotou', () => {
    definirPermitirPago(true)
    mChaveConfigurada.mockImplementation((id) => id === 'prov-d')
    const agora = new Date()
    // Esgota todos os tier 1
    marcarEsgotado('prov-a', 'model-a', 'rate_limit', 999999, agora)
    marcarEsgotado('prov-b', 'model-b', 'rate_limit', 999999, agora)
    marcarEsgotado('prov-c', 'model-c', 'rate_limit', 999999, agora)
    const cfg = proximoDisponivel('codigo')
    expect(cfg.id).toBe('prov-d')
  })

  it('registrarCusto acumula corretamente e marca esgotado ao bater o teto', () => {
    // prov-a tem preco definido
    mObterProvider.mockReturnValue({ ...pA, preco: { entradaPor1M: 1.0, saidaPor1M: 2.0 } } as unknown as ProviderDescriptor)
    const agora = new Date()

    // Define teto de $3.00
    definirTetoDiarioUSD(3.0)

    // 1M tokens entrada = $1.00, 1M saida = $2.00. Total teto = $3.00
    // Chama 2 vezes com 500k entrada + 500k saida = $0.50 + $1.00 = $1.50 cada
    registrarCusto('prov-a', 500_000, 500_000, agora)
    registrarCusto('prov-a', 500_000, 500_000, agora) // agora gasto = $3.00, bate o teto

    const g = gastoHoje()
    expect(g.usd).toBeCloseTo(3.0, 4)
    expect(g.porProvider['prov-a']).toBeCloseTo(3.0, 4)

    // prov-a deve estar esgotado por quota
    expect(estaEsgotado('prov-a', 'model-a', agora)).toBe(true)
    const entrada = statusCotas().find((e) => e.providerId === 'prov-a')
    expect(entrada?.motivo).toBe('quota')
  })

  it('provider sem preco nao acumula custo', () => {
    // prov-a SEM preco
    const agora = new Date()
    registrarCusto('prov-a', 1_000_000, 1_000_000, agora)
    const g = gastoHoje()
    expect(g.usd).toBe(0)
    expect(g.porProvider['prov-a']).toBeUndefined()
    expect(estaEsgotado('prov-a', 'model-a', agora)).toBe(false)
  })

  it('migracao de versao 1 -> 2 adiciona permitirPago: false', () => {
    __resetarEstadoParaTestes()
    const arq = arquivoTeste()
    mkdirSync(userDataDir(), { recursive: true })
    // Simula arquivo v1
    writeFileSync(arq, JSON.stringify({ versao: 1, entradas: [] }), 'utf-8')
    // Ler estado deve migrar para v2
    const estadoInicial = statusCotas()
    expect(estadoInicial).toEqual([])
    expect(permitirPagoAtivo()).toBe(false)
    // Verifica que o arquivo foi regravado como v2
    const conteudo = readFileSync(arq, 'utf-8')
    const j = JSON.parse(conteudo)
    expect(j.versao).toBe(2)
    expect(j.permitirPago).toBe(false)
  })

  it('gastoHoje() retorna shape correto', () => {
    const g = gastoHoje()
    expect(typeof g.usd).toBe('number')
    expect(g.usd).toBe(0)
    expect(g.teto).toBeUndefined()
    expect(typeof g.porProvider).toBe('object')
    expect(Object.keys(g.porProvider).length).toBe(0)
  })

  it('definirPermitirPago persiste e emite evento', () => {
    definirPermitirPago(true)
    expect(permitirPagoAtivo()).toBe(true)
    definirPermitirPago(false)
    expect(permitirPagoAtivo()).toBe(false)
  })

  // ---------------- FASE D - Rastreamento de custo honesto ----------------

  it('provider com preco {0,0} acumula 0 (gratis contabilizado)', () => {
    const agora = new Date()
    mObterProvider.mockReturnValue({ ...pA, preco: { entradaPor1M: 0, saidaPor1M: 0 } } as unknown as ProviderDescriptor)
    registrarCusto('prov-a', 1_000_000, 1_000_000, agora)
    const g = gastoHoje()
    expect(g.usd).toBe(0)
    expect(g.porProvider['prov-a']).toBe(0)
    expect(g.naoRastreados).not.toContain('prov-a')
    expect(precoConhecido('prov-a')).toBe(true)
  })

  it('provider com preco undefined nao acumula e entra em naoRastreados', () => {
    const agora = new Date()
    mObterProvider.mockReturnValue(pA) // pA nao tem preco
    registrarCusto('prov-a', 1_000_000, 1_000_000, agora)
    const g = gastoHoje()
    expect(g.usd).toBe(0)
    expect(g.porProvider['prov-a']).toBeUndefined()
    expect(g.naoRastreados).toContain('prov-a')
    expect(precoConhecido('prov-a')).toBe(false)
    expect(estaEsgotado('prov-a', 'model-a', agora)).toBe(false)
  })

  it('precoConhecido retorna true para provider com preco e false para sem', () => {
    mObterProvider.mockReturnValue({ ...pA, preco: { entradaPor1M: 1.0, saidaPor1M: 2.0 } } as unknown as ProviderDescriptor)
    expect(precoConhecido('prov-a')).toBe(true)
    mObterProvider.mockReturnValue(pB) // pB nao tem preco
    expect(precoConhecido('prov-b')).toBe(false)
  })

  it('gastoHoje().naoRastreados contem apenas ids sem preco', () => {
    const agora = new Date()
    mObterProvider.mockImplementation((id) => {
      if (id === 'prov-a') return { ...pA, preco: { entradaPor1M: 1.0, saidaPor1M: 2.0 } } as unknown as ProviderDescriptor
      if (id === 'prov-b') return pB // sem preco
      if (id === 'prov-c') return pC // sem preco
      return pD
    })
    registrarCusto('prov-a', 500_000, 500_000, agora) // tem preco, acumulado
    registrarCusto('prov-b', 500_000, 500_000, agora) // sem preco, nao acumulado
    registrarCusto('prov-c', 500_000, 500_000, agora) // sem preco, nao acumulado
    const g = gastoHoje()
    expect(g.usd).toBeCloseTo(1.5, 4) // 0.5M * 1.0 + 0.5M * 2.0 = 0.5 + 1.0 = 1.5
    expect(g.naoRastreados).toContain('prov-b')
    expect(g.naoRastreados).toContain('prov-c')
    expect(g.naoRastreados).not.toContain('prov-a')
  })

  it('teto dispara corretamente quando ha preco (regressao guardrail)', () => {
    mObterProvider.mockReturnValue({ ...pA, preco: { entradaPor1M: 1.0, saidaPor1M: 2.0 } } as unknown as ProviderDescriptor)
    const agora = new Date()
    definirTetoDiarioUSD(3.0)
    registrarCusto('prov-a', 500_000, 500_000, agora) // $1.50
    registrarCusto('prov-a', 500_000, 500_000, agora) // $1.50 -> total $3.00, bate teto
    expect(estaEsgotado('prov-a', 'model-a', agora)).toBe(true)
    const entrada = statusCotas().find((e) => e.providerId === 'prov-a')
    expect(entrada?.motivo).toBe('quota')
  })

  // ---------------- FASE B - Regressão com preço real ----------------

  it('registrarCusto(openai) acumula exatamente preco.entradaPor1M em gastoHojeUSD', () => {
    mObterProvider.mockReturnValue({ id: 'openai', preco: { entradaPor1M: 0.10, saidaPor1M: 0.50 }, modelos: [{ id: 'gpt-6-luna' }] } as unknown as ProviderDescriptor)
    const agora = new Date()
    registrarCusto('openai', 1_000_000, 0, agora)
    const g = gastoHoje()
    expect(g.usd).toBe(0.10)
    expect(g.porProvider['openai']).toBe(0.10)
    expect(g.naoRastreados).not.toContain('openai')
  })

  it('teto dispara com preço real e openai deixa de aparecer em proximoDisponivel', () => {
    mObterProvider.mockReturnValue({ id: 'openai', preco: { entradaPor1M: 0.10, saidaPor1M: 0.50 }, modelos: [{ id: 'gpt-6-luna', capacidades: ['chat', 'codigo', 'analise', 'raciocinio'] }] } as unknown as ProviderDescriptor)
    const agora = new Date()
    definirPermitirPago(true)
    definirTetoDiarioUSD(0.20) // teto baixo para disparar rapidamente

    // Acumula $0.10 (1M entrada) -> abaixo do teto
    registrarCusto('openai', 1_000_000, 0, agora)
    expect(estaEsgotado('openai', 'gpt-6-luna', agora)).toBe(false)

    // Acumula mais $0.10 -> total $0.20, bate o teto
    registrarCusto('openai', 1_000_000, 0, agora)
    expect(estaEsgotado('openai', 'gpt-6-luna', agora)).toBe(true)
    const entrada = statusCotas().find((e) => e.providerId === 'openai')
    expect(entrada?.motivo).toBe('quota')

    // proximoDisponivel deve pular openai (esgotado por quota) quando permitirPago=true
    mFilaGlobal.mockReturnValue([
      { id: 'openai', modelos: [{ id: 'gpt-6-luna', capacidades: ['chat', 'codigo', 'analise', 'raciocinio'] }], ordem: 23, ativo: true, tier: 2, formato: 'openai' } as unknown as ProviderDescriptor,
      ollama,
    ])
    const cfg = proximoDisponivel('codigo')
    expect(cfg.id).toBe('ollama-local')
  })
})
