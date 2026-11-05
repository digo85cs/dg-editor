import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

const CLOUD_URL = 'https://ollama.com'
const LOCAL_URL = 'http://127.0.0.1:11434'

const inputSchema = z.object({
  prompt: z.string().trim().min(1).max(200000),
  model: z.string().trim().min(1).max(200).optional(),
  fallback_model: z.string().trim().min(1).max(200).optional(),
  backend: z.enum(['auto', 'local', 'cloud']).default('auto'),
  system: z.string().max(50000).optional(),
  context: z.string().max(200000).optional(),
  language: z.string().trim().min(1).max(80).optional(),
  temperature: z.number().min(0).max(2).optional(),
  num_predict: z.number().int().min(1).max(32768).optional(),
  timeout_ms: z.number().int().min(100).max(300000).default(60000)
})

const properties = {
  prompt: { type: 'string', description: 'Pedido para o modelo.' },
  model: { type: 'string', description: 'Modelo local, seletor :cloud/-cloud ou alias remoto do Ollama.' },
  fallback_model: { type: 'string', description: 'Modelo local instalado preferido para fallback; nunca um remote/cloud.' },
  backend: {
    type: 'string', enum: ['auto', 'local', 'cloud'],
    description: 'auto: daemon e cloud quando solicitado; local: apenas daemon/local; cloud: API direta oficial.'
  },
  system: { type: 'string', description: 'Instrução de sistema opcional.' },
  context: { type: 'string', description: 'Contexto explícito; nenhum arquivo é lido ou enviado automaticamente.' },
  temperature: { type: 'number', minimum: 0, maximum: 2 },
  num_predict: { type: 'integer', minimum: 1, maximum: 32768 },
  timeout_ms: { type: 'integer', minimum: 100, maximum: 300000, description: 'Timeout por tentativa (padrão 60000 ms).' }
}

export const OLLAMA_TOOL_DEFINITIONS = [
  {
    name: 'ollama_ask',
    description: 'Consulta Ollama local ou Ollama Cloud na mesma ferramenta. Remotes/:cloud usam o daemon autenticado ou ollama.com; falhas de disponibilidade usam modelo local instalado. Retorna modelo usado e tentativas.',
    inputSchema: { type: 'object', properties, required: ['prompt'] }
  },
  {
    name: 'ollama_script',
    description: 'Gera um script com Ollama local/cloud e fallback local. Apenas retorna código; não executa nem grava scripts.',
    inputSchema: {
      type: 'object',
      properties: { ...properties, language: { type: 'string', description: 'Linguagem do script, por exemplo powershell, python ou bash.' } },
      required: ['prompt']
    }
  }
]

type Model = {
  name?: string
  model?: string
  size?: number
  remote_host?: string
  remote_model?: string
  capabilities?: string[]
  details?: { family?: string; families?: string[] }
}

type Attempt = { model: string; backend: string; ok: boolean; error?: string }

export interface OllamaToolResult {
  text: string
  requested_model: string
  model: string
  provider: 'ollama-local' | 'ollama-cloud'
  transport: 'daemon' | 'cloud'
  fallback_used: boolean
  attempts: Attempt[]
  language?: string
}

export interface OllamaToolsRuntime {
  fetchImpl?: typeof fetch
  localUrl?: string
  apiKey?: string
  defaultModel?: string
  fallbackModel?: string
  signal?: AbortSignal
}

class RequestError extends Error {
  constructor(message: string, readonly retryable = true) { super(message) }
}

function isCloudName(name: string): boolean {
  return /(?::cloud|-cloud)$/i.test(name)
}

function isRemote(model?: Model): boolean {
  return !!model && (!!model.remote_host || !!model.remote_model || isCloudName(model.name || model.model || ''))
}

function isEmbedding(model: Model): boolean {
  if (model.capabilities?.length) return !model.capabilities.includes('completion') && model.capabilities.includes('embedding')
  return /embed|nomic-bert|bert|bge-|snowflake-arctic/i.test([
    model.name, model.model, model.details?.family, ...(model.details?.families || [])
  ].join(' '))
}

