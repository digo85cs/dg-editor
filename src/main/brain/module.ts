import { getProviders, OllamaProvider, ApiProvider, MaestroProvider } from './index'
import type { BrainProvider, BrainResponse, OllamaStatus } from '@shared/types'

export interface BrainModule {
  ask(prompt: string, context: string, preferido?: string): Promise<BrainResponse>
  getActiveProvider(): string
  getProviderStatuses(): Promise<{ name: string; available: boolean; models: number }[]>
  getOllamaStatus(): Promise<OllamaStatus>
  listActiveModels(): Promise<string[]>
}

class BrainModuleImpl implements BrainModule {
  private providers: BrainProvider[]
  private ollama: OllamaProvider

  constructor() {
    this.ollama = new OllamaProvider()
    this.providers = [this.ollama, new ApiProvider(), new MaestroProvider()]
  }

  async ask(prompt: string, context: string, preferido?: string): Promise<BrainResponse> {
    // 1. se o roteador indicou um provedor, tenta ele primeiro
    if (preferido) {
      const escolhido = this.providers.find((p) => p.name === preferido)
      if (escolhido) {
        try {
          if (await escolhido.isAvailable()) {
            return await escolhido.ask(prompt, context)
          }
        } catch {
          // cai para a fila normal
        }
      }
    }
    // 2. fila normal (fallback)
    for (const p of this.providers) {
      try {
        if (await p.isAvailable()) {
          return await p.ask(prompt, context)
        }
      } catch {
        // Try next provider
      }
    }
    throw new Error('Nenhum provedor de IA disponivel')
  }
  getActiveProvider(): string {
    for (const p of this.providers) {
      // Synchronous hint based on env/config only
      if (p.name === 'ollama' && (process.env.DG_DEFAULT_PROVIDER === 'ollama')) return 'ollama'
      if (p.name === 'api' && !!process.env.LLM_API_KEY) return 'api'
    }
    return 'none'
  }

  async getProviderStatuses(): Promise<{ name: string; available: boolean; models: number }[]> {
    const out: { name: string; available: boolean; models: number }[] = []
    for (const p of this.providers) {
      const available = await p.isAvailable()
      const models = available ? (await p.listModels()).length : 0
      out.push({ name: p.name, available, models })
    }
    return out
  }

  async getOllamaStatus(): Promise<OllamaStatus> {
    return this.ollama.getStatus()
  }

  async listActiveModels(): Promise<string[]> {
    const out: string[] = []
    for (const p of this.providers) {
      try {
        if (await p.isAvailable()) {
          const models = await p.listModels()
          for (const m of models) out.push(m.name)
        }
      } catch {
        // ignore
      }
    }
    return out
  }
}

let singleton: BrainModuleImpl | null = null

export function getBrain(): BrainModule {
  if (!singleton) singleton = new BrainModuleImpl()
  return singleton
}

export function __resetBrainForTests(): void {
  singleton = null
}