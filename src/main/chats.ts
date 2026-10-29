/**
 * Histórico persistente de chats (.dg-editor/chats/<id>.json).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'

export interface ChatMensagem {
  role: string
  content: string
  provider?: string
  em?: string
}

export interface ChatDoc {
  id: string
  titulo: string
  mensagens: ChatMensagem[]
  criadoEm: string
  atualizadoEm: string
}

export interface ChatMeta {
  id: string
  titulo: string
  atualizadoEm: string
}

function dirChats(raiz: string): string {
  return join(raiz, '.dg-editor', 'chats')
}

function caminhoChat(raiz: string, id: string): string {
  const safe = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
  return join(dirChats(raiz), safe + '.json')
}

function garantirDir(raiz: string): void {
  const d = dirChats(raiz)
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
}

export function salvarChat(
  raiz: string,
  doc: { id: string; titulo: string; mensagens: ChatMensagem[]; criadoEm?: string; atualizadoEm?: string }
): ChatDoc {
  garantirDir(raiz)
  const agora = new Date().toISOString()
  const out: ChatDoc = {
    id: String(doc.id),
    titulo: String(doc.titulo || 'Sem titulo').slice(0, 120),
    mensagens: Array.isArray(doc.mensagens) ? doc.mensagens : [],
    criadoEm: doc.criadoEm || agora,
    atualizadoEm: agora
  }
  writeFileSync(caminhoChat(raiz, out.id), JSON.stringify(out, null, 2), 'utf-8')
  return out
}

export function listarChats(raiz: string): ChatMeta[] {
  const d = dirChats(raiz)
  if (!existsSync(d)) return []
  const out: ChatMeta[] = []
  for (const nome of readdirSync(d)) {
    if (!nome.endsWith('.json')) continue
    try {
      const j = JSON.parse(readFileSync(join(d, nome), 'utf-8')) as ChatDoc
      if (j && j.id) {
        out.push({
          id: j.id,
          titulo: j.titulo || j.id,
          atualizadoEm: j.atualizadoEm || j.criadoEm || ''
        })
      }
    } catch {
      /* ignora */
    }
  }
  out.sort((a, b) => String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)))
  return out
}

export function carregarChat(raiz: string, id: string): ChatDoc | null {
  const p = caminhoChat(raiz, id)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as ChatDoc
  } catch {
    return null
  }
}

export function apagarChat(raiz: string, id: string): boolean {
  const p = caminhoChat(raiz, id)
  if (!existsSync(p)) return false
  try {
    unlinkSync(p)
    return true
  } catch {
    return false
  }
}
