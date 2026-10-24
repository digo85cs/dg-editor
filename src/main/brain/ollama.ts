/**
 * Unico ponto de contato com o Ollama local.
 * URL, escolha de modelo e chat simples vivem aqui.
 */
import { execSync } from 'child_process'
import { request } from 'http'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { dglog } from '../dglog'
import type { BrainResponse, OllamaStatus } from '@shared/types'

export const OLLAMA_URL = 'http://127.0.0.1:11434'

interface DgConfig {
  ollama?: { keepAlive?: string }
}

function loadDgConfig(): DgConfig {
  const p = join(process.cwd(), 'dg-config.json')
  if (!existsSync(p)) return {}
  try { return JSON.parse(readFileSync(p, 'utf-8')) as DgConfig } catch { return {} }
}

function httpJson(url: string, corpo: unknown | null, method = 'POST', timeout = 120000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const dados = corpo === null ? null : Buffer.from(JSON.stringify(corpo), 'utf8')
    const req = request(
      url,
      {
        method,
        timeout,
        headers: dados
          ? { 'Content-Type': 'application/json', 'Content-Length': dados.length }
          : {}
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const txt = Buffer.concat(chunks).toString('utf8')
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error('HTTP ' + res.statusCode + ': ' + txt.slice(0, 200)))
            return
          }
          try { resolve(txt ? JSON.parse(txt) : {}) } catch (e) { reject(e) }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(new Error('timeout ollama')) })
    if (dados) req.write(dados)
    req.end()
  })
}

function httpGet(path: string, timeoutMs = 5000): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    const req = request(
      OLLAMA_URL + path,
      { method: 'GET', timeout: timeoutMs },
      (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }))
      }
    )
    req.on('error', () => resolve({ status: 0, body: '' }))
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }) })
    req.end()
  })
}

export async function detectarGpu(): Promise<boolean> {
  try {
    const r = (await httpJson(OLLAMA_URL + '/api/ps', {}, 'POST', 5000).catch(() => null)) as
      | { models?: Array<{ size_vram?: number }> }
      | null
    if (r && r.models && r.models.length > 0) {
      const vram = r.models.reduce((s, m) => s + (m.size_vram || 0), 0) / 1024 / 1024 / 1024
      return vram > 0.5
    }
  } catch { /* assume CPU */ }
  return false
}

/**
 * Unica funcao de escolha de modelo do DG Editor.
 * tarefa: chat | codigo | raciocinio | (legado: simples/analise/...)
 */
export async function escolherModelo(tarefa: string = 'codigo'): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const os = require('os') as { freemem(): number }
  const livresGB = os.freemem() / 1024 / 1024 / 1024
  const gpu = await detectarGpu()
  const t = (tarefa || 'codigo').toLowerCase()

  if (!gpu) {
    if (t === 'chat' || t === 'simples') return livresGB >= 3 ? 'qwen2.5-coder:1.5b' : 'qwen2.5-coder:1.5b'
    if (livresGB >= 6) return 'qwen2.5-coder:3b'
    return 'qwen2.5-coder:1.5b'
  }

  if (t === 'raciocinio' || t === 'estrategia') {
    if (livresGB >= 12) return 'qwen2.5-coder:14b'
    if (livresGB >= 6) return 'qwen2.5-coder:7b'
    return 'qwen2.5-coder:3b'
  }
  if (t === 'chat' || t === 'simples') {
    if (livresGB >= 6) return 'qwen2.5-coder:3b'
    return 'qwen2.5-coder:1.5b'
  }
  // codigo / analise / default
  if (livresGB >= 12) return 'qwen2.5-coder:14b'
  if (livresGB >= 6) return 'qwen2.5-coder:7b'
  if (livresGB >= 2.5) return 'qwen2.5-coder:3b'
  return 'qwen2.5-coder:1.5b'
}

function ollamaInstalado(): boolean {
  try {
    const out = execSync(process.platform === 'win32' ? 'where ollama' : 'which ollama', {
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000
    }).trim()
    return out.length > 0
  } catch {
    return false
  }
}

export async function ollamaPing(): Promise<boolean> {
  const { status } = await httpGet('/api/tags', 5000)
  return status === 200
}

export async function listModelos(): Promise<string[]> {
  const { status, body } = await httpGet('/api/tags', 5000)
  if (status !== 200) return []
  try {
    const json = JSON.parse(body) as { models?: { name: string }[] }
    return (json.models || []).map((m) => m.name)
  } catch {
    return []
  }
}

export async function getOllamaStatus(): Promise<OllamaStatus> {
  const installed = ollamaInstalado()
  if (!installed) return { installed: false, reachable: false, models: [], error: 'Ollama nao instalado' }
  const reachable = await ollamaPing()
  if (!reachable) return { installed: true, reachable: false, models: [], error: 'Ollama instalado, mas parado' }
  const nomes = await listModelos()
  return {
    installed: true,
    reachable: true,
    models: nomes.map((name) => ({ name, size: 0, modifiedAt: '' }))
  }
}

/** Chat simples (sem tools) — usado por analyzer/chat IPC. */
export async function askOllama(
  prompt: string,
  context: string,
  tarefa: string = 'codigo'
): Promise<BrainResponse> {
  const model = await escolherModelo(tarefa)
  dglog('[ollama] ask modelo=' + model + ' tarefa=' + tarefa)
  const cfg = loadDgConfig()
  const r = (await httpJson(OLLAMA_URL + '/api/chat', {
    model,
    messages: [
      {
        role: 'system',
        content: 'Voce e o DG Editor, assistente de analise de sistemas. Responda SEMPRE em portugues brasileiro correto.'
      },
      { role: 'user', content: (context ? `Contexto:\n${context}\n\n` : '') + `Pedido: ${prompt}` }
    ],
    stream: false,
    keep_alive: cfg.ollama?.keepAlive || '30s',
    options: { num_ctx: 8192, temperature: 0.3 }
  })) as { message?: { content?: string } }
  return { text: r.message?.content || '', provider: 'ollama', model }
}

export { httpJson as ollamaHttpJson }
