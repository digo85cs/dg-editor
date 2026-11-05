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
  try {
    const { resolverRaizProjeto } = await import('../paths')
    const { modeloParaTarefa, lerCatalogo } = await import('./modelos-catalogo')
    const raiz = resolverRaizProjeto()
    const doCat = modeloParaTarefa(raiz, tarefa)
    if (doCat) {
      dglog('[ollama] escolherModelo(' + tarefa + ') = ' + doCat + ' via=modeloParaTarefa')
      return doCat
    }
    const cat = lerCatalogo(raiz)
    const temChat = cat.modelos.some((m) => m.instalado !== false && m.tipo !== 'embedding')
    if (!temChat && cat.modelos.some((m) => m.tipo === 'embedding')) {
      throw new Error('Nenhum modelo de chat instalado')
    }
  } catch (e) {
    if (e instanceof Error && /Nenhum modelo de chat/.test(e.message)) throw e
  }
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

/** Latência real de um modelo (POST /api/generate num_predict=1), não do endpoint. */
export type VersaoRemotaInfo = {
  localTag: string
  remotas: string[]
  atualizadoDisponivel: boolean
  erro?: string
}

/**
 * Consulta tags públicas no registry.ollama.ai (NÃO baixa modelo).
 * Usado por modelos:versoes-remotas / badge "atualização disponível".
 */
export async function consultarVersoesRemotas(
  ids: string[]
): Promise<Record<string, VersaoRemotaInfo>> {
  const out: Record<string, VersaoRemotaInfo> = {}
  for (const id of ids) {
    const [nome, tag = 'latest'] = String(id).split(':')
    const localTag = tag || 'latest'
    if (!nome) {
      out[id] = { localTag, remotas: [], atualizadoDisponivel: false, erro: 'id invalido' }
      continue
    }
    try {
      // Página pública de tags (HTML) — registry v2 /tags/list responde 404 para library/*
      const url = 'https://ollama.com/library/' + encodeURIComponent(nome) + '/tags'
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 10000)
      const res = await fetch(url, { signal: ac.signal, headers: { Accept: 'text/html' } })
      clearTimeout(timer)
      if (!res.ok) {
        out[id] = {
          localTag,
          remotas: [],
          atualizadoDisponivel: false,
          erro: 'http ' + res.status
        }
        continue
      }
      const html = await res.text()
      const remotasSet = new Set<string>()
      const re = new RegExp('/library/' + nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':([a-zA-Z0-9._-]+)', 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(html))) remotasSet.add(m[1])
      const remotas = [...remotasSet]
      const temLocal = remotas.includes(localTag)
      const atualizadoDisponivel = remotas.length > 0 && !temLocal
      out[id] = { localTag, remotas: remotas.slice(0, 40), atualizadoDisponivel }
    } catch (e) {
      out[id] = {
        localTag,
        remotas: [],
        atualizadoDisponivel: false,
        erro: String((e as Error)?.message || e).slice(0, 200)
      }
    }
  }
  return out
}

export type ErroLatenciaKind = 'timeout' | 'offline' | 'not_found' | 'outro'

