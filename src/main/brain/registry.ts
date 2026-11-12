/**
 * Fila de providers por tarefa (online → local fallback).
 * disponivel() retorna status honesto (ok | sem-chave | modelo-invalido | indisponivel).
 */
import { listModelos } from './ollama'
import { dglog } from '../dglog'
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { resolverBinarioCodex, statusCodexEmCache } from './codex-cli'
import {
  type ProviderConfig,
  cursorCliAprovadoNaSessao,
  resolverBinarioCursorAgent
} from './providers'
import { filaGlobal, configParaProvider } from './providers-registry'
import { lerChave } from './segredos-providers'

export type TipoModelo = 'local' | 'online'
export type TarefaModelo = 'chat' | 'chat-rapido' | 'analise' | 'analisar' | 'codigo' | 'raciocinio' | 'revisao'
export type Tarefa = TarefaModelo
export type ProvedorEscolhido = 'auto' | 'ollama' | 'codex'

export interface ModeloReg {
  nome: string
  tipo: TipoModelo
  contexto: number
  forca: number
  tarefas: TarefaModelo[]
  endpoint?: string
  tokS?: number
}

export interface EscolherModeloOpts {
  provider?: ProvedorEscolhido
  preferirQualidade?: boolean
  pedido?: string
  /** 'pipeline' = uso real; 'auditoria'|'teste' = nao conta no stats de 14b */
  origem?: 'pipeline' | 'auditoria' | 'teste'
}

export interface OpcoesFila {
  provider?: ProvedorEscolhido
  preferirQualidade?: boolean
  pedido?: string
}

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const OLLAMA_BASE = 'http://127.0.0.1:11434'
const KEY_ENV = 'OPENROUTER_API_KEY'

const REGISTRO_BASE: ModeloReg[] = [
  { nome: 'qwen2.5-coder:1.5b', tipo: 'local', contexto: 4096, forca: 3, tokS: 35.5, tarefas: ['chat', 'codigo'] },
  { nome: 'qwen2.5-coder:3b', tipo: 'local', contexto: 8192, forca: 5, tokS: 18.8, tarefas: ['chat', 'codigo'] },
  { nome: 'qwen2.5-coder:7b', tipo: 'local', contexto: 8192, forca: 7, tokS: 7.8, tarefas: ['codigo', 'raciocinio'] },
  { nome: 'qwen2.5-coder:14b', tipo: 'local', contexto: 8192, forca: 9, tokS: 3.8, tarefas: ['codigo', 'raciocinio'] },
  { nome: 'llama3.2', tipo: 'local', contexto: 4096, forca: 5, tokS: 9.7, tarefas: ['chat', 'raciocinio'] }
]

let extras: ModeloReg[] = []

const STATS_FILE = '.dg-editor/modelos-stats.json'

export function listarRegistry(): ModeloReg[] {
  return [...REGISTRO_BASE, ...extras]
}

export function registrarModelo(m: ModeloReg): void {
  extras = extras.filter((x) => x.nome !== m.nome)
  extras.push(m)
}

export function normalizarTarefa(tarefa: string): TarefaModelo {
  const t = (tarefa || 'codigo').toLowerCase()
  if (t === 'chat-rapido') return 'chat-rapido'
  if (t === 'analise') return 'analise'
  if (t === 'analisar') return 'analisar'
  if (t === 'chat' || t === 'simples') return 'chat'
  if (t === 'raciocinio' || t === 'estrategia') return 'raciocinio'
  if (t === 'revisao' || t === 'review') return 'revisao'
  return 'codigo'
}

function cfgCursorCli(): ProviderConfig {
  return cfg({
    id: 'cursor-cli:cursor-agent',
    tipo: 'cli',
    formato: 'cursor-cli',
    modelo: 'cursor-agent',
    baseUrl: '',
    numPredict: 0,
    timeoutMs: 180_000,
    modo: 'ask'
  })
}

