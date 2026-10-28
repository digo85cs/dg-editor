/**
 * Unico ponto de contato com o Ollama local.
 * URL, escolha de modelo e chat simples vivem aqui.
 */
import { execSync } from 'child_process'
import { request, type ClientRequest } from 'http'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { dglog } from '../dglog'
import type { BrainResponse, OllamaStatus } from '@shared/types'
import type { EscolherModeloOpts } from './registry'

export const OLLAMA_URL = 'http://127.0.0.1:11434'

interface DgConfig {
  ollama?: { keepAlive?: string }
}

function loadDgConfig(): DgConfig {
  let raiz = process.cwd()
  try {
    // lazy: evita ciclo de import com paths em boot
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    raiz = (require('../paths') as typeof import('../paths')).resolverRaizProjeto()
  } catch { /* cwd */ }
  const p = join(raiz, 'dg-config.json')
  if (!existsSync(p)) return {}
  try {
    const bruto = readFileSync(p, 'utf-8').replace(/^\uFEFF/, '')
    return JSON.parse(bruto) as DgConfig
  } catch {
    return {}
  }
}

/**
 * POST/GET JSON com timeout real: AbortController cancela a request HTTP.
 * (Node http.request + abort → req.destroy)
 */
function httpJson(
  url: string,
  corpo: unknown | null,
  method = 'POST',
  timeoutMs = 120000,
  signal?: AbortSignal
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('abort ollama'))
      return
    }
    const dados = corpo === null ? null : Buffer.from(JSON.stringify(corpo), 'utf8')
    let settled = false
    const req: ClientRequest = request(
      url,
      {
        method,
        timeout: timeoutMs,
        headers: dados
          ? { 'Content-Type': 'application/json', 'Content-Length': dados.length }
          : {}
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          if (settled) return
          settled = true
          const txt = Buffer.concat(chunks).toString('utf8')
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error('HTTP ' + res.statusCode + ': ' + txt.slice(0, 200)))
            return
          }
          try { resolve(txt ? JSON.parse(txt) : {}) } catch (e) { reject(e) }
        })
      }
    )

    const onAbort = () => {
      if (settled) return
      settled = true
      try { req.destroy(new Error('abort ollama (AbortController)')) } catch { /* */ }
      reject(new Error('timeout/abort ollama apos ' + timeoutMs + 'ms'))
    }
    if (signal) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }

    req.on('error', (e) => {
      if (settled) return
      settled = true
      reject(e)
    })
    req.on('timeout', () => onAbort())

    if (dados) req.write(dados)
    req.end()
  })
}

/** Wrapper com AbortController: timeout cancela de fato a conexao. */
export async function ollamaHttpJson(
  url: string,
  corpo: unknown | null,
  method = 'POST',
  timeoutMs = 120000
): Promise<unknown> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    return await httpJson(url, corpo, method, timeoutMs, ac.signal)
  } finally {
    clearTimeout(timer)
  }
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
    const r = (await ollamaHttpJson(OLLAMA_URL + '/api/ps', {}, 'POST', 5000).catch(() => null)) as
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
 * Unica API publica de escolha de modelo.
 * NAO rebaixa 7b/14b para 3b em CPU — o 7b e o teto pratico medido.
 */
export async function escolherModelo(
  tarefa: string = 'codigo',
  opts: EscolherModeloOpts = {}
): Promise<string> {
  const { escolherModeloPorTarefa } = await import('./registry')
  const escolhido = await escolherModeloPorTarefa(tarefa, opts)
  dglog('[ollama] escolherModelo(' + tarefa + ') = ' + escolhido +
    (opts.preferirQualidade ? ' [preferirQualidade]' : ''))
  return escolhido
}

export { type EscolherModeloOpts }

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

/** Uma única GET /api/tags (timeout curto) — via preferida do catálogo. null = Ollama down. */
export async function listarModelosOllama(): Promise<string[] | null> {
  const { status, body } = await httpGet('/api/tags', 1500)
  if (status !== 200) return null
  try {
    const json = JSON.parse(body) as { models?: { name: string }[] }
    return (json.models || []).map((m) => m.name)
  } catch {
    return null
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
  tarefa: string = 'codigo',
  opts: EscolherModeloOpts = {}
): Promise<BrainResponse> {
  const { limitesPorTarefa } = await import('./registry')
  const model = await escolherModelo(tarefa, opts)
  const lim = limitesPorTarefa(tarefa)
  dglog('[ollama] ask modelo=' + model + ' tarefa=' + tarefa +
    ' num_predict=' + lim.num_predict + ' timeoutMs=' + lim.timeoutMs)
  const cfg = loadDgConfig()
  const r = (await ollamaHttpJson(
    OLLAMA_URL + '/api/chat',
    {
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
      options: {
        num_ctx: 8192,
        temperature: 0.3,
        num_predict: lim.num_predict
      }
    },
    'POST',
    lim.timeoutMs
  )) as { message?: { content?: string } }
  return { text: r.message?.content || '', provider: 'ollama', model }
}
