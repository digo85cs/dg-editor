import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

function baseDir() {
  const dir = join(app.getPath('userData'))
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function onboardingPath() {
  return join(baseDir(), 'onboarding.json')
}

function perfilTemContasOuIas(): boolean {
  try {
    const { listarChavesConfiguradas } = require('../brain/segredos-providers') as {
      listarChavesConfiguradas: () => string[]
    }
    if (listarChavesConfiguradas().length > 0) return true
  } catch {
    /* cofre ainda nao pronto */
  }
  try {
    if (existsSync(join(baseDir(), 'providers-keys.bin'))) return true
  } catch {
    /* */
  }
  try {
    const auth = join(baseDir(), 'auth')
    if (existsSync(auth)) {
      const { readdirSync } = require('fs') as typeof import('fs')
      if (readdirSync(auth).length > 0) return true
    }
  } catch {
    /* */
  }
  return false
}

export function statusOnboarding() {
  try {
    // Adapta modelos/timeouts ao hardware neste boot
    try {
      const { garantirHardwareProfile } = require('../hardware-profile') as {
        garantirHardwareProfile: (f?: boolean) => unknown
      }
      garantirHardwareProfile(false)
    } catch {
      /* opcional */
    }

    const p = onboardingPath()
    const temPerfil = perfilTemContasOuIas()
    if (!existsSync(p)) {
      const dirs = ['auth', 'config', 'chats', 'projects', 'dossie', 'navegador']
      for (const d of dirs) {
        try {
          mkdirSync(join(baseDir(), d), { recursive: true })
        } catch {
          /* */
        }
      }
      // Perfil ja existente (migracao de outro PC / update): nao forca wizard
      if (temPerfil) {
        const data = {
          completed: true,
          migradoPerfil: true,
          concluidoEm: new Date().toISOString(),
          version: '1.1'
        }
        writeFileSync(p, JSON.stringify(data, null, 2), 'utf8')
        return { primeiroAcesso: false, ...data, completed: true, temContasOuIas: true }
      }
      writeFileSync(
        p,
        JSON.stringify({ completed: false, criadoEm: new Date().toISOString(), version: '1.1' }, null, 2),
        'utf8'
      )
      return { primeiroAcesso: true, completed: false, temContasOuIas: false }
    }
    const data = JSON.parse(readFileSync(p, 'utf8'))
    const completed = !!data.completed || temPerfil
    if (temPerfil && !data.completed) {
      try {
        writeFileSync(
          p,
          JSON.stringify(
            { ...data, completed: true, preservadoPerfil: true, concluidoEm: new Date().toISOString() },
            null,
            2
          ),
          'utf8'
        )
      } catch {
        /* */
      }
    }
    return {
      ...data,
      primeiroAcesso: !completed,
      completed,
      temContasOuIas: temPerfil
    }
  } catch {
    return { primeiroAcesso: true, completed: false, temContasOuIas: false }
  }
}

export function concluirOnboarding() {
  try {
    const p = onboardingPath()
    try {
      const { garantirHardwareProfile } = require('../hardware-profile') as {
        garantirHardwareProfile: (f?: boolean) => unknown
      }
      garantirHardwareProfile(true)
    } catch {
      /* */
    }
    writeFileSync(
      p,
      JSON.stringify({ completed: true, concluidoEm: new Date().toISOString(), version: '1.1' }, null, 2),
      'utf8'
    )
    return { ok: true }
  } catch (e: any) {
    return { ok: false, erro: String(e?.message || e) }
  }
}

export function resetarOnboarding() {
  try {
    const p = onboardingPath()
    writeFileSync(
      p,
      JSON.stringify({ completed: false, resetadoEm: new Date().toISOString(), version: '1.1' }, null, 2),
      'utf8'
    )
    return { ok: true }
  } catch (e: any) {
    return { ok: false, erro: String(e?.message || e) }
  }
}
