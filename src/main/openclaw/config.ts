import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export type OpenClawConfig = {
  endpoint: string
  model: string
  timeoutMs: number
  maxContextBytes: number
}

const PADRAO: OpenClawConfig = {
  endpoint: 'http://127.0.0.1:18789',
  model: 'openclaw/default',
  timeoutMs: 60_000,
  maxContextBytes: 512 * 1024
}

function configPath(): string {
  return join(app.getPath('userData'), 'openclaw-config.json')
}

export function lerConfigOpenClaw(): OpenClawConfig {
  try {
    const p = configPath()
    if (!existsSync(p)) return { ...PADRAO }
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<OpenClawConfig>
    return {
      endpoint: typeof raw.endpoint === 'string' && raw.endpoint.trim() ? raw.endpoint.trim() : PADRAO.endpoint,
      model: typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : PADRAO.model,
      timeoutMs:
        typeof raw.timeoutMs === 'number' && raw.timeoutMs > 0 ? Math.min(raw.timeoutMs, 300_000) : PADRAO.timeoutMs,
      maxContextBytes:
        typeof raw.maxContextBytes === 'number' && raw.maxContextBytes > 0
          ? Math.min(raw.maxContextBytes, 2 * 1024 * 1024)
          : PADRAO.maxContextBytes
    }
  } catch {
    return { ...PADRAO }
  }
}

export function salvarConfigOpenClaw(parcial: Partial<OpenClawConfig>): OpenClawConfig {
  const atual = lerConfigOpenClaw()
  const next: OpenClawConfig = {
    endpoint:
      typeof parcial.endpoint === 'string' && parcial.endpoint.trim()
        ? parcial.endpoint.trim().replace(/\/$/, '')
        : atual.endpoint,
    model: typeof parcial.model === 'string' && parcial.model.trim() ? parcial.model.trim() : atual.model,
    timeoutMs:
      typeof parcial.timeoutMs === 'number' && parcial.timeoutMs > 0
        ? Math.min(parcial.timeoutMs, 300_000)
        : atual.timeoutMs,
    maxContextBytes:
      typeof parcial.maxContextBytes === 'number' && parcial.maxContextBytes > 0
        ? Math.min(parcial.maxContextBytes, 2 * 1024 * 1024)
        : atual.maxContextBytes
  }
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}
