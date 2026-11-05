import { readdirSync, readFileSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import type { WhereIsResult, WhereIsMatch } from '@shared/types'

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'vendor', 'dist', 'build',
  '.next', '.nuxt', '.cache', 'coverage', 'target', '__pycache__'
])

const TEXT_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.php', '.py', '.rb', '.go',
  '.rs', '.java', '.kt', '.cs', '.c', '.cpp', '.h', '.hpp', '.sql',
  '.html', '.css', '.scss', '.vue', '.svelte', '.json', '.yml', '.yaml',
  '.md', '.txt', '.env', '.ini', '.toml', '.sh', '.ps1', '.bat'
])

const MAX_FILE_SIZE = 512 * 1024
const MAX_MATCHES = 30
const MAX_PER_FILE = 5

export interface WhereIsOptions {
  maxMatches?: number
  onProgress?: (files: number) => void
}

function isTextFile(name: string): boolean {
  const ext = extname(name).toLowerCase()
  if (TEXT_EXTS.has(ext)) return true
  if (!ext) return true // arquivos sem extensao (Dockerfile, LICENSE...)
  return false
}

function collectFiles(root: string, out: string[], depth = 0): void {
  if (depth > 10) return
  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(root, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      if (IGNORE_DIRS.has(entry) || entry.startsWith('.')) continue
      collectFiles(full, out, depth + 1)
    } else if (st.isFile() && isTextFile(entry) && st.size <= MAX_FILE_SIZE) {
      out.push(full)
    }
  }
}

export function whereIs(root: string, query: string, options: WhereIsOptions = {}): WhereIsResult {
  const start = Date.now()
  const maxMatches = options.maxMatches ?? MAX_MATCHES
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
  const matches: WhereIsMatch[] = []
  let scannedFiles = 0

  if (terms.length === 0) {
    return { query, matches: [], scannedFiles: 0, durationMs: Date.now() - start }
  }

  const files: string[] = []
  collectFiles(root, files)

  for (const file of files) {
    if (matches.length >= maxMatches) break
    let content: string
    try {
      content = readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    scannedFiles++
    if (options.onProgress && scannedFiles % 100 === 0) options.onProgress(scannedFiles)

    const lower = content.toLowerCase()
    // score: todas as palavras presentes = prioridade
    const allPresent = terms.every((t) => lower.includes(t))
    if (!allPresent) continue

    let fileMatches = 0
    const lines = content.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      if (matches.length >= maxMatches || fileMatches >= MAX_PER_FILE) break
      const lineLower = lines[i].toLowerCase()
      if (terms.every((t) => lineLower.includes(t))) {
        matches.push({
          file,
          line: i + 1,
          snippet: lines[i].trim().slice(0, 200)
        })
        fileMatches++
      }
    }
  }

  return { query, matches, scannedFiles, durationMs: Date.now() - start }
}

export function formatWhereIs(result: WhereIsResult): string {
  if (result.matches.length === 0) {
    return `Nada encontrado para "${result.query}" (${result.scannedFiles} arquivos verificados).`
  }
  const parts = result.matches.map((m) => `${m.file}:${m.line} — ${m.snippet}`)
  return `Encontrei ${result.matches.length} ocorrência(s) para "${result.query}":\n${parts.join('\n')}`
}