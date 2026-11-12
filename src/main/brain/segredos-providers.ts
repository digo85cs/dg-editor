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
import { chaveOpenRouterPareceValida, envParaProvider } from './provider-env-map'

function ehOpenRouterId(id: string): boolean {
  return id === 'openrouter' || id.startsWith('openrouter')
}

function aceitarChave(id: string, chave: string | null): string | null {
  if (!chave) return null
  if (ehOpenRouterId(id) && !chaveOpenRouterPareceValida(chave)) return null
  return chave
}

const VERSAO = 1

function arquivoCofre(): string {
  return join(userDataDir(), 'providers-keys.bin')
}

function mascarar(chave: string | undefined | null): string {
  if (!chave) return '—'
  return chave.slice(0, 4) + '****'
}

function dglogSeguro(mensagem: string, chave?: string | null): void {
  dglog(mensagem + (chave ? ' chave=' + mascarar(chave) : ''))
}

function lerArquivoCofre(): { versao: number; chaves: Record<string, string> } | null {
  const ARQUIVO = arquivoCofre()
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
  writeFileSync(arquivoCofre(), buf)
}

function chaveNoCofre(id: string): string | null {
  const cofre = lerArquivoCofre()
  const v = cofre?.chaves && typeof cofre.chaves[id] === 'string' ? cofre.chaves[id] : null
  return v && v.trim().length > 0 ? v.trim() : null
}

/**
 * Resolve chave por id do provider OU apiKeyRef compartilhado
 * (ex.: openrouter-inkling grava em id; chamada usa apiKeyRef=openrouter).
 */
function resolverChave(idOuRef: string): string | null {
  const direto = aceitarChave(idOuRef, chaveNoCofre(idOuRef))
  if (direto) return direto

  const p = obterProvider(idOuRef)
  const refOr = p?.apiKeyRef || idOuRef
  if (p?.apiKeyEnv) {
    const env = process.env[p.apiKeyEnv]
    if (typeof env === 'string' && env.trim()) {
      const ok = aceitarChave(refOr, env.trim())
      if (ok) return ok
    }
  }
  // Env por ref convencional (GROQ_API_KEY, TOGETHER_API_KEY, …)
  {
    const viaMap =
      envParaProvider(idOuRef) ||
      (p?.apiKeyRef ? envParaProvider(p.apiKeyRef) : null)
    if (viaMap) return viaMap
  }
  if (p?.apiKeyRef && p.apiKeyRef !== idOuRef) {
    const viaRef = aceitarChave(p.apiKeyRef, chaveNoCofre(p.apiKeyRef))
    if (viaRef) return viaRef
  }

  // Irmãos com o mesmo apiKeyRef (UI salva por id do card)
  for (const outro of listarProviders()) {
    if (outro.id === idOuRef) continue
    const mesmoRef =
      outro.apiKeyRef === idOuRef ||
      (p?.apiKeyRef && outro.apiKeyRef === p.apiKeyRef) ||
      outro.id === p?.apiKeyRef
    if (!mesmoRef) continue
    const c = aceitarChave(outro.apiKeyRef || outro.id, chaveNoCofre(outro.id))
    if (c) return c
    if (outro.apiKeyEnv) {
      const env = process.env[outro.apiKeyEnv]
      if (typeof env === 'string' && env.trim()) {
        const ok = aceitarChave(outro.apiKeyRef || outro.id, env.trim())
        if (ok) return ok
      }
    }
    const viaOutro = envParaProvider(outro.apiKeyRef || outro.id)
    if (viaOutro) return viaOutro
  }
  return null
}

export function chaveConfigurada(id: string): boolean {
  return resolverChave(id) != null
}

export function salvarChave(id: string, chave: string): { ok: boolean; erro?: string } {
  if (!chave || typeof chave !== 'string' || !chave.trim()) {
    return { ok: false, erro: 'chave vazia' }
  }
  if (ehOpenRouterId(id) && !chaveOpenRouterPareceValida(chave.trim())) {
    return { ok: false, erro: 'chave OpenRouter inválida (use sk-or-v1-… completa)' }
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
  return resolverChave(id)
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
