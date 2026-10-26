/**
 * Adapters unificados: Ollama local + OpenAI-compatible (OpenRouter etc).
 * Nenhuma chave no codigo — so process.env[cfg.apiKeyEnv].
 */
import { request as httpRequest, type ClientRequest } from 'http'
import { request as httpsRequest } from 'https'
import { URL } from 'url'
import { dglog } from '../dglog'
import { OLLAMA_URL } from './ollama'

export interface ProviderConfig {
  id: string
  tipo: 'local' | 'online'
  formato: 'ollama' | 'openai'
  modelo: string
  baseUrl: string
  apiKeyEnv?: string
  numPredict: number
  timeoutMs: number
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{
    id?: string
    type?: string
    function: { name: string; arguments: Record<string, unknown> | string }
  }>
  tool_name?: string
  tool_call_id?: string
  name?: string
}

export interface ToolDef {
  name: string
  description?: string
  inputSchema?: unknown
}

export type ErroProviderKind = 'rate_limit' | 'auth' | 'server' | 'timeout' | 'rede' | 'outro'

export class ErroProvider extends Error {
  kind: ErroProviderKind
  status?: number
  providerId: string
  constructor(kind: ErroProviderKind, message: string, providerId: string, status?: number) {
    super(message)
    this.kind = kind
    this.providerId = providerId
    this.status = status
    this.name = 'ErroProvider'
  }
}

export interface RespostaProvider {
  content: string
  tool_calls: Array<{ function: { name: string; arguments: Record<string, unknown> } }>
  modeloUsado: string
  providerId: string
  bruto?: unknown
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

function httpJsonUrl(
  urlStr: string,
  corpo: unknown | null,
  method: string,
  timeoutMs: number,
  headers: Record<string, string>,
  signal?: AbortSignal
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ErroProvider('timeout', 'abort antes do request', 'unknown'))
      return
    }
    const u = new URL(urlStr)
    const isHttps = u.protocol === 'https:'
    const lib = isHttps ? httpsRequest : httpRequest
    const dados = corpo === null ? null : Buffer.from(JSON.stringify(corpo), 'utf8')
    let settled = false

    const req: ClientRequest = lib(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: u.pathname + u.search,
        method,
        timeout: timeoutMs,
        headers: {
          ...headers,
          ...(dados
            ? { 'Content-Type': 'application/json', 'Content-Length': String(dados.length) }
            : {})
        }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          if (settled) return
          settled = true
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf8')
          })
        })
      }
    )

    const onAbort = () => {
      if (settled) return
      settled = true
      try { req.destroy() } catch { /* */ }
      reject(new ErroProvider('timeout', 'timeout/abort apos ' + timeoutMs + 'ms', 'unknown'))
    }
    if (signal) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }
    req.on('error', (e: NodeJS.ErrnoException) => {
      if (settled) return
      settled = true
      const code = e.code || ''
      if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        reject(new ErroProvider('rede', String(e.message), 'unknown'))
      } else if (code === 'ETIMEDOUT' || /timeout/i.test(String(e.message))) {
        reject(new ErroProvider('timeout', String(e.message), 'unknown'))
      } else {
        reject(new ErroProvider('rede', String(e.message), 'unknown'))
      }
    })
    req.on('timeout', () => onAbort())
    if (dados) req.write(dados)
    req.end()
  })
}

export function classificarHttp(status: number, body: string, providerId: string): ErroProvider {
  if (status === 429) return new ErroProvider('rate_limit', 'HTTP 429: ' + body.slice(0, 200), providerId, status)
  if (status === 401 || status === 403) return new ErroProvider('auth', 'HTTP ' + status + ': ' + body.slice(0, 200), providerId, status)
  if (status >= 500) return new ErroProvider('server', 'HTTP ' + status + ': ' + body.slice(0, 200), providerId, status)
  return new ErroProvider('outro', 'HTTP ' + status + ': ' + body.slice(0, 200), providerId, status)
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return p && typeof p === 'object' && !Array.isArray(p) ? p : {}
    } catch {
      return {}
    }
  }
  return {}
}

async function adapterOllama(
  cfg: ProviderConfig,
  mensagens: Message[],
  tools?: ToolDef[],
  signal?: AbortSignal
): Promise<RespostaProvider> {
  const base = cfg.baseUrl.replace(/\/$/, '') || OLLAMA_URL
  const corpo: Record<string, unknown> = {
    model: cfg.modelo,
    messages: mensagens.map((m) => {
      const out: Record<string, unknown> = { role: m.role, content: m.content || '' }
      if (m.tool_calls) out.tool_calls = m.tool_calls
      if (m.tool_name) out.tool_name = m.tool_name
      return out
    }),
    stream: false,
    options: {
      temperature: 0.3,
      num_ctx: 8192,
      num_predict: cfg.numPredict
    }
  }
  if (tools && tools.length > 0) {
    corpo.tools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description || t.name,
        parameters: t.inputSchema || { type: 'object', properties: {} }
      }
    }))
  }

  let status = 0
  let body = ''
  try {
    const r = await httpJsonUrl(base + '/api/chat', corpo, 'POST', cfg.timeoutMs, {}, signal)
    status = r.status
    body = r.body
  } catch (e) {
    if (e instanceof ErroProvider) {
      e.providerId = cfg.id
      throw e
    }
    throw new ErroProvider('rede', String(e), cfg.id)
  }

  if (status >= 400) throw classificarHttp(status, body, cfg.id)

  let json: {
    message?: {
      content?: string
      tool_calls?: Array<{ function?: { name?: string; arguments?: unknown } }>
    }
  }
  try {
    json = JSON.parse(body)
  } catch {
    throw new ErroProvider('outro', 'JSON invalido do Ollama', cfg.id)
  }

  const msg = json.message || {}
  const tool_calls = (msg.tool_calls || [])
    .map((c) => ({
      function: {
        name: String(c.function?.name || ''),
        arguments: parseArgs(c.function?.arguments)
      }
    }))
    .filter((c) => c.function.name)

  return {
    content: msg.content || '',
    tool_calls,
    modeloUsado: cfg.modelo,
    providerId: cfg.id,
    bruto: json
  }
}