export function cfgCodexCli(): ProviderConfig {
  return cfg({
    id: 'codex-cli:default',
    tipo: 'cli',
    formato: 'codex-cli',
    modelo: process.env.CODEX_MODEL?.trim() || '',
    baseUrl: '',
    binario: resolverBinarioCodex() || undefined,
    numPredict: 0,
    timeoutMs: 180_000,
    modo: 'ask'
  })
}

export type StatusDisponivel = 'ok' | 'sem-chave' | 'modelo-invalido' | 'indisponivel'

const CATALOG_TTL_MS = 10 * 60 * 1000
let catalogOpenRouter: { ids: Set<string>; at: number; erro?: string } | null = null

function logStderr(msg: string): void {
  try { process.stderr.write(msg + '\n') } catch { dglog(msg) }
}

/** Busca catálogo OpenRouter (sync via subprocess) com TTL 10 min. */
export function garantirCatalogoOpenRouterSync(): void {
  if (catalogOpenRouter && Date.now() - catalogOpenRouter.at < CATALOG_TTL_MS) return
  const key = process.env.OPENROUTER_API_KEY || ''
  if (!key.trim()) {
    catalogOpenRouter = { ids: new Set(), at: Date.now(), erro: 'sem-chave' }
    return
  }
  const script =
    "fetch('https://openrouter.ai/api/v1/models',{headers:{Authorization:'Bearer '+process.env.OPENROUTER_API_KEY}})" +
    ".then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()})" +
    ".then(j=>{const ids=(j.data||[]).map(x=>x.id);process.stdout.write(JSON.stringify(ids))})" +
    ".catch(e=>{process.stderr.write(String(e.message||e));process.exit(2)})"
  const r = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    timeout: 45000,
    windowsHide: true,
    env: process.env
  })
  if (r.status === 0 && r.stdout) {
    try {
      const ids = JSON.parse(r.stdout) as string[]
      catalogOpenRouter = { ids: new Set(ids), at: Date.now() }
      return
    } catch { /* fallthrough */ }
  }
  catalogOpenRouter = {
    ids: new Set(),
    at: Date.now(),
    erro: (r.stderr || r.stdout || 'falha catalogo').toString().slice(0, 160)
  }
}

