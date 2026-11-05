// cache.ts — cache de análise por hash de arquivos
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { createHash } from 'crypto'
import type { AnalysisReport } from '@shared/fase1-types'

export interface CacheEntry {
  root: string
  hash: string
  report: AnalysisReport
  fileHashes: Record<string, string>
  savedAt: number
}

function cacheDir(root: string): string {
  const hash = createHash('sha256').update(root).digest('hex').slice(0, 16)
  const dir = join(root, '.dg-cache')
  return dir
}

function cachePath(root: string): string {
  return join(cacheDir(root), 'analysis.json')
}

export function loadCache(root: string): CacheEntry | null {
  const path = cachePath(root)
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as CacheEntry
  } catch {
    return null
  }
}

export function saveCache(root: string, entry: CacheEntry): void {
  const dir = cacheDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(cachePath(root), JSON.stringify(entry, null, 2), 'utf-8')
}

export function computeFileHashes(root: string, files: string[]): Record<string, string> {
  const { createHash } = require('crypto')
  const { readFileSync } = require('fs')
  const hashes: Record<string, string> = {}
  for (const f of files) {
    try {
      const buf = readFileSync(f)
      hashes[f] = createHash('sha256').update(buf).digest('hex').slice(0, 16)
    } catch {
      hashes[f] = 'error'
    }
  }
  return hashes
}

export function diffHashes(
  oldHashes: Record<string, string>,
  newHashes: Record<string, string>
): { changed: string[]; added: string[]; removed: string[] } {
  const changed: string[] = []
  const added: string[] = []
  const removed: string[] = []
  for (const [f, h] of Object.entries(newHashes)) {
    if (!oldHashes[f]) added.push(f)
    else if (oldHashes[f] !== h) changed.push(f)
  }
  for (const f of Object.keys(oldHashes)) {
    if (!newHashes[f]) removed.push(f)
  }
  return { changed, added, removed }
}