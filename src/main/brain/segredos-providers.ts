/**
 * Cofre de chaves de provedores de IA (FASE 1).
 * Reutiliza o padrão de src/main/openclaw/secrets.ts: safeStorage + userData.
 * Arquivo: <userData>/providers-keys.bin
 * Formato: JSON { versao: 1, chaves: Record<string, string> } criptografado.
 * Nunca loga o valor da chave; máscara: primeiros 4 + '****'.
 */
import { safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { dglog } from '../dglog'
import { listarProviders, obterProvider } from './providers-registry'
import { userDataDir } from '../paths'

const ARQUIVO = join(userDataDir(), 'providers-keys.bin')
const VERSAO = 1

function mascarar(chave: string | undefined | null): string {
  if (!chave) return '—'
  return chave.slice(0, 4) + '****'
}

function dglogSeguro(mensagem: string, chave?: string | null): void {
  dglog(mensagem + (chave ? ' chave=' + mascarar(chave) : ''))
}

function lerArquivoCofre(): { versao: number; chaves: Record<string, string> } | null {
  if (!existsSync(ARQUIVO)) return null
  try {
    const bruto = readFileSync(ARQUIVO)
    const texto = safeStorage.decryptString(bruto)
    const j = JSON.parse(texto) as { versao?: number; chaves?: Record<string, string> }
    if (!j || typeof j !== 'object') return null
    return { versao: j.versao ?? 1, chaves: typeof j.chaves === 'object' && j.chaves ? j.chaves : {} }
  } catch {
    return null
  }
}

function gravarArquivoCofre(dados: { versao: number; chaves: Record<string, string> }): void {
  const dir = userDataDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const texto = JSON.stringify(dados)
  const buf = safeStorage.encryptString(texto)
  writeFileSync(ARQUIVO, buf)
}

export function chaveConfigurada(id: string): boolean {
  const cofre = lerArquivoCofre()
  if (cofre?.chaves && typeof cofre.chaves[id] === 'string' && cofre.chaves[id].trim().length > 0) {
    return true
  }
  const p = obterProvider(id)
  if (p?.apiKeyEnv) {
    const v = process.env[p.apiKeyEnv]
    return typeof v === 'string' && v.trim().length > 0
  }
  return false
}

export function salvarChave(id: string, chave: string): { ok: boolean; erro?: string } {
  if (!chave || typeof chave !== 'string' || !chave.trim()) {
    return { ok: false, erro: 'chave vazia' }
  }
  if (!safeStorage.isEncryptionAvailable()) {
    dglogSeguro('[segredos-providers] criptografia indisponível', chave)
    return { ok: false, erro: 'criptografia indisponível — não é seguro gravar chave em texto plano' }
  }
  try {
    const cofre = lerArquivoCofre() || { versao: VERSAO, chaves: {} }
    cofre.chaves[id] = chave.trim()
    gravarArquivoCofre(cofre)
    dglogSeguro('[segredos-providers] chave salva', chave)
    return { ok: true }
  } catch (e) {
    dglogSeguro('[segredos-providers] falha ao salvar chave', chave)
    return { ok: false, erro: String((e as Error)?.message || e) }
  }
}

export function lerChave(id: string): string | null {
  const cofre = lerArquivoCofre()
  const valorCofre = cofre?.chaves && typeof cofre.chaves[id] === 'string' ? cofre.chaves[id] : null
  if (valorCofre && valorCofre.trim().length > 0) {
    return valorCofre
  }
  const p = obterProvider(id)
  if (p?.apiKeyEnv) {
    const v = process.env[p.apiKeyEnv]
    if (typeof v === 'string' && v.trim().length > 0) return v
  }
  return null
}

export function removerChave(id: string): { ok: boolean } {
  try {
    const cofre = lerArquivoCofre()
    if (cofre?.chaves && cofre.chaves[id] !== undefined) {
      delete cofre.chaves[id]
      gravarArquivoCofre(cofre)
    }
    return { ok: true }
  } catch {
    return { ok: true }
  }
}

export function listarChavesConfiguradas(): string[] {
  const cofre = lerArquivoCofre()
  const ids = new Set<string>()
  if (cofre?.chaves) {
    for (const k of Object.keys(cofre.chaves)) {
      if (cofre.chaves[k] && cofre.chaves[k].trim().length > 0) ids.add(k)
    }
  }
  for (const p of listarProviders()) {
    if (p.apiKeyEnv) {
      const v = process.env[p.apiKeyEnv]
      if (typeof v === 'string' && v.trim().length > 0) ids.add(p.id)
    }
  }
  return [...ids]
}
