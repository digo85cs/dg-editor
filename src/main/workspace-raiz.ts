/**
 * Raiz ativa do workspace (Bloco 1) vista pelo processo main.
 * Chat, MCP e agente devem usar isto — nunca cair no DGEditor por acidente.
 */
import { existsSync } from 'fs'
import { resolve } from 'path'
import { dglog } from './dglog'

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
export function resolverRaizChat(rootPayload: string): { ok: true; abs: string } | { ok: false; erro: string } {
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
    definirRaizWorkspace(abs)
    return { ok: true, abs }
  } catch (e) {
    return { ok: false, erro: 'Pasta invalida: ' + String(e) }
  }
}
