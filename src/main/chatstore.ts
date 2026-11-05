import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { ChatMessage } from '@shared/types'

const CHAT_DIR = '.dg-editor'
const CHAT_FILE = 'chat.json'

function chatPath(root: string): string {
  return join(root, CHAT_DIR, CHAT_FILE)
}

export function loadChat(root: string): ChatMessage[] {
  const p = chatPath(root)
  if (!existsSync(p)) return []
  try {
    const data = JSON.parse(readFileSync(p, 'utf-8')) as { messages?: ChatMessage[] }
    return data.messages ?? []
  } catch {
    return []
  }
}

export function appendChat(root: string, message: ChatMessage): void {
  const messages = loadChat(root)
  messages.push(message)
  // teto de seguranca: ultimas 200 mensagens
  const trimmed = messages.slice(-200)
  const dir = join(root, CHAT_DIR)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(chatPath(root), JSON.stringify({ messages: trimmed }, null, 2), 'utf-8')
}

export function clearChat(root: string): void {
  const dir = join(root, CHAT_DIR)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(chatPath(root), JSON.stringify({ messages: [] }, null, 2), 'utf-8')
}