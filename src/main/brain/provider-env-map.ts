/** Mapa de refs de provedor → variáveis de ambiente aceitas. */
export const ENV_POR_REF: Record<string, string[]> = {
  openrouter: ['OPENROUTER_API_KEY', 'OPENROUTER_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  groq: ['GROQ_API_KEY'],
  together: ['TOGETHER_API_KEY', 'TOGETHERAI_API_KEY'],
  fireworks: ['FIREWORKS_API_KEY', 'FIREWORKS_AI_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  deepinfra: ['DEEPINFRA_API_KEY'],
  novita: ['NOVITA_API_KEY'],
  hyperbolic: ['HYPERBOLIC_API_KEY'],
  sambanova: ['SAMBANOVA_API_KEY'],
  cerebras: ['CEREBRAS_API_KEY'],
  nvidia: ['NVIDIA_API_KEY', 'NGC_API_KEY'],
  perplexity: ['PERPLEXITY_API_KEY'],
  xai: ['XAI_API_KEY', 'GROK_API_KEY'],
  moonshot: ['MOONSHOT_API_KEY', 'KIMI_API_KEY'],
  chutes: ['CHUTES_API_KEY'],
  arli: ['ARLI_API_KEY', 'ARLIAI_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  zai: ['ZAI_API_KEY', 'Z_AI_API_KEY'],
}

/** OpenRouter real: sk-or-v1-… com comprimento típico ≥ 40 (stubs de 18 chars são rejeitados). */
export function chaveOpenRouterPareceValida(chave: string | null | undefined): boolean {
  if (!chave || typeof chave !== 'string') return false
  const t = chave.trim()
  if (t.length < 40) return false
  return /^sk-or-v1-[A-Za-z0-9_\-]+$/.test(t)
}

export function envParaProvider(idOuRef: string): string | null {
  const nomes = ENV_POR_REF[idOuRef] || [idOuRef.toUpperCase().replace(/-/g, '_') + '_API_KEY']
  const isOr = idOuRef === 'openrouter' || idOuRef.startsWith('openrouter')
  for (const n of nomes) {
    const v = process.env[n]
    if (typeof v !== 'string' || !v.trim()) continue
    const t = v.trim()
    if (isOr || n.startsWith('OPENROUTER')) {
      if (!chaveOpenRouterPareceValida(t)) continue
    } else if (t.length < 8) {
      continue
    }
    return t
  }
  return null
}
