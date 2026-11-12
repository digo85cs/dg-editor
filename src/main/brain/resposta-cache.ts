/**
 * Cache de respostas de LLM por hash do (modelo + mensagens + tools).
 * Armazena em disco em .dg-editor/resposta-cache/<hash>.json para evitar
 * reprocessar prompts iguais e reduzir custo/latencia.
 * Sem dependencias externas: usa crypto nativa do Node e fs.
 */
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { resolverRaizProjeto } from '../paths'

const CACHE_DIR_NAME = 'resposta-cache'
const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias

function cacheDir(): string {
  return join(resolverRaizProjeto(), '.dg-editor', CACHE_DIR_NAME)
}

function hashEntrada(modelo: string, mensagens: unknown, tools?: unknown): string {
  const payload = JSON.stringify({ modelo, mensagens, tools: tools || null })
  return createHash('sha256').update(payload).digest('hex')
}

function arquivoCache(hash: string): string {
  return join(cacheDir(), hash + '.json')
}

interface CacheEntry {
  modelo: string
  texto: string
  criacao: number
  ttlMs: number
}

export function lerRespostaCache(
  modelo: string,
  mensagens: unknown,
  tools?: unknown
): { texto: string } | null {
  try {
    const hash = hashEntrada(modelo, mensagens, tools)
    const arq = arquivoCache(hash)
    if (!existsSync(arq)) return null
    const bruto = readFileSync(arq, 'utf8')
    const entry = JSON.parse(bruto) as CacheEntry
    if (!entry || !entry.texto) return null
    const agora = Date.now()
    if (agora - entry.criacao > entry.ttlMs) {
      try { require('fs').unlinkSync(arq) } catch { /* */ }
      return null
    }
    return { texto: entry.texto }
  } catch {
    return null
  }
}

export function gravarRespostaCache(
  modelo: string,
  mensagens: unknown,
  texto: string,
  tools?: unknown,
  ttlMs?: number
): void {
  try {
    const dir = cacheDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const hash = hashEntrada(modelo, mensagens, tools)
    const entry: CacheEntry = {
      modelo,
      texto,
      criacao: Date.now(),
      ttlMs: ttlMs ?? TTL_MS,
    }
    writeFileSync(arquivoCache(hash), JSON.stringify(entry, null, 2), 'utf8')
  } catch {
    /* cache na e obrigatorio; falha silenciosa */
  }
}
export function limparCacheRespostas(maiorQueDias?: number): { removidos: number } {
  const dir = cacheDir()
  if (!existsSync(dir)) return { removidos: 0 }
  const arquivos = require('fs').readdirSync(dir).filter((f: string) => f.endsWith('.json'))
  const limite = maiorQueDias ? maiorQueDias * 24 * 60 * 60 * 1000 : TTL_MS
  const agora = Date.now()
  let removidos = 0
  for (const f of arquivos) {
    try {
      const entry = JSON.parse(readFileSync(join(dir, f), 'utf8')) as CacheEntry
      if (agora - entry.criacao > limite) {
        require('fs').unlinkSync(join(dir, f))
        removidos++
      }
    } catch {
      try { require('fs').unlinkSync(join(dir, f)) } catch { /* */ }
      removidos++
    }
  }
  return { removidos }
}

/** Apenas testes: limpa o diretorio de cache de respostas. */
export function __resetarCacheParaTestes(): void {
  const dir = cacheDir()
  if (!existsSync(dir)) return
  try {
    for (const f of require('fs').readdirSync(dir)) {
      if (f.endsWith('.json')) require('fs').unlinkSync(join(dir, f))
    }
  } catch { /* */ }
}
