/**
 * Catálogo de modelos (.dg-editor/modelos.default.json + modelos.json runtime)
 * + detecção Ollama + health + fallback leve.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import { listarModelosOllama, ollamaPing, medirLatenciaModelo, consultarVersoesRemotas } from './ollama'
import { dglog } from '../dglog'

export type Capacidade = 'chat' | 'codigo' | 'analise' | 'completo' | 'embedding'
export type Porte = 'pequeno' | 'padrao' | 'grande' | 'longo'
export type TipoModelo = 'chat' | 'embedding' | 'codigo'

export interface ModeloEntrada {
  id: string
  provider: 'ollama' | 'online'
  endpoint?: string
  tipo: TipoModelo
  contexto?: number
  capacidades: Capacidade[]
  porte: Porte
  ativo: boolean
  instalado?: boolean
  latenciaMs?: number | null
  latenciaMedidaEm?: string | null
  atualizadoDisponivel?: boolean
  status?: 'ok' | 'down' | 'desconhecido'
}

export interface CatalogoModelos {
  versao?: number
  atualizadoEm: string | null
  ativo: string | null
  secundario: string | null
  roteamento: Record<string, Porte>
  modelos: ModeloEntrada[]
}

const DEFAULT_ROTEAMENTO: Record<string, Porte> = {
  completar: 'pequeno',
  explicar: 'grande',
  analise: 'grande',
  analisar: 'longo',
  chat: 'padrao',
  codigo: 'padrao'
}

const PORTE_RANK: Record<string, number> = {
  pequeno: 0,
  padrao: 1,
  grande: 2,
  longo: 3
}

/** Curadoria embutida — idêntica a .dg-editor/modelos.default.json */
export const CATALOGO_PADRAO: CatalogoModelos = {
  versao: 1,
  atualizadoEm: null,
  ativo: 'llama3.2:latest',
  secundario: 'qwen2.5-coder:3b',
  roteamento: {
    completar: 'pequeno',
    explicar: 'grande',
    analise: 'grande',
    chat: 'padrao',
    codigo: 'padrao'
  },
  modelos: [
    {
      id: 'llama3.2:latest',
      provider: 'ollama',
      endpoint: 'http://127.0.0.1:11434',
      tipo: 'chat',
      contexto: 8192,
      capacidades: ['chat', 'analise'],
      porte: 'pequeno',
      ativo: true
    },
    {
      id: 'qwen2.5-coder:1.5b',
      provider: 'ollama',
      endpoint: 'http://127.0.0.1:11434',
      tipo: 'codigo',
      contexto: 8192,
      capacidades: ['codigo', 'chat'],
      porte: 'pequeno',
      ativo: true
    },
    {
      id: 'qwen2.5-coder:3b',
      provider: 'ollama',
      endpoint: 'http://127.0.0.1:11434',
      tipo: 'codigo',
      contexto: 8192,
      capacidades: ['codigo', 'chat'],
      porte: 'pequeno',
      ativo: true
    },
    {
      id: 'qwen2.5-coder:7b',
      provider: 'ollama',
      endpoint: 'http://127.0.0.1:11434',
      tipo: 'codigo',
      contexto: 8192,
      capacidades: ['codigo', 'chat', 'analise'],
      porte: 'padrao',
      ativo: true
    },
    {
      id: 'qwen2.5-coder:14b',
      provider: 'ollama',
      endpoint: 'http://127.0.0.1:11434',
      tipo: 'codigo',
      contexto: 8192,
      capacidades: ['codigo', 'chat', 'analise'],
      porte: 'grande',
      ativo: true
    },
    {
      id: 'nomic-embed-text:latest',
      provider: 'ollama',
      endpoint: 'http://127.0.0.1:11434',
      tipo: 'embedding',
      contexto: 8192,
      capacidades: ['embedding'],
      porte: 'pequeno',
      ativo: true
    }
  ]
}

function caminhoCatalogo(raiz: string): string {
  return join(raiz, '.dg-editor', 'modelos.json')
}

function caminhoDefault(raiz: string): string {
  return join(raiz, '.dg-editor', 'modelos.default.json')
}

function porteDeNome(nome: string): Porte {
  const n = nome.toLowerCase()
  if (/70b|65b|34b|32b|27b|14b|13b|large/.test(n)) return 'grande'
  if (/1b|1\.5b|3b|tiny|mini|small|0\.5/.test(n)) return 'pequeno'
  if (/32k|64k|128k|context|longctx/.test(n)) return 'longo'
  return 'padrao'
}