function sameModel(left: string, right: string): boolean {
  return left === right || left.replace(/:latest$/, '') === right.replace(/:latest$/, '')
}

function normalizeLocalUrl(value: string): string {
  const url = new URL(value.includes('://') ? value : 'http://' + value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('OLLAMA_URL/OLLAMA_HOST deve ser uma URL HTTP(S) sem credenciais ou query.')
  }
  return url.toString().replace(/\/$/, '').replace(/\/api$/, '')
}

function officialCloudHost(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'ollama.com' && (!url.port || url.port === '443') && !url.username && !url.password
  } catch { return false }
}

function catalogActive(root: string): string | undefined {
  try {
    const data = JSON.parse(readFileSync(join(root, '.dg-editor', 'modelos.json'), 'utf8').replace(/^\uFEFF/, ''))
    return typeof data.ativo === 'string' ? data.ativo : undefined
  } catch { return undefined }
}

/** Shared by both MCP tools. All inference calls are non-streaming, so a failed
 * cloud response can never be concatenated with a local replacement. */
export async function executeOllamaTool(
  name: 'ollama_ask' | 'ollama_script',
  args: unknown,
  root: string,
  runtime: OllamaToolsRuntime = {}
): Promise<OllamaToolResult> {
  const input = inputSchema.parse(args)
  if (input.fallback_model && isCloudName(input.fallback_model)) {
    throw new Error('fallback_model deve ser um modelo local, sem sufixo cloud.')
  }
  const signal = runtime.signal
  const checkAbort = () => {
    if (signal?.aborted) throw new Error('Chamada Ollama cancelada; fallback não executado.')
  }
  checkAbort()
  const fetchImpl = runtime.fetchImpl || fetch
  const apiKey = runtime.apiKey ?? process.env.OLLAMA_API_KEY ?? ''
  const configuredUrl = normalizeLocalUrl(runtime.localUrl || process.env.OLLAMA_URL || process.env.OLLAMA_HOST || LOCAL_URL)
  const preferCloud = officialCloudHost(configuredUrl)
  const localUrl = preferCloud ? LOCAL_URL : configuredUrl
  const active = catalogActive(root)
  const defaultModel = runtime.defaultModel ?? process.env.OLLAMA_MODEL ?? active
  const fallbackModel = runtime.fallbackModel ?? process.env.OLLAMA_FALLBACK_MODEL
  const attempts: Attempt[] = []
  const redact = (value: string) => {
    let text = value
    if (apiKey) text = text.split(apiKey).join('[redacted]')
    return text.replace(/Bearer\s+[^\s"',}]+/gi, 'Bearer [redacted]').slice(0, 500)
  }

  async function json(url: string, body: unknown | null, timeout: number, cloud = false): Promise<any> {
    checkAbort()
    const ac = new AbortController()
    const cancel = () => ac.abort()
    signal?.addEventListener('abort', cancel, { once: true })
    const timer = setTimeout(() => ac.abort(), timeout)
    try {
      const response = await fetchImpl(url, {
        method: body === null ? 'GET' : 'POST',
        headers: {
          ...(body === null ? {} : { 'Content-Type': 'application/json' }),
          ...(cloud && apiKey ? { Authorization: 'Bearer ' + apiKey } : {})
        },
        body: body === null ? undefined : JSON.stringify(body),
        signal: ac.signal,
        redirect: 'error'
      })
      const text = await response.text()
      checkAbort()
      const availability = /remote|cloud|temporar|unavailable|not found|not available|sign.?in|unauthor|forbidden|authentication|api.?key|access token|disabled|rate.limit|quota|capacity|timeout|timed out|connection/i
      const invalidPayload = /invalid|bad request|malformed|must (?:be|contain)|required|unsupported (?:format|option|parameter)/i
      const canRetry = (message: string) => [401, 403, 404, 408, 409, 429].includes(response.status) || response.status >= 500 ||
        ((response.ok || response.status === 400) && availability.test(message)) || (response.ok && !invalidPayload.test(message))
      let data: any
      try { data = text ? JSON.parse(text) : {} } catch {
        throw new RequestError('Ollama retornou JSON inválido (HTTP ' + response.status + ').', canRetry(text))
      }
      if (!response.ok || data.error) {
        const message = redact(String(data.error || response.statusText || 'erro do upstream'))
        throw new RequestError('HTTP ' + response.status + ': ' + message, canRetry(message))
      }
      return data
    } catch (error) {
      checkAbort()
      if (error instanceof RequestError) throw error
      if (ac.signal.aborted) throw new RequestError('Timeout Ollama após ' + timeout + ' ms.')
      throw new RequestError(redact(error instanceof Error ? error.message : String(error)))
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
    }
  }

  let models: Model[] = []
  let daemonReachable = false
  try {
    const tags = await json(localUrl + '/api/tags', null, 3000)
    models = Array.isArray(tags.models) ? tags.models : []
    daemonReachable = true
  } catch { checkAbort() }
  const installed = (id: string) => models.find((m) => sameModel(m.name || m.model || '', id))
  const localModels = models.filter((m) => !isRemote(m) && !isEmbedding(m))
    .sort((a, b) => (a.size ?? Number.MAX_SAFE_INTEGER) - (b.size ?? Number.MAX_SAFE_INTEGER))
  const requested = input.model || defaultModel || localModels[0]?.name || localModels[0]?.model
  if (!requested) throw new Error('Informe model ou OLLAMA_MODEL; nenhum modelo local instalado foi encontrado.')

  const shows = new Map<string, Model | null>()
  async function show(id: string): Promise<Model | null> {
    if (shows.has(id)) return shows.get(id)!
    try {
      const result = await json(localUrl + '/api/show', { model: id }, 3000)
      const metadata: Model = { ...installed(id), ...result, name: id }
      shows.set(id, metadata)
      return metadata
    } catch {
      checkAbort()
      shows.set(id, null)
      return null
    }
  }
  const requestedDetail = daemonReachable ? await show(requested) : null
  const metadata = requestedDetail || installed(requested)
  const cloudRequested = input.backend === 'cloud' || preferCloud || isCloudName(requested) || isRemote(metadata)
  if (input.backend === 'local' && cloudRequested) {
    throw new Error('backend=local não aceita modelos cloud/remotos.')
  }
  if (input.backend === 'local' && !requestedDetail) {
    throw new Error('backend=local exige confirmação do modelo em /api/show; nenhuma chamada de geração foi enviada.')
  }
  if (metadata && isEmbedding(metadata)) throw new Error('O modelo solicitado só oferece embeddings, não geração de texto.')
  if (input.fallback_model) {
    const info = installed(input.fallback_model)
    const detail = info && daemonReachable ? await show(input.fallback_model) || info : info
    if (isRemote(detail) || (detail && isEmbedding(detail))) {
      throw new Error('fallback_model deve ser realmente local e oferecer geração de texto.')
    }
  }

  const scriptSystem = 'Gere somente o código do script solicitado' + (input.language ? ' em ' + input.language : '') +
    '. Não execute comandos, não grave arquivos e não afirme ter executado o script. Retorne o código sem cercas Markdown.'
  const system = name === 'ollama_script'
    ? scriptSystem + (input.system ? '\n\n' + input.system : '')
    : input.system || 'Você é o assistente do DG Editor. Responda em português do Brasil.'
  const payload = (model: string) => ({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: (input.context ? 'Contexto:\n' + input.context + '\n\n' : '') + input.prompt }
    ],
    stream: false,
    options: { temperature: input.temperature ?? 0.2, num_predict: input.num_predict ?? (name === 'ollama_script' ? 2048 : 1024) }
  })

  async function generate(model: string, transport: 'daemon' | 'cloud', cloud: boolean, fallback: boolean): Promise<OllamaToolResult | null> {
    checkAbort()
    const backend = transport === 'cloud' ? 'cloud' : cloud ? 'daemon-cloud' : 'local'
    try {
      const data = await json((transport === 'cloud' ? CLOUD_URL : localUrl) + '/api/chat', payload(model), input.timeout_ms, transport === 'cloud')
      const text = data.message?.content ?? data.response
      if (typeof text !== 'string' || !text.trim() || data.done === false) throw new RequestError('Ollama retornou uma resposta vazia ou incompleta.')
      attempts.push({ model, backend, ok: true })
      return {
        text,
        requested_model: requested!,
        model: typeof data.model === 'string' && data.model ? data.model : model,
        provider: cloud || data.remote_host || data.remote_model ? 'ollama-cloud' : 'ollama-local',
        transport,
        fallback_used: fallback,
        attempts,
        ...(name === 'ollama_script' && input.language ? { language: input.language } : {})
      }
    } catch (error) {
      checkAbort()
      const message = redact(error instanceof Error ? error.message : String(error))
      attempts.push({ model, backend, ok: false, error: message })
      if (error instanceof RequestError && !error.retryable) throw new Error(message)
      return null
    }
  }

  async function directModel(): Promise<string> {
    if (metadata?.remote_host && !officialCloudHost(metadata.remote_host)) {
      throw new Error('O remote_host não pertence ao Ollama Cloud oficial; a chave não será encaminhada.')
    }
    if (metadata?.remote_model) return metadata.remote_model
    if (!isCloudName(requested!)) return requested!
    const catalog = await json(CLOUD_URL + '/api/tags', null, 5000)
    const names: string[] = (Array.isArray(catalog.models) ? catalog.models : []).map((m: Model) => m.name || m.model).filter(Boolean)
    const legacy = requested!.replace(/-cloud$/i, '')
    if (legacy !== requested && names.includes(legacy)) return legacy
    const family = requested!.replace(/:cloud$/i, '')
    const choices = names.filter((id) => id === family || id.startsWith(family + ':'))
    if (choices.includes(family)) return family
    if (choices.length === 1) return choices[0]
    throw new Error('Não foi possível resolver o seletor cloud sem ambiguidade. Use o nome canônico de ollama.com com backend=cloud ou disponibilize o remote no daemon local.')
  }

  const unsupportedRemote = !!metadata?.remote_host && !officialCloudHost(metadata.remote_host)
  if (unsupportedRemote && input.backend !== 'cloud') {
    attempts.push({ model: requested, backend: 'daemon-cloud', ok: false, error: 'remote_host fora do Ollama Cloud oficial; o prompt não foi enviado a esse remote.' })
  }
  if (input.backend !== 'cloud' && !preferCloud && !unsupportedRemote) {
    const result = await generate(requested, 'daemon', cloudRequested, false)
    if (result) return result
  }
  if (cloudRequested && input.backend !== 'local') {
    if (!apiKey) {
      attempts.push({ model: requested, backend: 'cloud', ok: false, error: 'OLLAMA_API_KEY ausente para API direta; o daemon cloud usa ollama signin.' })
    } else {
      let remote: string | undefined
      try { remote = await directModel() } catch (error) {
        checkAbort()
        attempts.push({ model: requested, backend: 'cloud', ok: false, error: redact(error instanceof Error ? error.message : String(error)) })
      }
      if (remote) {
        const result = await generate(remote, 'cloud', true, false)
        if (result) return result
      }
    }
  }

  const candidates = [...new Set([
    input.fallback_model, fallbackModel, active,
    ...localModels.map((m) => m.name || m.model)
  ].filter((id): id is string => !!id))]
  let localAttempts = 0
  for (const candidate of candidates) {
    checkAbort()
    if (attempts.some((a) => a.backend !== 'cloud' && sameModel(a.model, candidate))) continue
    const info = installed(candidate)
    if (!info || isRemote(info) || isCloudName(candidate) || isEmbedding(info)) continue
    // /show also catches remote aliases copied to names without a cloud suffix.
    const detail = await show(candidate)
    if (!detail || isRemote(detail) || isEmbedding(detail)) continue
    if (++localAttempts > 3) break
    const result = await generate(candidate, 'daemon', false, true)
    if (result) return result
  }
  checkAbort()
  throw new Error('Nenhum modelo respondeu e não há fallback local disponível. ' + attempts.map((a) => a.backend + '/' + a.model + ': ' + (a.error || 'falhou')).join(' | '))
}
