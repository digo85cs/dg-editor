/**
 * Sincroniza chaves de API do ambiente para o cofre.
 */
import { listarProviders } from './providers-registry'
import { chaveConfigurada, salvarChave, lerChave } from './segredos-providers'
import { envParaProvider } from './provider-env-map'
import { dglog } from '../dglog'

export { ENV_POR_REF, envParaProvider } from './provider-env-map'

export function sincronizarChavesDoAmbiente(): { ok: boolean; gravadas: string[]; jaTinham: string[]; semEnv: string[] } {
  const gravadas: string[] = []
  const jaTinham: string[] = []
  const semEnv: string[] = []
  for (const p of listarProviders()) {
    if (p.id === 'ollama-local' || p.formato === 'ollama') {
      jaTinham.push(p.id)
      continue
    }
    if (chaveConfigurada(p.id)) {
      jaTinham.push(p.id)
      continue
    }
    const ref = p.apiKeyRef || p.id
    const fromEnv =
      (p.apiKeyEnv ? String(process.env[p.apiKeyEnv] || '').trim() : '') ||
      envParaProvider(ref) ||
      envParaProvider(p.id)
    const refCheck = p.apiKeyRef || p.id
    const stubOr =
      (refCheck === 'openrouter' || String(refCheck).startsWith('openrouter')) &&
      (fromEnv || '').length < 40
    if (!fromEnv || fromEnv.length < 8 || stubOr) {
      semEnv.push(p.id)
      continue
    }
    const alvo = p.apiKeyRef || p.id
    if (lerChave(alvo)) {
      jaTinham.push(p.id)
      continue
    }
    const r = salvarChave(alvo, fromEnv)
    if (r.ok) {
      gravadas.push(p.id)
      dglog('[providers-sync] chave do ambiente → cofre: ' + alvo + ' (via ' + p.id + ')')
    } else semEnv.push(p.id)
  }
  return { ok: true, gravadas, jaTinham, semEnv }
}
