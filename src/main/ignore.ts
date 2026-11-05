/**
 * Carregamento de .gitignore/.dgignore estilo gitignore simples
 * (match por nome/padrão básico)
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const cached = new Map<string, Set<string>>()

function carregar(raiz: string): Set<string> {
  if (cached.has(raiz)) return cached.get(raiz)!
  const set = new Set<string>()
  for (const name of ['.gitignore', '.dgignore']) {
    const p = join(raiz, name)
    if (!existsSync(p)) continue
    try {
      const txt = readFileSync(p, 'utf8')
      for (const line of txt.split(/\r?\n/)) {
        const l = line.trim()
        if (!l || l.startsWith('#')) continue
        // simplificado: guarda padrões básicos
        set.add(l.replace(/\\/g, '/'))
      }
    } catch {
      /* ignore */
    }
  }
  cached.set(raiz, set)
  return set
}

export function deveIgnorar(raiz: string, relPath: string): boolean {
  const rel = String(relPath).replace(/\\/g, '/')
  if (!rel) return false
  const patterns = carregar(raiz)
  const base = rel.split('/')[0]
  // match por diretório/arquivo exato ou sufixo
  if (patterns.has(base)) return true
  if (patterns.has(rel)) return true
  // *.ext
  for (const pat of patterns) {
    if (pat.startsWith('*.')) {
      const ext = pat.slice(1).toLowerCase()
      if (rel.toLowerCase().endsWith(ext)) return true
    }
    if (pat.includes('/')) {
      // prefixo simples
      if (rel.startsWith(pat.replace(/\/$/, '') + '/')) return true
    }
  }
  return false
}

export function limparCacheIgnore(raiz?: string) {
  if (raiz) cached.delete(raiz)
  else cached.clear()
}
