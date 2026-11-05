// file-index.ts — índice de arquivos da pasta para busca textual e cache
import { readdirSync, lstatSync, readFileSync } from 'fs'
import { join, extname, basename, relative } from 'path'
import { createHash } from 'crypto'
import type { FileIndex, FileIndexEntry } from '@shared/fase1-types'
import { scanFolder } from './scanner'

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'vendor', 'dist', 'build',
  '.next', '.nuxt', '.vuepress', '.cache', '.idea', '.vscode',
  'coverage', '.nyc_output', 'target', '__pycache__', '.pytest_cache',
  '.DS_Store'
])

const MAX_INDEX_FILES = 2000
const MAX_FILE_BYTES = 64 * 1024

function hashContent(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 16)
}

function summarize(path: string, ext: string, content: string): string {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const first = lines[0]?.trim().slice(0, 120) || ''
  const name = basename(path)
  return `${name} (${ext}, ${lines.length} linhas)${first ? ' — ' + first : ''}`
}

export function buildFileIndex(root: string): FileIndex {
  const entries: FileIndexEntry[] = []
  let count = 0

  function walk(dir: string): void {
    if (count >= MAX_INDEX_FILES) return
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    for (const name of names) {
      if (count >= MAX_INDEX_FILES) return
      const full = join(dir, name)
      let st
      try {
        st = lstatSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        if (IGNORE_DIRS.has(name) || name.startsWith('.')) continue
        walk(full)
      } else if (st.isFile() && st.size > 0 && st.size <= 10 * 1024 * 1024) {
        const ext = extname(full).toLowerCase()
        const rel = relative(root, full)
        let content = ''
        let hash = ''
        try {
          if (st.size <= MAX_FILE_BYTES) {
            const buf = readFileSync(full)
            hash = hashContent(buf)
            content = buf.toString('utf-8')
          } else {
            hash = 'large'
          }
        } catch {
          hash = 'error'
        }
        entries.push({
          path: full,
          relativePath: rel,
          extension: ext,
          size: st.size,
          hash,
          lines: content ? content.split(/\r?\n/).length : 0,
          summary: content ? summarize(full, ext, content) : `${basename(full)} (${ext}, ${st.size} bytes)`,
          indexedAt: Date.now()
        })
        count++
      }
    }
  }

  walk(root)
  return { root, entries, builtAt: Date.now() }
}

export function searchIndex(index: FileIndex, query: string): import('@shared/fase1-types').SearchMatch[] {
  const q = query.toLowerCase().trim()
  if (!q.length) return []
  const terms = q.split(/\s+/).filter((t) => t.length > 1)
  const results: import('@shared/fase1-types').SearchMatch[] = []

  for (const entry of index.entries) {
    let content = ''
    try {
      content = readFileSync(entry.path, 'utf-8')
    } catch {
      continue
    }
    const lines = content.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase()
      const match = terms.some((t) => line.includes(t))
      if (match) {
        results.push({ file: entry.relativePath, line: i + 1, content: lines[i].trim().slice(0, 200) })
        if (results.length >= 20) return results
      }
    }
  }
  return results
}

export function indexToContext(index: FileIndex, maxTokens = 4000): string {
  const lines: string[] = []
  let tokens = 0
  for (const e of index.entries) {
    const line = `// ${e.relativePath} (${e.extension}, ${e.lines} linhas)`
    lines.push(line)
    tokens += Math.ceil(line.length / 4)
    if (tokens > maxTokens) break
  }
  return lines.join('\n')
}