import { watch, type FSWatcher } from 'chokidar'
import { resolve } from 'path'
import { dglog } from '../dglog'
import { ehWriteProprio, reindexarNota, removerNota } from './indice'

let watcher: FSWatcher | null = null
let debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

function schedule(path: string, fn: () => void): void {
  const abs = resolve(path)
  const prev = debounceTimers.get(abs)
  if (prev) clearTimeout(prev)
  debounceTimers.set(
    abs,
    setTimeout(() => {
      debounceTimers.delete(abs)
      fn()
    }, 250)
  )
}

export function iniciarWatchVault(raiz: string): void {
  pararWatchVault()
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { emSafeMode } = require('../safe-mode') as typeof import('../safe-mode')
    if (emSafeMode()) {
      dglog('[vault] watch omitido (safe-mode)')
      return
    }
  } catch {
    /* ok */
  }

  watcher = watch(raiz, {
    ignored: [
      /(^|[\\/])node_modules([\\/]|$)/,
      /(^|[\\/])\.git([\\/]|$)/,
      /(^|[\\/])\.obsidian([\\/]|$)/,
      /\.tmp$/i
    ],
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
  })

  const onUpsert = (p: string) => {
    if (!/\.md$/i.test(p) && !/\.markdown$/i.test(p)) return
    if (ehWriteProprio(p)) return
    schedule(p, () => {
      void reindexarNota(p)
    })
  }

  watcher.on('add', onUpsert)
  watcher.on('change', onUpsert)
  watcher.on('unlink', (p) => {
    if (!/\.md$/i.test(p) && !/\.markdown$/i.test(p)) return
    schedule(p, () => removerNota(p))
  })
  watcher.on('error', (err) => dglog('[vault] watch erro: ' + String(err)))
}

export function pararWatchVault(): void {
  for (const t of debounceTimers.values()) clearTimeout(t)
  debounceTimers.clear()
  if (watcher) {
    void watcher.close()
    watcher = null
  }
}