export async function garantirCatalogoOpenRouter(): Promise<void> {
  if (catalogOpenRouter && Date.now() - catalogOpenRouter.at < CATALOG_TTL_MS) return
  const key = process.env.OPENROUTER_API_KEY || ''
  if (!key.trim()) {
    catalogOpenRouter = { ids: new Set(), at: Date.now(), erro: 'sem-chave' }
    return
  }
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 3000)
  try {
    const r = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: 'Bearer ' + key },
      signal: ac.signal
    })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const j = (await r.json()) as { data?: Array<{ id?: string }> }
    const ids = (j.data || []).map((x) => String(x.id || '')).filter(Boolean)
    catalogOpenRouter = { ids: new Set(ids), at: Date.now() }
  } catch (e) {
    catalogOpenRouter = { ids: new Set(), at: Date.now(), erro: String(e).slice(0, 160) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Status honesto do provider.
 * OpenRouter: exige chave + modelo presente no catálogo (cache 10 min).
 */
export function disponivel(cfg: ProviderConfig): StatusDisponivel {
  if (cfg.formato === 'codex-cli') {
    const status = statusCodexEmCache()
    if (!status?.installed) return 'indisponivel'
    return status.authenticated && status.available ? 'ok' : 'sem-chave'
  }
  if (cfg.formato === 'cursor-cli' || cfg.tipo === 'cli') {
    const bin = cfg.binario || resolverBinarioCursorAgent()
    if (!bin) return 'indisponivel'
    if (!cursorCliAprovadoNaSessao() && process.env.DG_CURSOR_CLI_OK !== '1') return 'indisponivel'
    return 'ok'
  }
  if (cfg.tipo === 'local') return 'ok'

  // online — cofre (id/apiKeyRef) ou env
  {
    const key =
      lerChave(cfg.id) ||
      (cfg.apiKeyRef ? lerChave(cfg.apiKeyRef) : null) ||
      (cfg.apiKeyEnv ? String(process.env[cfg.apiKeyEnv] || '').trim() : '')
    if (!key) return 'sem-chave'
  }
  if (cfg.formato === 'openai' && (cfg.baseUrl || '').includes('openrouter.ai')) {
    // Catalogo quente só quando já está em cache. Sem cache, segue: um 404 cai no próximo da fila.
    if (catalogOpenRouter?.erro === 'sem-chave') return 'sem-chave'
    if (!catalogOpenRouter || catalogOpenRouter.ids.size === 0) return 'ok'
    if (Date.now() - catalogOpenRouter.at >= CATALOG_TTL_MS) return 'ok'
    if (!catalogOpenRouter.ids.has(cfg.modelo)) return 'modelo-invalido'
  }
  return 'ok'
}

/** true só quando status === 'ok' (compat boolean em callers antigos). */
export function disponivelOk(cfg: ProviderConfig): boolean {
  return disponivel(cfg) === 'ok'
}

function cfg(
  partial: Omit<ProviderConfig, 'numPredict' | 'timeoutMs'> & {
    numPredict: number
    timeoutMs: number
  }
): ProviderConfig {
  return partial
}

/** Fila ordenada por tarefa. Online sem chave permanece (disponivel=false em runtime). */
function comPrefixoGlobal(tail: ProviderConfig[]): ProviderConfig[] {
  const visto = new Set<string>()
  const out: ProviderConfig[] = []
  const add = (p: ProviderConfig): void => {
    const chave = (p.baseUrl || '') + '|' + (p.modelo || '')
    if (visto.has(chave)) return
    visto.add(chave)
    out.push(p)
  }
  // Provedores do catálogo dinâmico primeiro (ordem menor = preferência maior).
  for (const p of filaGlobal()) add(configParaProvider(p))
  // Cauda legada preservada para compatibilidade (OpenRouter legado + cursor-cli + ollama).
  for (const p of tail) add(p)
  return out
}

function filaPadraoDeModelos(tarefa: Tarefa | string): ProviderConfig[] {
  const t = normalizarTarefa(String(tarefa))

  if (t === 'analise' || t === 'analisar') {
    return comPrefixoGlobal([
      cfg({
        id: 'openrouter:deepseek-v4-flash',
        tipo: 'online',
        formato: 'openai',
        modelo: 'deepseek/deepseek-v4-flash',
        baseUrl: OPENROUTER_BASE,
        apiKeyEnv: KEY_ENV,
        numPredict: 512,
        timeoutMs: 45_000
      }),
      cfg({
        id: 'ollama:qwen2.5-coder:3b',
        tipo: 'local',
        formato: 'ollama',
        modelo: 'qwen2.5-coder:3b',
        baseUrl: OLLAMA_BASE,
        numPredict: 512,
        timeoutMs: 180_000
      })
    ])
  }

  if (t === 'chat-rapido') {
    return comPrefixoGlobal([
      cfg({
        id: 'openrouter:deepseek-v4-flash',
        tipo: 'online',
        formato: 'openai',
        modelo: 'deepseek/deepseek-v4-flash',
        baseUrl: OPENROUTER_BASE,
        apiKeyEnv: KEY_ENV,
        numPredict: 400,
        timeoutMs: 20_000
      }),
      cfg({
        id: 'ollama:qwen2.5-coder:1.5b',
        tipo: 'local',
        formato: 'ollama',
        modelo: 'qwen2.5-coder:1.5b',
        baseUrl: OLLAMA_BASE,
        numPredict: 400,
        timeoutMs: 30_000
      })
    ])
  }

  if (t === 'chat') {
    return comPrefixoGlobal([
      cfg({
        id: 'openrouter:deepseek-v4-flash',
        tipo: 'online',
        formato: 'openai',
        modelo: 'deepseek/deepseek-v4-flash',
        baseUrl: OPENROUTER_BASE,
        apiKeyEnv: KEY_ENV,
        numPredict: 2048,
        timeoutMs: 90_000
      }),
      cfg({
        id: 'openrouter:deepseek-v3.2',
        tipo: 'online',
        formato: 'openai',
        modelo: 'deepseek/deepseek-v3.2',
        baseUrl: OPENROUTER_BASE,
        apiKeyEnv: KEY_ENV,
        numPredict: 2048,
        timeoutMs: 120_000
      }),
      cfgCursorCli(),
      cfg({
        id: 'ollama:qwen2.5-coder:3b',
        tipo: 'local',
        formato: 'ollama',
        modelo: 'qwen2.5-coder:3b',
        baseUrl: OLLAMA_BASE,
        numPredict: 1024,
        timeoutMs: 120_000
      }),
      cfg({
        id: 'ollama:qwen2.5-coder:14b',
        tipo: 'local',
        formato: 'ollama',
        modelo: 'qwen2.5-coder:14b',
        baseUrl: OLLAMA_BASE,
        numPredict: 1024,
        timeoutMs: 300_000
      })
    ])
  }

  if (t === 'raciocinio') {
    return comPrefixoGlobal([
      cfg({
        id: 'openrouter:deepseek-v4-flash',
        tipo: 'online',
        formato: 'openai',
        modelo: 'deepseek/deepseek-v4-flash',
        baseUrl: OPENROUTER_BASE,
        apiKeyEnv: KEY_ENV,
        numPredict: 1024,
        timeoutMs: 90_000
      }),
      cfg({
        id: 'openrouter:llama-3.3-70b',
        tipo: 'online',
        formato: 'openai',
        modelo: 'meta-llama/llama-3.3-70b-instruct',
        baseUrl: OPENROUTER_BASE,
        apiKeyEnv: KEY_ENV,
        numPredict: 2048,
        timeoutMs: 600_000
      }),
      cfg({
        id: 'ollama:llama3.2',
        tipo: 'local',
        formato: 'ollama',
        modelo: 'llama3.2:latest',
        baseUrl: OLLAMA_BASE,
        numPredict: 2048,
        timeoutMs: 600_000
      }),
      cfg({
        id: 'ollama:qwen2.5-coder:14b',
        tipo: 'local',
        formato: 'ollama',
        modelo: 'qwen2.5-coder:14b',
        baseUrl: OLLAMA_BASE,
        numPredict: 2048,
        timeoutMs: 600_000
      })
    ])
  }

  if (t === 'revisao') {
    return comPrefixoGlobal([
      cfg({
        id: 'openrouter:deepseek-v4-flash',
        tipo: 'online',
        formato: 'openai',
        modelo: 'deepseek/deepseek-v4-flash',
        baseUrl: OPENROUTER_BASE,
        apiKeyEnv: KEY_ENV,
        numPredict: 1024,
        timeoutMs: 90_000
      }),
      cfg({
        id: 'openrouter:deepseek-v3.2',
        tipo: 'online',
        formato: 'openai',
        modelo: 'deepseek/deepseek-v3.2',
        baseUrl: OPENROUTER_BASE,
        apiKeyEnv: KEY_ENV,
        numPredict: 1024,
        timeoutMs: 300_000
      }),
      cfgCursorCli(),
      cfg({
        id: 'ollama:qwen2.5-coder:7b',
        tipo: 'local',
        formato: 'ollama',
        modelo: 'qwen2.5-coder:7b',
        baseUrl: OLLAMA_BASE,
        numPredict: 1024,
        timeoutMs: 300_000
      })
    ])
  }

  // codigo: v4-flash → v3.2 → qwen → cursor-cli → ollama → ollama (A/B2)
  return comPrefixoGlobal([
    cfg({
      id: 'openrouter:deepseek-v4-flash',
      tipo: 'online',
      formato: 'openai',
      modelo: 'deepseek/deepseek-v4-flash',
      baseUrl: OPENROUTER_BASE,
      apiKeyEnv: KEY_ENV,
      numPredict: 1024,
      timeoutMs: 300_000
    }),
    cfg({
      id: 'openrouter:deepseek-v3.2',
      tipo: 'online',
      formato: 'openai',
      modelo: 'deepseek/deepseek-v3.2',
      baseUrl: OPENROUTER_BASE,
      apiKeyEnv: KEY_ENV,
      numPredict: 1024,
      timeoutMs: 300_000
    }),
    cfg({
      id: 'openrouter:qwen-2.5-coder-32b',
      tipo: 'online',
      formato: 'openai',
      modelo: 'qwen/qwen-2.5-coder-32b-instruct',
      baseUrl: OPENROUTER_BASE,
      apiKeyEnv: KEY_ENV,
      numPredict: 1024,
      timeoutMs: 300_000
    }),
    cfgCursorCli(),
    cfg({
      id: 'ollama:qwen2.5-coder:7b',
      tipo: 'local',
      formato: 'ollama',
      modelo: 'qwen2.5-coder:7b',
      baseUrl: OLLAMA_BASE,
      numPredict: 1024,
      timeoutMs: 300_000
    }),
    cfg({
      id: 'ollama:qwen2.5-coder:3b',
      tipo: 'local',
      formato: 'ollama',
      modelo: 'qwen2.5-coder:3b',
      baseUrl: OLLAMA_BASE,
      numPredict: 512,
      timeoutMs: 180_000
    })
  ])
}

/** A escolha explícita nunca altera a ordem automática já estabelecida. */
export function filaDeModelos(tarefa: Tarefa | string, opcoes?: OpcoesFila): ProviderConfig[] {
  const t = normalizarTarefa(String(tarefa))
  const padrao = filaPadraoDeModelos(t)
  if (!opcoes?.provider || opcoes.provider === 'auto') return padrao
  const locais = padrao.filter((p) => p.tipo === 'local' && p.formato === 'ollama' && !modeloPesadoDemais(t, p))
  return opcoes.provider === 'codex' ? [cfgCodexCli(), ...locais] : locais
}

/**
 * Filtra a fila para status === 'ok', loga pulos, e falha se nada sobrar.
 * Chat e analise nao carregam 7b/14b: o 14b permanece na lista-fonte e e pulado aqui.
 */
function modeloPesadoDemais(tarefa: TarefaModelo, p: ProviderConfig): boolean {
  if (p.tipo !== 'local') return false
  if (tarefa !== 'chat' && tarefa !== 'chat-rapido' && tarefa !== 'analise' && tarefa !== 'analisar') return false
  return /:(?:7b|14b)\b/.test(p.modelo)
}

export function primeiroProvider(tarefa: Tarefa | string, opcoes?: OpcoesFila): ProviderConfig | null {
  const t = normalizarTarefa(String(tarefa))
  for (const p of filaDeModelos(t, opcoes)) {
    if (modeloPesadoDemais(t, p)) continue
    if (disponivel(p) === 'ok') return p
  }
  return null
}

export function filaPronta(tarefa: Tarefa | string, opcoes?: OpcoesFila): ProviderConfig[] {
  const t = normalizarTarefa(String(tarefa))
  const bruta = filaDeModelos(t, opcoes)
  const ok: ProviderConfig[] = []
  const motivos: string[] = []
  for (const p of bruta) {
    if (modeloPesadoDemais(t, p)) {
      logStderr('[dg-fila] pulando ' + p.id + '/' + p.modelo + ' motivo=modelo-grande')
      motivos.push(p.id + '=modelo-grande')
      continue
    }
    // Free online raso: so como ultimo recurso (depois do Ollama)
    if (p.tipo === 'online' && /:free\b/i.test(p.modelo)) {
      logStderr('[dg-fila] adiando free ' + p.id + '/' + p.modelo)
      continue
    }
    const st = disponivel(p)
    if (st === 'ok') {
      ok.push(p)
    } else {
      logStderr('[dg-fila] pulando ' + p.id + '/' + p.modelo + ' motivo=' + st)
      motivos.push(p.id + '=' + st)
    }
  }
  // Free :free so no fim absoluto (depois de online bom + CLI + local)
  const freeOk: ProviderConfig[] = []
  for (const p of bruta) {
    if (modeloPesadoDemais(t, p)) continue
    if (!(p.tipo === 'online' && /:free\b/i.test(p.modelo))) continue
    if (disponivel(p) === 'ok') freeOk.push(p)
  }
  // Qualidade: online/CLI primeiro; local por ultimo; free raso depois do local
  const rank = (p: ProviderConfig): number => {
    if (p.tipo === 'local') return 2
    if (p.tipo === 'cli') return 1
    if (/:free\b/i.test(p.modelo)) return 3
    return 0
  }
  ok.sort((a, b) => rank(a) - rank(b))
  for (const p of freeOk) {
    if (!ok.some((x) => x.id === p.id && x.modelo === p.modelo)) ok.push(p)
  }
  if (ok.length === 0) {
    throw new Error(
      'Nenhum modelo disponivel para a tarefa ' + t + ': ' + (motivos.join('; ') || '(fila vazia)')
    )
  }
  return ok
}

export function limitesPorTarefa(tarefa: string): { num_predict: number; timeoutMs: number } {
  const t = normalizarTarefa(tarefa)
  try {
    const { limitesPorHardware } = require('../hardware-profile') as {
      limitesPorHardware: (tarefa: string) => { num_predict: number; timeoutMs: number } | null
    }
    const hw = limitesPorHardware(t)
    if (hw) return hw
  } catch {
    /* perfil opcional no boot */
  }
  if (t === 'analise' || t === 'analisar') return { num_predict: 900, timeoutMs: 180_000 }
  if (t === 'chat-rapido') return { num_predict: 700, timeoutMs: 120_000 }
  if (t === 'chat') return { num_predict: 1600, timeoutMs: 240_000 }
  if (t === 'codigo') return { num_predict: 1024, timeoutMs: 300_000 }
  const fila = filaDeModelos(t)
  const local = fila.find((p) => p.tipo === 'local') || fila[0]
  return { num_predict: local.numPredict, timeoutMs: local.timeoutMs }
}

function matchModelo(disponiveis: string[], pref: string): string | null {
  const exact = disponiveis.find((d) => d === pref)
  if (exact) return exact
  const prefix = disponiveis.find((d) => d.startsWith(pref))
  if (prefix) return prefix
  const base = pref.split(':')[0]
  const tag = pref.includes(':') ? pref.slice(pref.indexOf(':') + 1) : ''
  return (
    disponiveis.find((d) => {
      if (d === base || d.startsWith(base + ':')) {
        if (!tag) return true
        const rest = d.slice(base.length + 1)
        return rest === tag || rest.startsWith(tag)
      }
      return false
    }) || null
  )
}

function registrarSelecao(
  raiz: string,
  modelo: string,
  tarefa: TarefaModelo,
  motivo: string,
  origem: 'pipeline' | 'auditoria' | 'teste' = 'pipeline'
): void {
  try {
    const p = path.join(raiz, STATS_FILE)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    let data: {
      selecionados: Record<string, number>
      selecionadosPipeline: Record<string, number>
      ultimo: Record<string, string>
    } = { selecionados: {}, selecionadosPipeline: {}, ultimo: {} }
    if (fs.existsSync(p)) {
      try { data = { ...data, ...JSON.parse(fs.readFileSync(p, 'utf8')) } } catch { /* */ }
    }
    if (!data.selecionadosPipeline) data.selecionadosPipeline = {}
    data.selecionados[modelo] = (data.selecionados[modelo] || 0) + 1
    if (origem === 'pipeline') {
      data.selecionadosPipeline[modelo] = (data.selecionadosPipeline[modelo] || 0) + 1
    }
    data.ultimo[tarefa] = modelo
    data.ultimo.motivo = motivo
    data.ultimo.origem = origem
    data.ultimo.em = new Date().toISOString()
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8')
    dglog('[registry] selecao origem=' + origem + ' modelo=' + modelo + ' | ' + motivo)
  } catch { /* */ }
}

export function statsSelecao(raiz: string): {
  selecionados: Record<string, number>
  selecionadosPipeline: Record<string, number>
  ultimo: Record<string, string>
} {
  const p = path.join(raiz, STATS_FILE)
  try {
    if (!fs.existsSync(p)) return { selecionados: {}, selecionadosPipeline: {}, ultimo: {} }
    const data = JSON.parse(fs.readFileSync(p, 'utf8'))
    return {
      selecionados: data.selecionados || {},
      selecionadosPipeline: data.selecionadosPipeline || {},
      ultimo: data.ultimo || {}
    }
  } catch {
    return { selecionados: {}, selecionadosPipeline: {}, ultimo: {} }
  }
}

/**
 * Compat: retorna o primeiro provider disponivel da fila (local se online sem chave).
 */
export async function escolherModeloPorTarefa(
  tarefa: TarefaModelo | string,
  opts: EscolherModeloOpts = {}
): Promise<string> {
  const t = normalizarTarefa(String(tarefa))
  const fila = filaDeModelos(t, opts)
  const origem = opts.origem || 'pipeline'

  for (const p of fila) {
    if (modeloPesadoDemais(t, p)) {
      logStderr('[dg-fila] pulando ' + p.id + '/' + p.modelo + ' motivo=modelo-grande')
      continue
    }
    const st = disponivel(p)
    if (st !== 'ok') {
      logStderr('[dg-fila] pulando ' + p.id + '/' + p.modelo + ' motivo=' + st)
      continue
    }
    if (p.tipo === 'local') {
      const instalados = await listModelos()
      const hit = matchModelo(instalados, p.modelo)
      if (!hit) {
        dglog('[registry] pula ' + p.id + ' (modelo nao instalado)')
        continue
      }
      registrarSelecao(process.env.DG_ROOT || process.cwd(), hit, t, 'fila→' + p.id, origem)
      return hit
    }
    // online disponivel
    registrarSelecao(process.env.DG_ROOT || process.cwd(), p.modelo, t, 'fila→' + p.id, origem)
    return p.modelo
  }

  // fallback duro
  const fb = 'qwen2.5-coder:7b'
  registrarSelecao(process.env.DG_ROOT || process.cwd(), fb, t, 'fallback duro', origem)
  return fb
}

export async function escolherModelo(
  tarefa: TarefaModelo | string = 'codigo',
  opts: EscolherModeloOpts = {}
): Promise<string> {
  return escolherModeloPorTarefa(tarefa, opts)
}

/** Historico de failover para auditoria-providers.md */
export function appendFailoverLog(
  raiz: string,
  entrada: {
    tarefa: string
    tentou: string
    motivo: string
    resultado: 'ok' | 'falhou' | 'pulado'
    ms?: number
  }
): void {
  try {
    const p = path.join(raiz, '.dg-editor', 'auditoria-providers.md')
    fs.mkdirSync(path.dirname(p), { recursive: true })
    if (!fs.existsSync(p)) {
      fs.writeFileSync(
        p,
        '# Auditoria de providers\n\nHistorico de failover (sem chaves).\n\n',
        'utf8'
      )
    }
    const linha =
      `- ${new Date().toISOString()} | tarefa=${entrada.tarefa} | tentou=${entrada.tentou} | ` +
      `motivo=${entrada.motivo} | resultado=${entrada.resultado}` +
      (entrada.ms != null ? ` | ${entrada.ms}ms` : '') +
      '\n'
    fs.appendFileSync(p, linha, 'utf8')
  } catch { /* */ }
}
