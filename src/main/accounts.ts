import { getAuthStore } from './auth'
import { getSystemProfile, profileStrength } from './profile'
import { getBrain } from './brain/module'
import { guardianSnapshot } from './guardian'
import type { AccountsState } from '@shared/types'

// Tela de Contas (Fase 2): estado consolidado de identidade, maquina, IA e guardiao
export async function getAccountsState(): Promise<AccountsState> {
  const auth = getAuthStore().getState()
  const profile = getSystemProfile()
  const brain = getBrain()
  const provedores = await brain.getProviderStatuses()
  const ollama = await brain.getOllamaStatus()

  return {
    identidade: {
      tokenPrefix: auth.session ? auth.session.token.slice(0, 8) : '—',
      criadoEm: auth.user ? auth.user.createdAt : 0
    },
    maquina: {
      hostname: profile.hostname,
      plataforma: profile.platform + ' ' + profile.arch,
      cpus: profile.cpus.length,
      ramGB: (profile.totalMemory / 1073741824).toFixed(1),
      forca: profileStrength(profile)
    },
    ia: {
      ollamaInstalado: ollama.installed,
      ollamaRodando: ollama.reachable,
      modelos: ollama.models.map((m) => m.name),
      provedores
    },
    guardian: guardianSnapshot()
  }
}