export function inferirTipo(nome: string): TipoModelo {
  const n = nome.toLowerCase()
  if (/embed|embedding/.test(n)) return 'embedding'
  if (/coder|code/.test(n)) return 'codigo'
  return 'chat'
}

function capacidadesParaTipo(tipo: TipoModelo): Capacidade[] {
  if (tipo === 'embedding') return ['embedding']
  if (tipo === 'codigo') return ['codigo', 'chat', 'analise']
  return ['chat', 'codigo', 'analise']
}

function normalizarModelo(raw: Partial<ModeloEntrada> & { id: string }): ModeloEntrada {
  const tipo = raw.tipo || inferirTipo(raw.id)
  const caps =
    Array.isArray(raw.capacidades) && raw.capacidades.length > 0
      ? (raw.capacidades as Capacidade[])
      : capacidadesParaTipo(tipo)
  const capsFinais: Capacidade[] =
    tipo === 'embedding' ? ['embedding'] : caps.filter((c) => c !== 'embedding')
  return {
    id: raw.id,
    provider: raw.provider === 'online' ? 'online' : 'ollama',
    endpoint: raw.endpoint,
    tipo,
    contexto: raw.contexto ?? 8192,
    capacidades: capsFinais,
    porte: raw.porte || porteDeNome(raw.id),
    ativo: raw.ativo !== false,
    instalado: raw.instalado,
    latenciaMs: raw.latenciaMs ?? null,
    latenciaMedidaEm: raw.latenciaMedidaEm ?? null,
    atualizadoDisponivel: raw.atualizadoDisponivel === true,
    status: raw.status || 'desconhecido'
  }
}

/** Marca atualizadoDisponivel no catálogo (não baixa). */
export async function marcarVersoesRemotas(raiz: string): Promise<CatalogoModelos> {
  const cat = lerCatalogo(raiz)
  const ids = cat.modelos.filter((m) => m.provider === 'ollama').map((m) => m.id)
  if (ids.length === 0) return cat
  const infos = await consultarVersoesRemotas(ids)
  for (const m of cat.modelos) {
    const info = infos[m.id]
    if (info) m.atualizadoDisponivel = !!info.atualizadoDisponivel
  }
  salvarCatalogo(raiz, cat)
  return cat
}

function cloneCatalogo(src: CatalogoModelos): CatalogoModelos {
  return {
    versao: src.versao ?? 1,
    atualizadoEm: src.atualizadoEm,
    ativo: src.ativo,
    secundario: src.secundario,
    roteamento: { ...DEFAULT_ROTEAMENTO, ...(src.roteamento || {}) },
    modelos: (src.modelos || []).map((m) => normalizarModelo(m))
  }
}

function lerArquivoCatalogo(p: string): CatalogoModelos | null {
  if (!existsSync(p)) return null
  try {
    const j = JSON.parse(readFileSync(p, 'utf-8')) as CatalogoModelos
    if (!j || typeof j !== 'object') return null
    j.roteamento = { ...DEFAULT_ROTEAMENTO, ...(j.roteamento || {}) }
    j.modelos = Array.isArray(j.modelos) ? j.modelos.map((m) => normalizarModelo(m)) : []
    return j
  } catch {
    return null
  }
}

/** Mescla default + runtime (runtime sobrepõe campo a campo / por id). */
function mesclarCatalogos(base: CatalogoModelos, over: CatalogoModelos | null): CatalogoModelos {
  if (!over) return cloneCatalogo(base)
  const porId = new Map<string, ModeloEntrada>()
  for (const m of base.modelos) porId.set(m.id, normalizarModelo(m))
  for (const m of over.modelos || []) {
    const prev = porId.get(m.id)
    porId.set(m.id, normalizarModelo(prev ? { ...prev, ...m, id: m.id } : m))
  }
  return {
    versao: over.versao ?? base.versao ?? 1,
    atualizadoEm: over.atualizadoEm ?? base.atualizadoEm,
    ativo: over.ativo !== undefined && over.ativo !== null ? over.ativo : base.ativo,
    secundario: over.secundario !== undefined && over.secundario !== null ? over.secundario : base.secundario,
    roteamento: { ...DEFAULT_ROTEAMENTO, ...(base.roteamento || {}), ...(over.roteamento || {}) },
    modelos: [...porId.values()]
  }
}

