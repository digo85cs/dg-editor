/**
 * Registro de modelos (local Ollama + endpoints online opcionais).
 * escolherModelo(tarefa, opts) consulta este registry.
 *
 * Politica CPU (medicoes reais):
 *  1.5b 35.5 tok/s | 3b 18.8 | 7b 7.8 | 14b 3.8 | llama3.2 9.7
 * codigo → 7b padrao (teto pratico); 14b so com preferirQualidade
 * raciocinio → llama3.2; 14b se analise profunda / preferirQualidade
 * chat → 1.5b (mais rapido)
 */
import { listModelos } from './ollama'
import { dglog } from '../dglog'
import fs from 'fs'
import path from 'path'

export type TipoModelo = 'local' | 'online'
export type TarefaModelo = 'chat' | 'codigo' | 'raciocinio'

export interface ModeloReg {
  nome: string
  tipo: TipoModelo
  contexto: number
  forca: number // 1-10
  tarefas: TarefaModelo[]
  endpoint?: string
  /** tok/s medido em CPU (referencia) */
  tokS?: number
}

export interface EscolherModeloOpts {
  /** true → permite 14b em codigo/raciocinio */
  preferirQualidade?: boolean
  /** texto do pedido para detectar "analise profunda" */
  pedido?: string
}

const REGISTRO_BASE: ModeloReg[] = [
  { nome: 'qwen2.5-coder:1.5b', tipo: 'local', contexto: 4096, forca: 3, tokS: 35.5, tarefas: ['chat', 'codigo'] },
  { nome: 'qwen2.5-coder:3b', tipo: 'local', contexto: 8192, forca: 5, tokS: 18.8, tarefas: ['chat', 'codigo'] },
  { nome: 'qwen2.5-coder:7b', tipo: 'local', contexto: 8192, forca: 7, tokS: 7.8, tarefas: ['codigo', 'raciocinio'] },
  { nome: 'qwen2.5-coder:14b', tipo: 'local', contexto: 8192, forca: 9, tokS: 3.8, tarefas: ['codigo', 'raciocinio'] },
  { nome: 'llama3.2', tipo: 'local', contexto: 4096, forca: 5, tokS: 9.7, tarefas: ['chat', 'raciocinio'] }
]

/** Preferencia de codigo em CPU: 7b > 3b > 1.5b; 14b so com override */
const ORDEM_CODIGO = ['qwen2.5-coder:7b', 'qwen2.5-coder:3b', 'qwen2.5-coder:1.5b']
const ORDEM_CODIGO_QUALIDADE = ['qwen2.5-coder:14b', 'qwen2.5-coder:7b', 'qwen2.5-coder:3b', 'qwen2.5-coder:1.5b']
const ORDEM_CHAT = ['qwen2.5-coder:1.5b', 'qwen2.5-coder:3b', 'llama3.2']
const ORDEM_RACIOCINIO = ['llama3.2', 'qwen2.5-coder:7b', 'qwen2.5-coder:3b']
const ORDEM_RACIOCINIO_PROFUNDO = ['qwen2.5-coder:14b', 'qwen2.5-coder:7b', 'llama3.2']

let extras: ModeloReg[] = []

/** Contagem de selecoes por modelo (persistida) — para auditoria do 14b. */
const STATS_FILE = '.dg-editor/modelos-stats.json'

export function listarRegistry(): ModeloReg[] {
  return [...REGISTRO_BASE, ...extras]
}

export function registrarModelo(m: ModeloReg): void {
  extras = extras.filter((x) => x.nome !== m.nome)
  extras.push(m)
}

function normalizarTarefa(tarefa: string): TarefaModelo {
  const t = (tarefa || 'codigo').toLowerCase()
  if (t === 'chat' || t === 'simples') return 'chat'
  if (t === 'raciocinio' || t === 'estrategia') return 'raciocinio'
  return 'codigo'
}

function instalado(disponiveis: string[], nome: string): boolean {
  return matchModelo(disponiveis, nome) !== null
}

/** Resolve nome do registry para o tag real do Ollama (ex: llama3.2 → llama3.2:latest). */
function matchModelo(disponiveis: string[], pref: string): string | null {
  const exact = disponiveis.find((d) => d === pref)
  if (exact) return exact
  const prefix = disponiveis.find((d) => d.startsWith(pref))
  if (prefix) return prefix
  const base = pref.split(':')[0]
  const tag = pref.includes(':') ? pref.slice(pref.indexOf(':') + 1) : ''
  const byTag = disponiveis.find((d) => {
    if (d === base || d.startsWith(base + ':')) {
      if (!tag) return true
      const rest = d.slice(base.length + 1)
      return rest === tag || rest.startsWith(tag)
    }
    return false
  })
  return byTag || null
}

