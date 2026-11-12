import { getAuthStore } from './auth'
import { getSystemProfile, profileStrength } from './profile'
import { getBrain } from './brain/module'
import { guardianSnapshot } from './guardian'
import type { AccountsState } from '@shared/types'
import { OWNER_EMAIL, OWNER_USERNAME } from '../shared/owner'

// Tela de Contas (Fase 2): estado consolidado de identidade, maquina, IA e guardiao
export async function getAccountsState(): Promise<AccountsState> {
  const auth = getAuthStore().getState()
  const profile = getSystemProfile()
  const brain = getBrain()
  const provedores = await brain.getProviderStatuses()
  const ollama = await brain.getOllamaStatus()

  return {
    identidade: {
      username: auth.user?.username || OWNER_USERNAME,
      email: auth.user?.email || OWNER_EMAIL,
      tokenPrefix: auth.session ? auth.session.token.slice(0, 8) : '—',
      criadoEm: auth.user ? auth.user.createdAt : 0
    },
    maquina: (() => {
      const cores = Array.isArray(profile.cpus) ? profile.cpus.length : Number(profile.cpus) || 0
      const total = Number(profile.totalMemory)
      const ramGB = Number.isFinite(total) && total > 0 ? (total / 1073741824).toFixed(1) : '?'
      const nivel = profileStrength(profile)
      const forca =
        nivel === 'strong' ? 'forte' : nivel === 'medium' ? 'média' : nivel === 'light' ? 'leve' : String(nivel || '—')
      return {
        hostname: profile.hostname || '—',
        plataforma: (profile.platform || '') + ' ' + (profile.arch || ''),
        cpus: cores,
        ramGB,
        forca
      }
    })(),
    ia: {
      ollamaInstalado: ollama.installed,
      ollamaRodando: ollama.reachable,
      modelos: ollama.models.map((m) => m.name),
      provedores
    },
    guardian: guardianSnapshot()
  }
}
