import { dglog } from './dglog'

// Boot de saude das IAs (Fase 2): garante Ollama vivo no boot e loga o estado
export async function bootSaudeIAs(): Promise<{ ollama: boolean; modelos: number }> {
  const { ensureOllama } = await import('./ollama-keeper')
  const ok = await ensureOllama()
  let modelos = 0
  if (ok) {
    try {
      const { getBrain } = await import('./brain/module')
      const status = await getBrain().getOllamaStatus()
      modelos = status.models.length
    } catch { /* ignora */ }
  }
  dglog('[boot-saude] Ollama: ' + (ok ? 'no ar' : 'INDISPONIVEL') + ' - modelos: ' + modelos)
  return { ollama: ok, modelos }
}
