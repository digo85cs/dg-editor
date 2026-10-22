import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { request } from 'http'
import type { BrainProvider, BrainResponse, OllamaStatus } from '@shared/types'

const OLLAMA_BASE = 'http://127.0.0.1:11434'

interface DgConfig { ollama?: { fastModel?: string; chatModel?: string; keepAlive?: string; url?: string } }

function loadDgConfig(): DgConfig {
  const p = join(process.cwd(), 'dg-config.json')
  if (existsSync(p)) {
    try { return JSON.parse(readFileSync(p, 'utf-8')) as DgConfig } catch { return {} }
  }
  return {}
}

const DG_CFG = loadDgConfig()

const MODEL_PREFERENCE = [
  DG_CFG.ollama?.fastModel || process.env.OLLAMA_FAST_MODEL || 'qwen2.5-coder:1.5b',
  'qwen2.5-coder:1.5b', 'qwen2.5-coder:3b', 'llama3.2', 'mistral'
]

function httpGet(path: string, timeoutMs = 3000): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    const req = request(
      `${OLLAMA_BASE}${path}`,
      { method: 'GET', timeout: timeoutMs },
      (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }))
      }
    )
    req.on('error', () => resolve({ status: 0, body: '' }))
    req.on('timeout', () => { req.destroy() })
    req.end()
  })
}

function isOllamaInstalled(): boolean {
  try {
    const out = execSync(process.platform === 'win32' ? 'where ollama' : 'which ollama', {
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000
    }).trim()
    return out.length > 0
  } catch {
    return false
  }
}

function pickBestModel(available: string[]): string {
  for (const pref of MODEL_PREFERENCE) {
    const hit = available.find((a) => a === pref || a.startsWith(pref))
    if (hit) return hit
  }
  return available[0] ?? 'qwen2.5-coder:1.5b'
}

export class OllamaProvider implements BrainProvider {
  name = 'ollama' as const

  async isAvailable(): Promise<boolean> {
    const ok = await this.ping()
    console.log('[brain] isAvailable(ollama):', ok)
    return ok
  }

  async ping(): Promise<boolean> {
    const { status } = await httpGet('/api/tags', 5000)
    console.log('[brain] ping status:', status)
    return status === 200
  }

  async listModels(): Promise<{ name: string }[]> {
    const { status, body } = await httpGet('/api/tags', 3000)
    if (status !== 200) return []
    try {
      const json = JSON.parse(body) as { models?: { name: string }[] }
      return json.models ?? []
    } catch {
      return []
    }
  }

  async getStatus(): Promise<OllamaStatus> {
    const installed = isOllamaInstalled()
    if (!installed) return { installed: false, reachable: false, models: [], error: 'Ollama nao instalado' }
    const reachable = await this.ping()
    if (!reachable) return { installed: true, reachable: false, models: [], error: 'Ollama instalado, mas parado' }
    const models = await this.listModels()
    return { installed: true, reachable: true, models: models.map((m) => ({ name: m.name, size: 0, modifiedAt: '' })) }
  }

  async ask(prompt: string, context: string): Promise<BrainResponse> {
    const models = await this.listModels()
    console.log('[brain] ask: modelos encontrados:', models.length)
    if (models.length === 0) throw new Error('Ollama sem modelos disponiveis')
    const model = pickBestModel(models.map((m) => m.name))
    const { status, body } = await new Promise<{ status: number; body: string }>((resolve) => {
      const data = JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Voce e o DG Studio, assistente de analise de sistemas. Responda SEMPRE em portugues brasileiro correto.' },
          { role: 'user', content: `Contexto:\n${context}\n\nPedido: ${prompt}` }
        ],
        stream: false,
        keep_alive: DG_CFG.ollama?.keepAlive || '30s'
      })
      const req = request(
        `${OLLAMA_BASE}/api/chat`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 120000 },
        (res) => {
          let b = ''
          res.on('data', (c: Buffer) => { b += c.toString() })
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: b }))
        }
      )
      req.on('error', () => resolve({ status: 0, body: '' }))
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }) })
      req.write(data)
      req.end()
    })
    if (status !== 200) throw new Error(`Ollama request failed: ${status}`)
    const json = JSON.parse(body) as { message?: { content: string } }
    return { text: json.message?.content ?? '', provider: 'ollama', model }
  }
}

export class ApiProvider implements BrainProvider {
  name = 'api' as const
  async isAvailable(): Promise<boolean> { return !!process.env.LLM_API_KEY }
  async ping(): Promise<boolean> { return this.isAvailable() }
  async listModels(): Promise<{ name: string }[]> {
    if (!this.isAvailable()) return []
    return [{ name: process.env.LLM_MODEL || 'gpt-4o' }]
  }
  async ask(prompt: string, context: string): Promise<BrainResponse> {
    if (!this.isAvailable()) throw new Error('API key not configured')
    return { text: '[API provider stub - proxima fase]', provider: 'api', model: process.env.LLM_MODEL || 'gpt-4o' }
  }
}

export class MaestroProvider implements BrainProvider {
  name = 'maestro' as const
  async isAvailable(): Promise<boolean> { return false }
  async ping(): Promise<boolean> { return false }
  async listModels(): Promise<{ name: string }[]> { return [] }
  async ask(_prompt: string, _context: string): Promise<BrainResponse> {
    throw new Error('Maestro provider not available')
  }
}

export function getProviders(): BrainProvider[] {
  return [new OllamaProvider(), new ApiProvider(), new MaestroProvider()]
}

export { pickBestModel, MODEL_PREFERENCE }