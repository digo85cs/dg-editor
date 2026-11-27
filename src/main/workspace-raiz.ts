/**
 * Raiz ativa do workspace (Bloco 1) vista pelo processo main.
 * Chat, MCP e agente devem usar isto — nunca cair no DGEditor por acidente.
 */
import { existsSync } from 'fs'
import { resolve, sep } from 'path'
import { dglog } from './dglog'
import { userDataDir } from './paths'
import { limparCacheHooks } from './hooks'

let raizAtiva: string | null = null

export function definirRaizWorkspace(pasta: string | null | undefined): string | null {
  const p = typeof pasta === 'string' ? pasta.trim() : ''
  if (!p) return raizAtiva
  try {
    const abs = resolve(p)
    if (!existsSync(abs)) {
      dglog('[workspace-raiz] pasta inexistente: ' + abs)
      return raizAtiva
    }
    if (raizAtiva !== abs) {
      // FASE 4: limpa cache de hooks ao trocar de raiz
      try {
        limparCacheHooks()
      } catch {
        /* hooks pode não estar disponível */
      }
    }
    raizAtiva = abs
    process.env.DG_ROOT = abs
    return abs
  } catch (e) {
    dglog('[workspace-raiz] falha: ' + String(e))
    return raizAtiva
  }
}

export function obterRaizWorkspace(): string | null {
  if (raizAtiva && existsSync(raizAtiva)) return raizAtiva
  const env = process.env.DG_ROOT
  if (env && existsSync(env)) {
    raizAtiva = resolve(env)
    return raizAtiva
  }
  return null
}

/** Resolve root do chat: prefer payload, senao raiz ativa persistida. */
export function resolverRaizChat(rootPayload: string): { ok: true; abs: string; erro?: string } | { ok: false; erro: string } {
  const cand = String(rootPayload || '').trim() || obterRaizWorkspace() || ''
  if (!cand) {
    return {
      ok: false,
      erro: 'Nenhuma pasta de repositorio ativa. Selecione um repositorio no Bloco 1 e envie de novo.'
    }
  }
  try {
    const abs = resolve(cand)
    if (!existsSync(abs)) {
      return { ok: false, erro: 'Pasta do repositorio nao encontrada: ' + abs }
    }
    // userData do app nunca e "projeto" — explorar Cache/leveldb nao ajuda
    // ninguem. Forca o usuario a escolher a pasta real no Bloco 1.
    try {
      const ud = resolve(userDataDir())
      if (abs === ud || abs.startsWith(ud + sep)) {
        return {
          ok: false,
          erro: 'A pasta ativa e o diretorio de dados do DG Editor (' + ud + '), nao um projeto. Selecione a pasta do seu projeto no Bloco 1 e envie de novo.'
        }
      }
    } catch { /* userDataDir indisponivel — segue */ }
    definirRaizWorkspace(abs)
    return { ok: true, abs }
  } catch (e) {
    return { ok: false, erro: 'Pasta invalida: ' + String(e) }
  }
}
