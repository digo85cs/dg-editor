/**
 * Catálogo de modelos (.dg-editor/modelos.json) + detecção Ollama + health.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { listarModelosOllama, ollamaPing } from './ollama'
import { dglog } from '../dglog'

export type Capacidade = 'chat' | 'codigo' | 'analise' | 'completo'
export type Porte = 'pequeno' | 'padrao' | 'grande' | 'longo'

export interface ModeloEntrada {
  id: string
  provider: 'ollama' | 'online'
  endpoint?: string
  contexto?: number
  capacidades: Capacidade[]
  porte: Porte
  ativo: boolean
  instalado?: boolean
  latenciaMs?: number | null
  status?: 'ok' | 'down' | 'desconhecido'
}

export interface CatalogoModelos {
  atualizadoEm: string | null
  ativo: string | null
  secundario: string | null
  roteamento: Record<string, Porte>
  modelos: ModeloEntrada[]
}

const DEFAULT_ROTEAMENTO: Record<string, Porte> = {
  completar: 'pequeno',
  explicar: 'grande',
  analisar: 'longo',
  chat: 'padrao',
  codigo: 'padrao'
}

function caminhoCatalogo(raiz: string): string {
  return join(raiz, '.dg-editor', 'modelos.json')
}

function porteDeNome(nome: string): Porte {
  const n = nome.toLowerCase()
  if (/70b|65b|34b|32b|large|long/.test(n)) return 'grande'
  if (/1b|1\.5b|3b|tiny|mini|small|0\.5/.test(n)) return 'pequeno'
  if (/32k|64k|128k|context|longctx/.test(n)) return 'longo'
  return 'padrao'
}

export function lerCatalogo(raiz: string): CatalogoModelos {
  const p = caminhoCatalogo(raiz)
  if (!existsSync(p)) {
    return {
      atualizadoEm: null,
      ativo: null,
      secundario: null,
      roteamento: { ...DEFAULT_ROTEAMENTO },
      modelos: []
    }
  }
  try {
    const j = JSON.parse(readFileSync(p, 'utf-8')) as CatalogoModelos
    j.roteamento = { ...DEFAULT_ROTEAMENTO, ...(j.roteamento || {}) }
    j.modelos = Array.isArray(j.modelos) ? j.modelos : []
    return j
  } catch {
    return {
      atualizadoEm: null,
      ativo: null,
      secundario: null,
      roteamento: { ...DEFAULT_ROTEAMENTO },
      modelos: []
    }
  }
}

export function salvarCatalogo(raiz: string, cat: CatalogoModelos): void {
  const dir = join(raiz, '.dg-editor')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  cat.atualizadoEm = new Date().toISOString()
  writeFileSync(caminhoCatalogo(raiz), JSON.stringify(cat, null, 2), 'utf-8')
}

/** Consulta Ollama /api/tags (uma chamada) e mescla no catálogo. */
export async function detectarModelosLocais(raiz: string): Promise<CatalogoModelos> {
  const cat = lerCatalogo(raiz)
  const tags = await listarModelosOllama()
  if (!tags) {
    for (const m of cat.modelos) {
      if (m.provider === 'ollama') {
        m.instalado = false
        m.status = 'down'
      }
    }
    salvarCatalogo(raiz, cat)
    return cat
  }
  const porId = new Map(cat.modelos.map((m) => [m.id, m]))
  for (const nome of tags) {
    const prev = porId.get(nome)
    if (prev) {
      prev.instalado = true
      prev.ativo = prev.ativo !== false
      prev.status = prev.status || 'desconhecido'
    } else {
      porId.set(nome, {
        id: nome,
        provider: 'ollama',
        endpoint: 'http://127.0.0.1:11434',
        contexto: 8192,
        capacidades: ['chat', 'codigo', 'analise'],
        porte: porteDeNome(nome),
        ativo: true,
        instalado: true,
        status: 'desconhecido',
        latenciaMs: null
      })
    }
  }
  for (const m of porId.values()) {
    if (m.provider === 'ollama' && !tags.includes(m.id)) {
      m.instalado = false
      m.status = 'down'
    }
  }
  cat.modelos = [...porId.values()]
  if (!cat.ativo) {
    const preferido = cat.modelos.find((m) => m.instalado && m.porte === 'padrao') || cat.modelos.find((m) => m.instalado)
    cat.ativo = preferido?.id || null
  }
  if (!cat.secundario) {
    const sec = cat.modelos.find((m) => m.instalado && m.id !== cat.ativo)
    cat.secundario = sec?.id || null
  }
  salvarCatalogo(raiz, cat)
  return cat
}

export async function healthCheckModelos(raiz: string): Promise<CatalogoModelos> {
  const cat = lerCatalogo(raiz)
  const t0 = Date.now()
  const ok = await ollamaPing()
  const lat = Date.now() - t0
  for (const m of cat.modelos) {
    if (m.provider !== 'ollama') continue
    m.latenciaMs = ok ? lat : null
    m.status = ok && m.instalado !== false ? 'ok' : 'down'
  }
  if (cat.ativo) {
    const ativo = cat.modelos.find((m) => m.id === cat.ativo)
    if (ativo && ativo.status === 'down' && cat.secundario) {
      const sec = cat.modelos.find((m) => m.id === cat.secundario && m.status === 'ok')
      if (sec) {
        dglog('[modelos] fallback ativo ' + cat.ativo + ' -> ' + sec.id)
        cat.ativo = sec.id
      }
    }
  }
  salvarCatalogo(raiz, cat)
  return cat
}

export function modeloParaTarefa(raiz: string, tarefa: string): string | null {
  const cat = lerCatalogo(raiz)
  const porte = cat.roteamento[tarefa] || cat.roteamento.codigo || 'padrao'
  const cand = cat.modelos.find(
    (m) => m.ativo && m.instalado !== false && m.status !== 'down' && m.porte === porte
  )
  if (cand) return cand.id
  if (cat.ativo) return cat.ativo
  return cat.modelos.find((m) => m.instalado)?.id || null
}

let healthTimer: ReturnType<typeof setInterval> | null = null

export function iniciarHealthPeriodico(raiz: string, ms = 10000): void {
  if (healthTimer) clearInterval(healthTimer)
  // Nao dispara health imediatamente — evita competir com terminal:create no boot
  healthTimer = setInterval(() => {
    void healthCheckModelos(raiz).catch((e) => dglog('[modelos] health falhou: ' + String(e)))
  }, ms)
}

export function pararHealthPeriodico(): void {
  if (healthTimer) clearInterval(healthTimer)
  healthTimer = null
}
