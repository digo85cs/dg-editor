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

export function statusOnboarding() {
  try {
    const p = onboardingPath()
    if (!existsSync(p)) {
      const dirs = ['auth', 'config', 'chats', 'projects', 'dossie', 'navegador']
      for (const d of dirs) {
        try { mkdirSync(join(baseDir(), d), { recursive: true }) } catch {}
      }
      writeFileSync(p, JSON.stringify({ completed: false, criadoEm: new Date().toISOString(), version: '1.0' }, null, 2), 'utf8')
      return { primeiroAcesso: true, completed: false }
    }
    const data = JSON.parse(readFileSync(p, 'utf8'))
    return { primeiroAcesso: !data.completed, completed: !!data.completed, ...data }
  } catch {
    return { primeiroAcesso: true, completed: false }
  }
}

export function concluirOnboarding() {
  try {
    const p = onboardingPath()
    writeFileSync(p, JSON.stringify({ completed: true, concluidoEm: new Date().toISOString(), version: '1.0' }, null, 2), 'utf8')
    return { ok: true }
  } catch (e: any) {
    return { ok: false, erro: String(e?.message || e) }
  }
}

export function resetarOnboarding() {
  try {
    const p = onboardingPath()
    writeFileSync(p, JSON.stringify({ completed: false, resetadoEm: new Date().toISOString(), version: '1.0' }, null, 2), 'utf8')
    return { ok: true }
  } catch (e: any) {
    return { ok: false, erro: String(e?.message || e) }
  }
}
