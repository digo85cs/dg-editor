import { describe, expect, it } from 'vitest'
import {
  CATALOGO_PROVIDERS,
  configParaProvider,
  filaGlobal,
  listarProviders,
  obterProvider,
  providersPorTier,
  registrarProvider,
  removerProvider,
} from '../providers-registry'
import type { ProviderDescriptor } from '../providers-registry'

describe('providers-registry', () => {
  it('filaGlobal() retorna ordem estritamente crescente', () => {
    const fila = filaGlobal()
    for (let i = 1; i < fila.length; i++) {
      expect(fila[i].ordem).toBeGreaterThan(fila[i - 1].ordem)
    }
  })

  it('todos os providers tier 3 são formato ollama', () => {
    const tier3 = providersPorTier(3)
    expect(tier3.length).toBeGreaterThan(0)
    for (const p of tier3) {
      expect(p.formato).toBe('ollama')
    }
  })

  it('configParaProvider gera ProviderConfig válido com formato e baseUrl corretos', () => {
    const ollama = obterProvider('ollama-local')!
    const cfg = configParaProvider(ollama)
    expect(cfg.formato).toBe('ollama')
    expect(cfg.baseUrl).toBe('http://127.0.0.1:11434')
    expect(cfg.modelo).toBe('qwen2.5-coder:7b')
    expect(cfg.timeoutMs).toBe(120_000)
    expect(cfg.numPredict).toBe(4096)

    const groq = obterProvider('groq')!
    const cfgGroq = configParaProvider(groq)
    expect(cfgGroq.formato).toBe('openai')
    expect(cfgGroq.baseUrl).toBe('https://api.groq.com/openai/v1')
    expect(cfgGroq.apiKeyRef).toBe('groq')
  })

  it('registrarProvider e removerProvider funcionam e não afetam a fila estática', () => {
    const antes = [...CATALOGO_PROVIDERS].map((p) => p.id)
    const teste: ProviderDescriptor = {
      id: 'provider-teste-temporario',
      label: 'Teste',
      formato: 'openai',
      baseUrl: 'https://exemplo.test/v1',
      apiKeyRef: 'teste',
      timeoutMs: 10_000,
      numPredict: 100,
      tier: 1,
      ordem: 999,
      modelos: [{ id: 'modelo-teste', capacidades: ['chat'] }],
      ativo: true,
    }
    registrarProvider(teste)
    expect(obterProvider('provider-teste-temporario')).toBeDefined()
    expect(listarProviders().some((p) => p.id === 'provider-teste-temporario')).toBe(true)

    removerProvider('provider-teste-temporario')
    expect(obterProvider('provider-teste-temporario')).toBeUndefined()
    expect(listarProviders().some((p) => p.id === 'provider-teste-temporario')).toBe(false)

    const depois = CATALOGO_PROVIDERS.map((p) => p.id)
    expect(depois).toEqual(antes)
  })

  it('não há id duplicado em CATALOGO_PROVIDERS', () => {
    const ids = CATALOGO_PROVIDERS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('todo provider ativo tem preco definido ou esta listado explicitamente como "sem preco confirmado"', () => {
    // Lista explícita de providers ativos SEM preço confirmado (valores reais não disponíveis em fontes oficiais).
    // Qualquer provider ativo novo adicionado ao catálogo deve estar aqui OU ter preco definido.
    const semPrecoConfirmado = new Set([
      'groq',
      'together',
      'fireworks',
      'mistral',
      'deepinfra',
      'novita',
      'hyperbolic',
      'sambanova',
      'cerebras',
      'nvidia-nim',
      'perplexity',
      'xai',
      'moonshot-direto',
      'chutes',
      'arli',
      'litellm',
      'openai',
    ])

    for (const p of CATALOGO_PROVIDERS) {
      if (!p.ativo) continue
      const temPreco = !!p.preco
      const listadoSemPreco = semPrecoConfirmado.has(p.id)
      expect(temPreco || listadoSemPreco).toBe(true,
        'Provider ativo "' + p.id + '" deve ter preco definido ou estar na lista semPrecoConfirmado')
    }
  })

  it('providers pagos gemini-pago, deepseek, zai-pago tem preco definido com valores > 0', () => {
    for (const id of ['gemini-pago', 'deepseek', 'zai-pago']) {
      const p = obterProvider(id)
      expect(p).toBeDefined()
      expect(p!.preco).toBeDefined()
      expect(p!.preco!.entradaPor1M).toBeGreaterThan(0)
      expect(p!.preco!.saidaPor1M).toBeGreaterThan(0)
    }
  })

  it('todo provider tier 1 ativo tem cotaDiaria definida', () => {
    for (const p of CATALOGO_PROVIDERS) {
      if (p.tier === 1 && p.ativo) {
        expect(p.cotaDiaria).not.toBeUndefined()
        expect(typeof p.cotaDiaria).toBe('number')
      }
    }
  })
})
