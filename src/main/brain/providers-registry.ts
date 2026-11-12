/**
 * Registro dinâmico de provedores de IA (FASE 1).
 * Substitui arrays fixos por um catálogo mutável, preservando chamarProvider.
 * Identificadores técnicos em inglês; comentários/logs em pt-BR.
 */
import type { ProviderConfig } from './providers'

export type ProviderFormato = 'openai' | 'ollama' | 'cursor-cli' | 'codex-cli'

export interface ModeloCatalogo {
  id: string
  contexto?: number
  capacidades: string[]
  rotulo?: string
}

export interface ProviderDescriptor {
  id: string
  label: string
  formato: ProviderFormato
  baseUrl: string
  apiKeyRef: string
  apiKeyEnv?: string
  timeoutMs: number
  numPredict: number
  tier: number
  cotaDiaria?: number
  cotaTokensDia?: number
  rpm?: number
  fusoReset?: string
  ordem: number
  modelos: ModeloCatalogo[]
  preco?: { entradaPor1M: number; saidaPor1M: number }
  ativo: boolean
}

function desc(
  id: string,
  label: string,
  formato: ProviderFormato,
  baseUrl: string,
  opts: {
    apiKeyRef?: string
    apiKeyEnv?: string
    timeoutMs?: number
    numPredict?: number
    tier: number
    cotaDiaria?: number
    cotaTokensDia?: number
    rpm?: number
    fusoReset?: string
    ordem: number
    modelos: ModeloCatalogo[]
    preco?: { entradaPor1M: number; saidaPor1M: number }
    ativo?: boolean
  }
): ProviderDescriptor {
  const ref = opts.apiKeyRef ?? id
  const envAuto: Record<string, string> = {
    openrouter: 'OPENROUTER_API_KEY',
    gemini: 'GEMINI_API_KEY',
    groq: 'GROQ_API_KEY',
    together: 'TOGETHER_API_KEY',
    fireworks: 'FIREWORKS_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    deepinfra: 'DEEPINFRA_API_KEY',
    novita: 'NOVITA_API_KEY',
    hyperbolic: 'HYPERBOLIC_API_KEY',
    sambanova: 'SAMBANOVA_API_KEY',
    cerebras: 'CEREBRAS_API_KEY',
    nvidia: 'NVIDIA_API_KEY',
    perplexity: 'PERPLEXITY_API_KEY',
    xai: 'XAI_API_KEY',
    moonshot: 'MOONSHOT_API_KEY',
    chutes: 'CHUTES_API_KEY',
    arli: 'ARLI_API_KEY',
    openai: 'OPENAI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    zai: 'ZAI_API_KEY'
  }
  return {
    id,
    label,
    formato,
    baseUrl,
    apiKeyRef: ref,
    apiKeyEnv: opts.apiKeyEnv || envAuto[ref],
    timeoutMs: opts.timeoutMs ?? 120_000,
    numPredict: opts.numPredict ?? 4096,
    tier: opts.tier,
    cotaDiaria: opts.cotaDiaria,
    cotaTokensDia: opts.cotaTokensDia,
    rpm: opts.rpm,
    fusoReset: opts.fusoReset,
    ordem: opts.ordem,
    modelos: opts.modelos,
    preco: opts.preco,
    ativo: opts.ativo ?? true,
  }
}

const OPENROUTER = 'https://openrouter.ai/api/v1'

