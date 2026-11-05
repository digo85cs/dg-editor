import { readdirSync, lstatSync } from 'fs'
import { join, extname, basename } from 'path'
import type { FolderScanResult } from '@shared/types'

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'vendor', 'dist', 'build',
  '.next', '.nuxt', '.vuepress', '.cache', '.idea', '.vscode',
  'coverage', '.nyc_output', 'target', '__pycache__', '.pytest_cache',
  '.DS_Store'
])

const MAX_TOP_FILES = 10

export interface ScanOptions {
  maxDepth?: number
  maxFiles?: number
  onProgress?: (scanned: number) => void
}

export function scanFolder(root: string, options: ScanOptions = {}): FolderScanResult {
  const start = Date.now()
  const { maxDepth = 10, maxFiles = 10000, onProgress } = options

  const extensions: Record<string, number> = {}
  const topFiles: { path: string; size: number }[] = []
  let totalFiles = 0
  let totalDirs = 0
  let skippedDirs = 0
  let scanned = 0

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) {
      skippedDirs++
      return
    }
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      skippedDirs++
      return
    }

    for (const entry of entries) {
      const full = join(dir, entry)
      let st: ReturnType<typeof lstatSync> | null = null
      try {
        st = lstatSync(full)
      } catch {
        continue
      }

      if (st.isDirectory()) {
        const name = basename(full)
        if (IGNORE_DIRS.has(name) || name.startsWith('.')) {
          skippedDirs++
          continue
        }
        totalDirs++
        walk(full, depth + 1)
      } else if (st.isFile()) {
        totalFiles++
        const ext = extname(full).toLowerCase()
        if (ext) extensions[ext] = (extensions[ext] || 0) + 1
        if (full && typeof st.size === 'number' && !Number.isNaN(st.size)) {
          topFiles.push({ path: full, size: st.size })
        }
        if (topFiles.length > MAX_TOP_FILES * 4) {
          topFiles.sort((a, b) => b.size - a.size)
          topFiles.length = MAX_TOP_FILES
        }
        scanned++
        if (scanned % 500 === 0 && onProgress) onProgress(scanned)
        if (totalFiles >= maxFiles) return
      }
    }
  }

  walk(root, 0)

  topFiles.sort((a, b) => b.size - a.size)
  topFiles.length = MAX_TOP_FILES

  return {
    root,
    totalFiles,
    totalDirs,
    skippedDirs,
    extensions,
    topFiles,
    scannedAt: Date.now(),
    durationMs: Date.now() - start
  }
}

export function formatScanSummary(result: FolderScanResult): string {
  const top = Object.entries(result.extensions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([ext, count]) => `${ext} (${count})`)
    .join(', ')
  return `Análise: ${result.totalFiles} arquivos em ${result.totalDirs} diretórios. Tipos: ${top || 'nenhum'}.`
}