/** Modelos carregados na RAM (/api/ps). */
export async function listarModelosResidentes(): Promise<string[]> {
  const { status, body } = await httpGet('/api/ps', 5000)
  if (status !== 200) return []
  try {
    const json = JSON.parse(body) as { models?: { name?: string; model?: string }[] }
    return (json.models || [])
      .map((m) => String(m.name || m.model || '').trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function classificarErroLatencia(msg: string): ErroLatenciaKind {
  const s = String(msg || '')
  if (/ECONNREFUSED|ENOTFOUND|ECONNRESET|socket hang up|network/i.test(s)) return 'offline'
  if (/HTTP 404|model ['"]?[\w.:-]+['"]? not found|not found/i.test(s)) return 'not_found'
  if (/timeout|abort ollama/i.test(s)) return 'timeout'
  return 'outro'
}

export async function medirLatenciaModelo(
  id: string,
  timeoutMs = 90_000
): Promise<
  | { ok: true; ms: number }
  | { ok: false; erro: string; kind: ErroLatenciaKind; ms: null }
> {
  const t0 = Date.now()
  try {
    await ollamaHttpJson(
      OLLAMA_URL + '/api/generate',
      {
        model: id,
        prompt: 'ok',
        stream: false,
        keep_alive: '24h',
        options: { num_predict: 1 }
      },
      'POST',
      timeoutMs
    )
    return { ok: true, ms: Date.now() - t0 }
  } catch (e) {
    const erro = String((e as Error)?.message || e)
    return { ok: false, erro, kind: classificarErroLatencia(erro), ms: null }
  }
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

export interface AskOllamaOptions {
  model?: string
  systemPrompt?: string
  numPredict?: number
  timeoutMs?: number
}

/** Chat simples (sem tools) — usado por analyzer/chat IPC. */
export async function askOllama(
  prompt: string,
  context: string,
  tarefa: string = 'codigo',
  opts: EscolherModeloOpts = {},
  requestOptions: AskOllamaOptions = {}
): Promise<BrainResponse> {
  const { limitesPorTarefa } = await import('./registry')
  // Roteamento real do catálogo (nunca embedding em chat/analise/completar/codigo)
  let model: string | null = requestOptions.model || null
  if (!model) {
    try {
      const { resolverRaizProjeto } = await import('../paths')
      const { modeloParaTarefa } = await import('./modelos-catalogo')
      model = modeloParaTarefa(resolverRaizProjeto(), tarefa)
    } catch {
      model = null
    }
  }
  if (!model) {
    throw new Error('Nenhum modelo de chat instalado')
  }
  // Chat e analise ficam no modelo pequeno. 7b/14b so entram em codigo, revisao ou raciocinio.
  if (
    (tarefa === 'chat' || tarefa === 'chat-rapido' || tarefa === 'analise' || tarefa === 'analisar') &&
    /:(?:7b|14b)\b/.test(model)
  ) {
    model = tarefa === 'chat-rapido' ? 'qwen2.5-coder:1.5b' : 'qwen2.5-coder:3b'
    dglog('[ollama] modelo grande bloqueado nesta tarefa; usando ' + model)
  }
  const lim = limitesPorTarefa(tarefa)
  const numPredict = requestOptions.numPredict ?? lim.num_predict
  const timeoutMs = Math.max(1, Math.min(requestOptions.timeoutMs ?? lim.timeoutMs, lim.timeoutMs))
  const leve =
    tarefa === 'chat' || tarefa === 'chat-rapido' || tarefa === 'analise' || tarefa === 'analisar'
  dglog('[ollama] modelo escolhido=' + model)
  dglog('[ollama] ask modelo=' + model + ' tarefa=' + tarefa +
    ' num_predict=' + numPredict + ' timeoutMs=' + timeoutMs + ' via=modeloParaTarefa')
  const cfg = loadDgConfig()
  const r = (await ollamaHttpJson(
    OLLAMA_URL + '/api/chat',
    {
      model,
      messages: [
        {
          role: 'system',
          content: requestOptions.systemPrompt || 'Voce e o DG Editor, assistente de analise de sistemas. Responda SEMPRE em portugues brasileiro correto.'
        },
        { role: 'user', content: (context ? `Contexto:\n${context}\n\n` : '') + `Pedido: ${prompt}` }
      ],
      stream: false,
      keep_alive: leve ? '2m' : cfg.ollama?.keepAlive || '5m',
      options: {
        num_ctx: leve ? 4096 : 8192,
        temperature: 0.3,
        num_predict: numPredict
      }
    },
    'POST',
    timeoutMs
  )) as { message?: { content?: string }; eval_count?: number }
  return {
    text: r.message?.content || '',
    provider: 'ollama',
    model,
    ...(typeof r.eval_count === 'number' ? { evalCount: r.eval_count } : {})
  }
}