export const CATALOGO_PROVIDERS: ProviderDescriptor[] = [
  // ---------------- TIER 1 — gratuitos prioritários ----------------
  desc(
    'openrouter-inkling',
    'OpenRouter — Thinking Machines Inkling 2 Small (free)',
    'openai',
    OPENROUTER,
    {
      apiKeyRef: 'openrouter',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      tier: 1,
      cotaDiaria: 50,
      rpm: 20,
      ordem: 5,
      modelos: [
        { id: 'thinkingmachines/inkling-2-small:free', contexto: 1_000_000, capacidades: ['chat', 'codigo', 'analise'] },
      ],
      preco: { entradaPor1M: 0, saidaPor1M: 0 },
    }
  ),
  desc(
    'openrouter-glm',
    'OpenRouter — Z.AI GLM 4.5 Air (free)',
    'openai',
    OPENROUTER,
    {
      apiKeyRef: 'openrouter',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      tier: 1,
      cotaDiaria: 30,
      ordem: 6,
      modelos: [{ id: 'z-ai/glm-4.5-air:free', capacidades: ['chat', 'codigo', 'analise'] }],
      preco: { entradaPor1M: 0, saidaPor1M: 0 },
    }
  ),
  desc(
    'openrouter-north',
    'OpenRouter — Cohere North Mini Code (free)',
    'openai',
    OPENROUTER,
    {
      apiKeyRef: 'openrouter',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      tier: 1,
      cotaDiaria: 50,
      ordem: 7,
      modelos: [{ id: 'cohere/north-mini-code:free', contexto: 256_000, capacidades: ['codigo', 'analise'] }],
      preco: { entradaPor1M: 0, saidaPor1M: 0 },
    }
  ),
  desc(
    'openrouter-kimi',
    'OpenRouter — Moonshot Kimi K2.6 (free)',
    'openai',
    OPENROUTER,
    {
      apiKeyRef: 'openrouter',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      tier: 1,
      cotaDiaria: 30,
      ordem: 8,
      modelos: [{ id: 'moonshotai/kimi-k2.6:free', capacidades: ['chat', 'codigo', 'analise', 'raciocinio'] }],
      preco: { entradaPor1M: 0, saidaPor1M: 0 },
    }
  ),
  desc(
    'gemini-flash-lite',
    'Google Gemini Flash-Lite (OpenAI shim)',
    'openai',
    'https://generativelanguage.googleapis.com/v1beta/openai',
    {
      apiKeyRef: 'gemini',
      apiKeyEnv: 'GEMINI_API_KEY',
      tier: 1,
      cotaDiaria: 500,
      fusoReset: 'America/Los_Angeles',
      ordem: 10,
      modelos: [
        { id: 'gemini-3.5-flash-lite', capacidades: ['chat', 'codigo', 'analise'] },
        { id: 'gemini-3.1-flash-lite', capacidades: ['chat', 'codigo', 'analise'] },
      ],
      preco: { entradaPor1M: 0, saidaPor1M: 0 },
    }
  ),
  desc(
    'zai-direto',
    'Z.AI direto (GLM flash)',
    'openai',
    'https://api.z.ai/api/paas/v4',
    {
      apiKeyRef: 'zai',
      tier: 1,
      cotaDiaria: 100,
      ordem: 11,
      modelos: [
        { id: 'glm-4.7-flash', capacidades: ['chat', 'codigo', 'analise'] },
        { id: 'glm-4.5-flash', capacidades: ['chat', 'codigo', 'analise'] },
      ],
      preco: { entradaPor1M: 0, saidaPor1M: 0 },
    }
  ),
  desc(
    'groq',
    'Groq (OpenAI-compatible)',
    'openai',
    'https://api.groq.com/openai/v1',
    {
      apiKeyRef: 'groq',
      apiKeyEnv: 'GROQ_API_KEY',
      tier: 1,
      cotaDiaria: 1000,
      cotaTokensDia: 200_000,
      rpm: 30,
      ordem: 12,
      modelos: [
        { id: 'openai/gpt-oss-120b', capacidades: ['chat', 'codigo', 'analise', 'raciocinio'] },
        { id: 'openai/gpt-oss-20b', capacidades: ['chat', 'codigo', 'analise'] },
        { id: 'qwen/qwen3.8-27b', capacidades: ['chat', 'codigo', 'analise'] },
      ],
    }
  ),

  // ---------------- TIER 1 — regionais/exóticos ----------------
  desc('together', 'Together AI', 'openai', 'https://api.together.xyz/v1', {
    apiKeyRef: 'together', tier: 1, cotaDiaria: 40, ordem: 13,
    modelos: [{ id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', capacidades: ['chat', 'codigo', 'analise'] }],
  }),
  desc('fireworks', 'Fireworks AI', 'openai', 'https://api.fireworks.ai/inference/v1', {
    apiKeyRef: 'fireworks', tier: 1, cotaDiaria: 40, ordem: 14,
    modelos: [{ id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', capacidades: ['chat', 'codigo', 'analise'] }],
  }),
  desc('mistral', 'Mistral AI', 'openai', 'https://api.mistral.ai/v1', {
    apiKeyRef: 'mistral', tier: 1, cotaDiaria: 40, ordem: 15,
    modelos: [{ id: 'mistral-small-latest', capacidades: ['chat', 'codigo', 'analise'] }],
  }),
  desc('deepinfra', 'DeepInfra', 'openai', 'https://api.deepinfra.com/v1/openai', {
    apiKeyRef: 'deepinfra', tier: 1, cotaDiaria: 40, ordem: 16,
    modelos: [{ id: 'meta-llama/Llama-3.3-70B-Instruct', capacidades: ['chat', 'codigo', 'analise'] }],
  }),
  desc('novita', 'Novita AI', 'openai', 'https://api.novita.ai/v3/openai', {
    apiKeyRef: 'novita', tier: 1, cotaDiaria: 40, ordem: 17,
    modelos: [{ id: 'meta-llama/llama-3.3-70b-instruct', capacidades: ['chat', 'codigo', 'analise'] }],
  }),
  desc('hyperbolic', 'Hyperbolic', 'openai', 'https://api.hyperbolic.xyz/v1', {
    apiKeyRef: 'hyperbolic', tier: 1, cotaDiaria: 40, ordem: 18,
    modelos: [{ id: 'meta-llama/Llama-3.3-70B-Instruct', capacidades: ['chat', 'codigo', 'analise'] }],
  }),
  desc('sambanova', 'SambaNova', 'openai', 'https://api.sambanova.ai/v1', {
    apiKeyRef: 'sambanova', tier: 1, cotaDiaria: 40, ordem: 19,
    modelos: [{ id: 'Meta-Llama-3.3-70B-Instruct', capacidades: ['chat', 'codigo', 'analise'] }],
  }),
  desc('cerebras', 'Cerebras', 'openai', 'https://api.cerebras.ai/v1', {
    apiKeyRef: 'cerebras', tier: 1, cotaDiaria: 40, ordem: 20,
    modelos: [{ id: 'llama3.3-70b', capacidades: ['chat', 'codigo', 'analise'] }],
  }),
  desc('nvidia-nim', 'NVIDIA NIM', 'openai', 'https://integrate.api.nvidia.com/v1', {
    apiKeyRef: 'nvidia', tier: 1, cotaDiaria: 40, ordem: 21,
    modelos: [{ id: 'meta/llama-3.3-70b-instruct', capacidades: ['chat', 'codigo', 'analise'] }],
  }),
  desc('perplexity', 'Perplexity', 'openai', 'https://api.perplexity.ai', {
    apiKeyRef: 'perplexity', tier: 1, cotaDiaria: 40, ordem: 22,
    modelos: [{ id: 'sonar', capacidades: ['chat', 'analise'] }],
  }),
  desc('xai', 'x.AI', 'openai', 'https://api.x.ai/v1', {
    apiKeyRef: 'xai', tier: 1, cotaDiaria: 40, ordem: 23,
    modelos: [{ id: 'grok-3-mini', capacidades: ['chat', 'codigo', 'analise', 'raciocinio'] }],
  }),
  desc('moonshot-direto', 'Moonshot direto', 'openai', 'https://api.moonshot.ai/v1', {
    apiKeyRef: 'moonshot', tier: 1, cotaDiaria: 40, ordem: 24,
    modelos: [{ id: 'kimi-k2-0711-preview', capacidades: ['chat', 'codigo', 'analise', 'raciocinio'] }],
  }),
  desc('chutes', 'Chutes.ai', 'openai', 'https://llm.chutes.ai/v1', {
    apiKeyRef: 'chutes', tier: 1, cotaDiaria: 40, ordem: 25,
    modelos: [{ id: 'deepseek-ai/DeepSeek-V3', capacidades: ['chat', 'codigo', 'analise'] }],
  }),
  desc('arli', 'ArliAI', 'openai', 'https://api.arliai.com/v1', {
    apiKeyRef: 'arli', tier: 1, cotaDiaria: 40, ordem: 26,
    modelos: [{ id: 'llama-3.3-70b', capacidades: ['chat', 'codigo', 'analise'] }],
  }),
  desc('litellm', 'LiteLLM (gateway local opcional)', 'openai', 'http://127.0.0.1:4000/v1', {
    apiKeyRef: undefined, tier: 1, cotaDiaria: 0, ordem: 27, ativo: false,
    modelos: [{ id: 'gpt-3.5-turbo', capacidades: ['chat', 'codigo'] }],
  }),

  // ---------------- TIER 2 — qualidade paga (depois dos free; ordem >= 200) ----------------
  desc('openai', 'OpenAI', 'openai', 'https://api.openai.com/v1', {
    apiKeyRef: 'openai', apiKeyEnv: 'OPENAI_API_KEY', tier: 2, ordem: 200,
    preco: { entradaPor1M: 0.10, saidaPor1M: 0.50 }, // openai gpt-6-luna — fonte: https://platform.openai.com/docs/pricing — consulta 2026-11-10
    modelos: [{ id: 'gpt-6-luna', capacidades: ['chat', 'codigo', 'analise', 'raciocinio'] }],
  }),
  desc('deepseek', 'DeepSeek', 'openai', 'https://api.deepseek.com/v1', {
    apiKeyRef: 'deepseek', tier: 2, ordem: 201,
    preco: { entradaPor1M: 0.15, saidaPor1M: 0.60 }, // DeepSeek deepseek-flash cache miss — fonte: https://api-docs.deepseek.com/quick_start/pricing/ — consulta 2026-11-10 (valores off-peak; cache miss é o caso conservador)
    modelos: [{ id: 'deepseek-chat', capacidades: ['chat', 'codigo', 'analise', 'raciocinio'] }],
  }),
  desc('gemini-pago', 'Google Gemini (pago)', 'openai', 'https://generativelanguage.googleapis.com/v1beta/openai', {
    apiKeyRef: 'gemini', apiKeyEnv: 'GEMINI_API_KEY', tier: 2, ordem: 202,
    preco: { entradaPor1M: 0.75, saidaPor1M: 3.75 }, // Google Gemini 3.8-flash — fonte: https://aistudio.google.com/docs/pricing — consulta 2026-11-10 (pago até 31/12/2026; depois $1.50/$7.50)
    modelos: [{ id: 'gemini-3.8-flash', capacidades: ['chat', 'codigo', 'analise'] }],
  }),
  desc('zai-pago', 'Z.AI (pago)', 'openai', 'https://api.z.ai/api/paas/v4', {
    apiKeyRef: 'zai', tier: 2, ordem: 203,
    preco: { entradaPor1M: 1.40, saidaPor1M: 4.40 }, // Z.AI GLM-5.3 — fonte: https://docs.z.ai/guides/overview/pricing — consulta 2026-11-10
    modelos: [{ id: 'glm-5.3', capacidades: ['chat', 'codigo', 'analise'] }],
  }),

  // ---------------- LOCAL por ultimo (so se online/CLI falharem) ----------------
  desc(
    'ollama-local',
    'Ollama local',
    'ollama',
    'http://127.0.0.1:11434',
    {
      apiKeyRef: undefined,
      tier: 3,
      ordem: 99,
      modelos: [
        { id: 'qwen2.5-coder:7b', contexto: 8192, capacidades: ['chat', 'codigo', 'analise'] },
        { id: 'qwen2.5-coder:3b', contexto: 8192, capacidades: ['chat', 'codigo', 'analise'] },
        { id: 'qwen2.5-coder:1.5b', contexto: 8192, capacidades: ['chat', 'codigo', 'analise'] },
        { id: 'llama3.2', contexto: 4096, capacidades: ['chat', 'analise'] },
      ],
      preco: { entradaPor1M: 0, saidaPor1M: 0 },
    }
  ),
]

let registro: ProviderDescriptor[] = [...CATALOGO_PROVIDERS]

/** Cópia rasa do catálogo atual (padrão + registros dinâmicos). */
export function listarProviders(): ProviderDescriptor[] {
  return [...registro]
}

/** Obtém um descritor pelo id. */
export function obterProvider(id: string): ProviderDescriptor | undefined {
  return registro.find((p) => p.id === id)
}

/** Provedores de um tier específico, mantendo a ordem do registro. */
export function providersPorTier(tier: number): ProviderDescriptor[] {
  return registro.filter((p) => p.tier === tier)
}

/** Fila global ordenada por `ordem`, apenas ativos, sem duplicatas de id. */
export function filaGlobal(): ProviderDescriptor[] {
  const visto = new Set<string>()
  return registro
    .filter((p) => p.ativo)
    .sort((a, b) => a.ordem - b.ordem)
    .filter((p) => {
      if (visto.has(p.id)) return false
      visto.add(p.id)
      return true
    })
}

/** Registra ou substitui um descritor no catálogo em runtime. */
export function registrarProvider(p: ProviderDescriptor): void {
  registro = registro.filter((x) => x.id !== p.id)
  registro.push(p)
}

/** Remove um descritor do catálogo em runtime. */
export function removerProvider(id: string): void {
  registro = registro.filter((x) => x.id !== id)
}

/** Converte um ProviderDescriptor em ProviderConfig (reusa o tipo de providers.ts). */
export function configParaProvider(p: ProviderDescriptor, modelo?: string): ProviderConfig {
  const tipo =
    p.formato === 'ollama' ? 'local' : p.formato === 'cursor-cli' || p.formato === 'codex-cli' ? 'cli' : 'online'
  return {
    id: p.id,
    tipo,
    formato: p.formato,
    modelo: modelo || p.modelos[0]?.id || '',
    baseUrl: p.baseUrl,
    apiKeyRef: p.apiKeyRef,
    apiKeyEnv: p.apiKeyEnv,
    numPredict: p.numPredict,
    timeoutMs: p.timeoutMs,
  }
}
