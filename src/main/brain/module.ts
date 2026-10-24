/**
 * Fachada unica do brain — apenas Ollama local (offline-only).
 * Substitui a antiga pilha providers/router/policy.
 */
import {
  askOllama,
  getOllamaStatus,
  listModelos,
  ollamaPing
} from './ollama'
import type { BrainResponse, OllamaStatus } from '@shared/types'

export interface BrainModule {
  ask(prompt: string, context: string, preferido?: string, tarefa?: string): Promise<BrainResponse>
  getActiveProvider(): string
  getProviderStatuses(): Promise<{ name: string; available: boolean; models: number }[]>
  getOllamaStatus(): Promise<OllamaStatus>
  listActiveModels(): Promise<string[]>
}

const brain: BrainModule = {
  async ask(prompt, context, _preferido, tarefa) {
    return askOllama(prompt, context, tarefa || 'codigo')
  },
  getActiveProvider() {
    return 'ollama'
  },
  async getProviderStatuses() {
    const available = await ollamaPing()
    const models = available ? (await listModelos()).length : 0
    return [{ name: 'ollama', available, models }]
  },
  getOllamaStatus,
  listActiveModels: listModelos
}

export function getBrain(): BrainModule {
  return brain
}

export function __resetBrainForTests(): void {
  /* singleton estatico — nada a resetar */
}