export function lerCatalogo(raiz: string): CatalogoModelos {
  const doArquivo = lerArquivoCatalogo(caminhoDefault(raiz))
  const padrao = doArquivo ? cloneCatalogo(doArquivo) : cloneCatalogo(CATALOGO_PADRAO)
  const runtime = lerArquivoCatalogo(caminhoCatalogo(raiz))
  return mesclarCatalogos(padrao, runtime)
}

export function salvarCatalogo(raiz: string, cat: CatalogoModelos): void {
  const dir = join(raiz, '.dg-editor')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  cat.atualizadoEm = new Date().toISOString()
  writeFileSync(caminhoCatalogo(raiz), JSON.stringify(cat, null, 2), 'utf-8')
}

/** Compara CATALOGO_PADRAO (constante) com .dg-editor/modelos.default.json. */
export function compararPadraoComArquivo(raiz: string): { igual: boolean; diff: string[] } {
  const diff: string[] = []
  const p = caminhoDefault(raiz)
  if (!existsSync(p)) {
    return { igual: false, diff: ['arquivo ausente: modelos.default.json'] }
  }
  let arquivo: CatalogoModelos
  try {
    arquivo = JSON.parse(readFileSync(p, 'utf-8')) as CatalogoModelos
  } catch {
    return { igual: false, diff: ['JSON invalido em modelos.default.json'] }
  }
  const emb = JSON.parse(JSON.stringify(CATALOGO_PADRAO)) as CatalogoModelos

  const cmp = (chave: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      diff.push(chave + ': padrao=' + JSON.stringify(a) + ' arquivo=' + JSON.stringify(b))
    }
  }
  cmp('versao', emb.versao ?? 1, arquivo.versao ?? 1)
  cmp('atualizadoEm', emb.atualizadoEm, arquivo.atualizadoEm)
  cmp('ativo', emb.ativo, arquivo.ativo)
  cmp('secundario', emb.secundario, arquivo.secundario)
  cmp('roteamento', emb.roteamento || {}, arquivo.roteamento || {})

  const embIds = new Set((emb.modelos || []).map((m) => m.id))
  const arqIds = new Set((arquivo.modelos || []).map((m) => m.id))
  for (const id of embIds) {
    if (!arqIds.has(id)) diff.push('modelo so no padrao: ' + id)
  }
  for (const id of arqIds) {
    if (!embIds.has(id)) diff.push('modelo so no arquivo: ' + id)
  }
  const campos = ['provider', 'endpoint', 'tipo', 'contexto', 'capacidades', 'porte', 'ativo'] as const
  for (const id of embIds) {
    if (!arqIds.has(id)) continue
    const a = (emb.modelos || []).find((m) => m.id === id)!
    const b = (arquivo.modelos || []).find((m) => m.id === id)!
    for (const c of campos) {
      cmp('modelo[' + id + '].' + c, a[c], b[c])
    }
  }
  return { igual: diff.length === 0, diff }
}

export function validarCatalogo(cat: CatalogoModelos): { ok: boolean; problemas: string[] } {
  const problemas: string[] = []
  const porId = new Map(cat.modelos.map((m) => [m.id, m]))

  if (cat.ativo && !porId.has(cat.ativo)) {
    problemas.push('ativo aponta para id inexistente: ' + cat.ativo)
  }
  if (cat.secundario && !porId.has(cat.secundario)) {
    problemas.push('secundario aponta para id inexistente: ' + cat.secundario)
  }

  if (cat.ativo && cat.secundario) {
    const a = porId.get(cat.ativo)
    const s = porId.get(cat.secundario)
    if (a && s) {
      const ra = PORTE_RANK[a.porte] ?? 1
      const rs = PORTE_RANK[s.porte] ?? 1
      if (rs > ra) {
        problemas.push(
          'secundario mais pesado que ativo: ' + s.id + ' (' + s.porte + ') > ' + a.id + ' (' + a.porte + ')'
        )
      }
    }
  }

  for (const m of cat.modelos) {
    if (m.tipo === 'embedding' && m.capacidades.some((c) => c === 'chat' || c === 'codigo' || c === 'analise')) {
      problemas.push('modelo embedding com capacidades de chat: ' + m.id)
    }
  }

  return { ok: problemas.length === 0, problemas }
}

