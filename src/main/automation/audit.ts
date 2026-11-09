/**
 * Audit log append-only para automação (Etapa 1).
 * Arquivo: %APPDATA%\DG Editor\logs\automation-audit.jsonl
 * Hash encadeado: SHA-256(timestamp + comando + JSON(args) + hash_anterior)
 */
import { appendFile, mkdir, readFile, writeFile } from 'fs/promises'
import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { dglog } from '../dglog'

export interface EntradaAudit {
  timestamp: string
  comando: string
  args: Record<string, unknown>
  resultado: string
  duracao_ms: number
  hash_da_entrada_anterior: string
  hash_entrada?: string
  id_aprovacao: string | null
}

const CHAVES_SENSIVEIS = /password|passwd|pwd|token|secret|key|credential|auth/i

export function caminhoAudit(): string {
  const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
  return join(appData, 'DG Editor', 'logs', 'automation-audit.jsonl')
}

export function sanitizarArgs(valor: unknown): unknown {
  if (valor === null || valor === undefined) return valor
  if (Array.isArray(valor)) return valor.map(sanitizarArgs)
  if (typeof valor === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      out[k] = CHAVES_SENSIVEIS.test(k) ? '[REDACTED]' : sanitizarArgs(v)
    }
    return out
  }
  return valor
}

function canonicoArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, Object.keys(args).sort())
  } catch {
    return JSON.stringify(args)
  }
}

export function hashEntrada(
  timestamp: string,
  comando: string,
  args: Record<string, unknown>,
  hashAnterior: string
): string {
  const base = timestamp + comando + canonicoArgs(args) + hashAnterior
  return createHash('sha256').update(base, 'utf8').digest('hex')
}

async function ultimoHash(arquivo: string): Promise<string> {
  if (!existsSync(arquivo)) return 'GENESIS'
  try {
    const raw = await readFile(arquivo, 'utf8')
    const linhas = raw.trim().split(/\r?\n/).filter(Boolean)
    if (!linhas.length) return 'GENESIS'
    const ultima = JSON.parse(linhas[linhas.length - 1]) as EntradaAudit
    return ultima.hash_entrada || hashEntrada(
      ultima.timestamp,
      ultima.comando,
      ultima.args,
      ultima.hash_da_entrada_anterior
    )
  } catch (e) {
    dglog('[automation:audit] falha ao ler ultimo hash: ' + String(e))
    return 'GENESIS'
  }
}

let fila = Promise.resolve()

export function registrarEntrada(entrada: EntradaAudit): Promise<void> {
  const tarefa = async () => {
    const arquivo = caminhoAudit()
    await mkdir(dirname(arquivo), { recursive: true })
    const anterior = entrada.hash_da_entrada_anterior || await ultimoHash(arquivo)
    const completa: EntradaAudit = {
      ...entrada,
      args: (sanitizarArgs(entrada.args) as Record<string, unknown>) ?? {},
      hash_da_entrada_anterior: anterior,
      hash_entrada: hashEntrada(entrada.timestamp, entrada.comando, (sanitizarArgs(entrada.args) as Record<string, unknown>) ?? {}, anterior)
    }
    await appendFile(arquivo, JSON.stringify(completa) + '\n', 'utf8')
  }
  fila = fila.then(tarefa, tarefa)
  return fila
}

export async function verificarIntegridade(): Promise<{ valido: boolean; quebras: number[] }> {
  const arquivo = caminhoAudit()
  if (!existsSync(arquivo)) return { valido: true, quebras: [] }
  try {
    const raw = await readFile(arquivo, 'utf8')
    const linhas = raw.trim().split(/\r?\n/).filter(Boolean)
    const quebras: number[] = []
    let anterior = 'GENESIS'
    for (let i = 0; i < linhas.length; i++) {
      const e = JSON.parse(linhas[i]) as EntradaAudit
      const esperado = hashEntrada(e.timestamp, e.comando, e.args, anterior)
      const declarado = e.hash_entrada || esperado
      if (e.hash_da_entrada_anterior !== anterior || declarado !== esperado) {
        quebras.push(i)
      }
      anterior = declarado
    }
    return { valido: quebras.length === 0, quebras }
  } catch (e) {
    dglog('[automation:audit] falha verificarIntegridade: ' + String(e))
    return { valido: false, quebras: [-1] }
  }
}