async function adapterOpenAI(
  cfg: ProviderConfig,
  mensagens: Message[],
  tools?: ToolDef[],
  signal?: AbortSignal
): Promise<RespostaProvider> {
  const keyName = cfg.apiKeyEnv || ''
  const key = keyName ? process.env[keyName] : undefined
  if (!key) {
    throw new ErroProvider('auth', 'chave ausente: env ' + keyName, cfg.id, 401)
  }

  const base = cfg.baseUrl.replace(/\/$/, '')
  const msgs = mensagens.map((m) => {
    if (m.role === 'tool') {
      return {
        role: 'tool',
        content: m.content || '',
        tool_call_id: m.tool_call_id || m.name || 'tool',
        name: m.tool_name || m.name
      }
    }
    const out: Record<string, unknown> = { role: m.role, content: m.content || '' }
    if (m.tool_calls && m.tool_calls.length) {
      out.tool_calls = m.tool_calls.map((tc, i) => ({
        id: tc.id || 'call_' + i,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments:
            typeof tc.function.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function.arguments || {})
        }
      }))
    }
    return out
  })

  const corpo: Record<string, unknown> = {
    model: cfg.modelo,
    messages: msgs,
    temperature: 0.3,
    max_tokens: cfg.numPredict
  }
  if (tools && tools.length > 0) {
    corpo.tools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description || t.name,
        parameters: t.inputSchema || { type: 'object', properties: {} }
      }
    }))
  }

  let status = 0
  let body = ''
  try {
    const r = await httpJsonUrl(
      base + '/chat/completions',
      corpo,
      'POST',
      cfg.timeoutMs,
      {
        Authorization: 'Bearer ' + key,
        'HTTP-Referer': 'https://dg-editor.local',
        'X-Title': 'DG Editor'
      },
      signal
    )
    status = r.status
    body = r.body
  } catch (e) {
    if (e instanceof ErroProvider) {
      e.providerId = cfg.id
      throw e
    }
    throw new ErroProvider('rede', String(e), cfg.id)
  }

  if (status >= 400) throw classificarHttp(status, body, cfg.id)

  let json: {
    choices?: Array<{
      message?: {
        content?: string | null
        tool_calls?: Array<{
          id?: string
          function?: { name?: string; arguments?: string }
        }>
      }
    }>
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    model?: string
  }
  try {
    json = JSON.parse(body)
  } catch {
    throw new ErroProvider('outro', 'JSON invalido OpenAI-compatible', cfg.id)
  }

  const msg = json.choices?.[0]?.message || {}
  const tool_calls = (msg.tool_calls || [])
    .map((c) => ({
      function: {
        name: String(c.function?.name || ''),
        arguments: parseArgs(c.function?.arguments)
      }
    }))
    .filter((c) => c.function.name)

  return {
    content: msg.content || '',
    tool_calls,
    modeloUsado: json.model || cfg.modelo,
    providerId: cfg.id,
    bruto: json,
    usage: json.usage
  }
}

export async function chamarProvider(
  cfg: ProviderConfig,
  mensagens: Message[],
  tools?: ToolDef[]
): Promise<RespostaProvider> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), cfg.timeoutMs)
  try {
    if (cfg.formato === 'ollama') {
      return await adapterOllama(cfg, mensagens, tools, ac.signal)
    }
    return await adapterOpenAI(cfg, mensagens, tools, ac.signal)
  } finally {
    clearTimeout(timer)
  }
}

/** Igual a chamarProvider, mas loga o id efetivo (chamarProviderSharp). */
export async function chamarProviderSharp(
  cfg: ProviderConfig,
  mensagens: Message[],
  tools?: ToolDef[]
): Promise<RespostaProvider> {
  const r = await chamarProvider(cfg, mensagens, tools)
  dglog('[provider] sharp id=' + r.providerId + ' modelo=' + r.modeloUsado)
  return r
}

export function disponivel(cfg: ProviderConfig): boolean {
  if (cfg.tipo === 'local') return true
  if (!cfg.apiKeyEnv) return false
  const v = process.env[cfg.apiKeyEnv]
  return typeof v === 'string' && v.trim().length > 0
}