function emitirFallback(de: string, para: string, motivo: string): void {
  dglog('[modelos] fallback ativo ' + de + ' -> ' + para + ' (' + motivo + ')')
  try {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        w.webContents.send('brain:fallback', { de, para, motivo })
      }
    }
  } catch (e) {
    dglog('[modelos] brain:fallback send falhou: ' + String(e))
  }
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
      if (!prev.tipo) prev.tipo = inferirTipo(nome)
    } else {
      const tipo = inferirTipo(nome)
      porId.set(
        nome,
        normalizarModelo({
          id: nome,
          provider: 'ollama',
          endpoint: 'http://127.0.0.1:11434',
          tipo,
          contexto: 8192,
          capacidades: capacidadesParaTipo(tipo),
          porte: porteDeNome(nome),
          ativo: true,
          instalado: true,
          status: 'desconhecido',
          latenciaMs: null
        })
      )
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
    const preferido =
      cat.modelos.find((m) => m.instalado && m.tipo !== 'embedding' && m.porte === 'padrao') ||
      cat.modelos.find((m) => m.instalado && m.tipo !== 'embedding')
    cat.ativo = preferido?.id || null
  }
  if (!cat.secundario) {
    const ativoM = cat.modelos.find((m) => m.id === cat.ativo)
    const rankAtivo = ativoM ? PORTE_RANK[ativoM.porte] ?? 1 : 1
    const sec = cat.modelos.find(
      (m) =>
        m.instalado &&
        m.id !== cat.ativo &&
        m.tipo !== 'embedding' &&
        (PORTE_RANK[m.porte] ?? 1) <= rankAtivo
    )
    cat.secundario = sec?.id || null
  }
  salvarCatalogo(raiz, cat)
  return cat
}

async function mapPool<T>(itens: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let idx = 0
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, itens.length || 1)) }, async () => {
    while (idx < itens.length) {
      const i = idx++
      await fn(itens[i])
    }
  })
  await Promise.all(workers)
}

export async function healthCheckModelos(raiz: string): Promise<CatalogoModelos> {
  const cat = lerCatalogo(raiz)
  const ok = await ollamaPing()
  for (const m of cat.modelos) {
    if (m.provider !== 'ollama') continue
    m.status = ok && m.instalado !== false ? 'ok' : 'down'
    if (!ok || m.instalado === false) {
      m.latenciaMs = null
    }
  }

  if (ok) {
    const alvos = cat.modelos.filter((m) => m.provider === 'ollama' && m.instalado !== false)
    await mapPool(alvos, 2, async (m) => {
      const r = await medirLatenciaModelo(m.id, 8000)
      if (r.ok) {
        m.latenciaMs = r.ms
        m.latenciaMedidaEm = new Date().toISOString()
        m.status = 'ok'
      } else {
        m.latenciaMs = r.ms ?? null
        m.latenciaMedidaEm = new Date().toISOString()
        // generate falhou (ex.: embedding) — mantém status ok se ollama está no ar
        if (m.tipo === 'embedding') m.status = 'ok'
        else m.status = 'down'
      }
    })
  }

  if (cat.ativo) {
    const ativo = cat.modelos.find((m) => m.id === cat.ativo)
    if (ativo && ativo.status === 'down' && cat.secundario && cat.ativo !== cat.secundario) {
      const sec = cat.modelos.find((m) => m.id === cat.secundario)
      if (sec) {
        const pode =
          sec.status === 'ok' || (PORTE_RANK[sec.porte] ?? 1) <= (PORTE_RANK[ativo.porte] ?? 1)
        if (pode) {
          emitirFallback(cat.ativo, sec.id, ok ? 'primario_down' : 'ollama_down')
          cat.ativo = sec.id
        }
      }
    }
  }
  salvarCatalogo(raiz, cat)
  return cat
}

const TAREFAS_SEM_EMBEDDING = new Set([
  'chat',
  'explicar',
  'analise',
  'analisar',
  'completar',
  'codigo'
])

export function modeloParaTarefa(raiz: string, tarefa: string): string | null {
  const cat = lerCatalogo(raiz)
  const excluirEmbedding = TAREFAS_SEM_EMBEDDING.has(tarefa) || !tarefa
  const porte = cat.roteamento[tarefa] || cat.roteamento.codigo || 'padrao'
  const cand = cat.modelos.find(
    (m) =>
      m.ativo &&
      m.instalado !== false &&
      m.status !== 'down' &&
      m.porte === porte &&
      (!excluirEmbedding || m.tipo !== 'embedding')
  )
  if (cand) return cand.id
  if (cat.ativo) {
    const a = cat.modelos.find((m) => m.id === cat.ativo)
    if (a && (!excluirEmbedding || a.tipo !== 'embedding')) return cat.ativo
  }
  const qualquer = cat.modelos.find(
    (m) => m.instalado && (!excluirEmbedding || m.tipo !== 'embedding')
  )
  return qualquer?.id || null
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
