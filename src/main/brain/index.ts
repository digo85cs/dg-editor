import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { request } from 'http'
import { dglog } from '../dglog'
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

// Perfil de modelo por tipo de tarefa: o roteador informa a tarefa,
// e aqui o modelo e escolhido para ELA, nao por ordem de chegada.
export type PerfilTarefa = 'codigo' | 'analise' | 'pesquisa' | 'formatacao' | 'estrategia' | 'simples'

const MODELOS_POR_TAREFA: Record<PerfilTarefa, string[]> = {
  estrategia: ['qwen2.5-coder:14b', 'qwen2.5-coder:7b', 'llama3.2'],
  codigo:     ['qwen2.5-coder:14b', 'qwen2.5-coder:7b', 'qwen2.5-coder:3b', 'llama3.2'],
  analise:    ['qwen2.5-coder:14b', 'qwen2.5-coder:7b', 'llama3.2', 'qwen2.5-coder:3b'],
  pesquisa:   ['llama3.2', 'qwen2.5-coder:7b', 'qwen2.5-coder:14b'],
  formatacao: ['qwen2.5-coder:7b', 'qwen2.5-coder:3b', 'llama3.2'],
  simples:    ['llama3.2', 'qwen2.5-coder:3b', 'qwen2.5-coder:1.5b']
}

// Contexto maior para tarefas que carregam codigo do projeto.
const CTX_POR_TAREFA: Record<PerfilTarefa, number> = {
  estrategia: 8192, codigo: 8192, analise: 8192,
  pesquisa: 4096, formatacao: 4096, simples: 4096
}

// Requisito de RAM por modelo (GB livres). Folga ~1.5 GB sobre o tamanho real
// do modelo para o contexto, KV cache e overhead do Ollama.
const EXIGE_POR_MODELO: { chave: string; minGB: number }[] = [
  { chave: 'qwen2.5-coder:14b', minGB: 11 },
  { chave: 'qwen2.5-coder:7b', minGB: 8.5 },
  { chave: 'qwen2.5-coder:3b', minGB: 3.5 },
  { chave: 'llama3.2', minGB: 3.5 },
  { chave: 'qwen2.5-coder:1.5b', minGB: 2.5 }
]

function ramLivreGB(): number {
  try {
    const os = require('os') as typeof import('os')
    return Math.round((os.freemem() / (1024 ** 3)) * 10) / 10
  } catch {
    return 0
  }
}

function requisitoRAM(modelo: string): number {
  const req = EXIGE_POR_MODELO.find((e) => modelo === e.chave || modelo.startsWith(e.chave))
  return req ? req.minGB : 4
}


function pickModeloPorTarefa(disponiveis: string[], tarefa: PerfilTarefa): string {
  const perfil = MODELOS_POR_TAREFA[tarefa] ?? MODELOS_POR_TAREFA.simples
  const livreGB = ramLivreGB()

  for (const pref of perfil) {
    const hit = disponiveis.find((a) => a === pref || a.startsWith(pref))
    if (!hit) continue
    const minGB = requisitoRAM(hit)
    if (livreGB > 0 && livreGB < minGB) {
      dglog('[brain] ' + tarefa + ': ' + hit + ' exige ' + minGB + ' GB livres (tem ' + livreGB + ') - pulando')
      continue
    }
    dglog('[brain] modelo por tarefa (' + tarefa + '): ' + hit + ' [' + livreGB + ' GB livres]')
    return hit
  }

  const fallback = pickBestModel(disponiveis)
  dglog('[brain] nenhum modelo do perfil (' + tarefa + ') cabe na RAM, fallback: ' + fallback)
  return fallback
}

export function contextoPorTarefa(tarefa: PerfilTarefa): number {
  return CTX_POR_TAREFA[tarefa] ?? 4096
}


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
  const livreGB = ramLivreGB()
  for (const item of EXIGE_POR_MODELO) {
    const hit = available.find((a) => a === item.chave || a.startsWith(item.chave))
    if (!hit) continue
    if (livreGB >= item.minGB) return hit
    dglog('[brain] RAM insuficiente para ' + item.chave + ' (' + livreGB + ' GB livres, precisa ' + item.minGB + ' GB) - pulando')
  }
  return available[0] ?? 'qwen2.5-coder:1.5b'
}

export class OllamaProvider implements BrainProvider {
  name = 'ollama' as const

  async isAvailable(): Promise<boolean> {
    const ok = await this.ping()
    dglog('[brain] isAvailable(ollama): ' + ok)
    return ok
  }

  async ping(): Promise<boolean> {
    const { status } = await httpGet('/api/tags', 5000)
    dglog('[brain] ping status: ' + status)
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

  async ask(prompt: string, context: string, tarefa?: PerfilTarefa): Promise<BrainResponse> {
    const models = await this.listModels()
    dglog('[brain] ask: modelos encontrados: ' + models.length)
    if (models.length === 0) throw new Error('Ollama sem modelos disponiveis')
    const nomes = models.map((m) => m.name)
    const model = pickModeloPorTarefa(nomes, tarefa || 'simples')
    dglog('[brain] modelo escolhido: ' + model)
    const { status, body } = await new Promise<{ status: number; body: string }>((resolve) => {
      const data = JSON.stringify({
        model,
        options: { num_thread: 2, num_ctx: contextoPorTarefa(tarefa || 'simples') },
        messages: [
          { role: 'system', content: 'Voce e o DG Editor, assistente de analise de sistemas. Responda SEMPRE em portugues brasileiro correto.' },
          { role: 'user', content: `Contexto:\n${context}\n\nPedido: ${prompt}` }
        ],
        stream: false,
        keep_alive: DG_CFG.ollama?.keepAlive || '30s'
      })
      const req = request(
        `${OLLAMA_BASE}/api/chat`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 120000 },
        (res) => {
          let b = Buffer.alloc(0)
          res.on('data', (c: Buffer) => { b = Buffer.concat([b, c]) })
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: b.toString('utf8') }))
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
  async isAvailable(): Promise<boolean> { return false /* DG-EDITOR: offline-only, sem provedor pago */ }
  async ping(): Promise<boolean> { return this.isAvailable() }
  async listModels(): Promise<{ name: string }[]> {
    if (!this.isAvailable()) return []
    return [{ name: process.env.LLM_MODEL || 'gpt-4o' }]
  }
  async ask(prompt: string, context: string, tarefa?: PerfilTarefa): Promise<BrainResponse> {
    if (!this.isAvailable()) throw new Error('API key not configured')
    return { text: '[API provider stub - proxima fase]', provider: 'api', model: process.env.LLM_MODEL || 'gpt-4o' }
  }
}

export class MaestroProvider implements BrainProvider {
  name = 'maestro' as const
  async isAvailable(): Promise<boolean> { return false }
  async ping(): Promise<boolean> { return false }
  async listModels(): Promise<{ name: string }[]> { return [] }
  async ask(_prompt: string, _context: string, _tarefa?: PerfilTarefa): Promise<BrainResponse> {
    throw new Error('Maestro provider not available')
  }
}

export function getProviders(): BrainProvider[] {
  return [new OllamaProvider(), new ApiProvider(), new MaestroProvider()]
}

export { pickBestModel }