function primeiroDisponivel(ordem: string[], disponiveis: string[]): string | null {
  for (const pref of ordem) {
    const hit = matchModelo(disponiveis, pref)
    if (hit) return hit
  }
  return null
}

function pedidoProfundo(pedido?: string): boolean {
  if (!pedido) return false
  return /(analise profunda|an[aá]lise profunda|arquitet|estrat[eé]g|refator.*grande|auditoria completa|preferirQualidade|14b)/i.test(pedido)
}

function registrarSelecao(raiz: string, modelo: string, tarefa: TarefaModelo, motivo: string): void {
  try {
    const p = path.join(raiz, STATS_FILE)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    let data: { selecionados: Record<string, number>; ultimo: Record<string, string> } = {
      selecionados: {},
      ultimo: {}
    }
    if (fs.existsSync(p)) {
      try { data = JSON.parse(fs.readFileSync(p, 'utf8')) } catch { /* ignore */ }
    }
    data.selecionados[modelo] = (data.selecionados[modelo] || 0) + 1
    data.ultimo[tarefa] = modelo
    data.ultimo.motivo = motivo
    data.ultimo.em = new Date().toISOString()
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8')
  } catch { /* nao bloqueia */ }
}

export function statsSelecao(raiz: string): { selecionados: Record<string, number>; ultimo: Record<string, string> } {
  const p = path.join(raiz, STATS_FILE)
  try {
    if (!fs.existsSync(p)) return { selecionados: {}, ultimo: {} }
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return { selecionados: {}, ultimo: {} }
  }
}

/**
 * Escolhe modelo por tarefa.
 * Exposto tambem como escolherModelo em ollama.ts (mesma assinatura).
 */
export async function escolherModeloPorTarefa(
  tarefa: TarefaModelo | string,
  opts: EscolherModeloOpts = {}
): Promise<string> {
  const t = normalizarTarefa(String(tarefa))
  const disponiveis = await listModelos()
  const qualidade = !!opts.preferirQualidade || (t === 'raciocinio' && pedidoProfundo(opts.pedido))

  let ordem: string[]
  let motivo: string

  if (t === 'chat') {
    ordem = ORDEM_CHAT
    motivo = 'chat: mais rapido (1.5b ~35 tok/s)'
  } else if (t === 'codigo') {
    if (qualidade) {
      ordem = ORDEM_CODIGO_QUALIDADE
      motivo = 'codigo + preferirQualidade: 14b se disponivel'
    } else {
      ordem = ORDEM_CODIGO
      motivo = 'codigo: 7b padrao (equilibrio 7.8 tok/s); 3b fallback'
    }
  } else {
    // raciocinio
    if (qualidade) {
      ordem = ORDEM_RACIOCINIO_PROFUNDO
      motivo = 'raciocinio profundo: 14b se disponivel'
    } else {
      ordem = ORDEM_RACIOCINIO
      motivo = 'raciocinio: llama3.2 padrao (~9.7 tok/s)'
    }
  }

  let escolhido = primeiroDisponivel(ordem, disponiveis)
  if (!escolhido) {
    // fallback: qualquer do registry para a tarefa, por forca
    const candidatos = listarRegistry()
      .filter((m) => m.tipo === 'local' && m.tarefas.includes(t))
      .filter((m) => instalado(disponiveis, m.nome))
      .sort((a, b) => (t === 'chat' ? a.forca - b.forca : b.forca - a.forca))
    escolhido = candidatos[0]
      ? (disponiveis.find((d) => d === candidatos[0].nome || d.startsWith(candidatos[0].nome)) || candidatos[0].nome)
      : (t === 'chat' ? 'qwen2.5-coder:1.5b' : 'qwen2.5-coder:7b')
    motivo += ' | fallback registry'
  }

  dglog('[registry] escolherModelo tarefa=' + t + ' → ' + escolhido + ' | ' + motivo +
    (qualidade ? ' | preferirQualidade' : ''))
  registrarSelecao(process.env.DG_ROOT || process.cwd(), escolhido, t, motivo)
  return escolhido
}

/** Alias pedido pelo spec da Fase A */
export async function escolherModelo(
  tarefa: TarefaModelo | string = 'codigo',
  opts: EscolherModeloOpts = {}
): Promise<string> {
  return escolherModeloPorTarefa(tarefa, opts)
}

export function limitesPorTarefa(tarefa: string): { num_predict: number; timeoutMs: number } {
  const t = normalizarTarefa(tarefa)
  if (t === 'chat') return { num_predict: 512, timeoutMs: 120_000 }
  if (t === 'raciocinio') return { num_predict: 2048, timeoutMs: 600_000 }
  return { num_predict: 1024, timeoutMs: 300_000 }
}
