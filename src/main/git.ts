/**
 * Status e diff git (estado controlado se git ausente / fora de repo).
 */
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { join, normalize } from 'path'

const execFileP = promisify(execFile)

export type GitStatusCode = 'M' | 'A' | 'D' | '??' | 'R' | 'C' | 'U'

export interface GitStatusItem {
  path: string
  status: GitStatusCode
}

export interface GitStatusResult {
  ok: boolean
  itens: GitStatusItem[]
  erro?: string
}

export interface GitDiffResult {
  ok: boolean
  diff: string
  erro?: string
}

async function git(raiz: string, args: string[]): Promise<{ ok: boolean; stdout: string; erro?: string }> {
  try {
    const { stdout, stderr } = await execFileP('git', args, {
      cwd: raiz,
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 15000,
      maxBuffer: 4 * 1024 * 1024
    })
    return { ok: true, stdout: String(stdout || ''), erro: stderr ? String(stderr).slice(0, 200) : undefined }
  } catch (e: unknown) {
    const err = e as { message?: string; stdout?: string; stderr?: string }
    return {
      ok: false,
      stdout: String(err.stdout || ''),
      erro: String(err.stderr || err.message || e).slice(0, 400)
    }
  }
}

function mapStatus(xy: string): GitStatusCode {
  const s = (xy || '').trim()
  if (s === '??' || s.startsWith('?')) return '??'
  if (s.includes('D')) return 'D'
  if (s.includes('A')) return 'A'
  if (s.includes('M') || s.includes(' ')) return 'M'
  if (s.includes('R')) return 'R'
  if (s.includes('C')) return 'C'
  if (s.includes('U')) return 'U'
  return 'M'
}

export async function gitStatus(raiz: string): Promise<GitStatusResult> {
  if (!raiz || !existsSync(raiz)) return { ok: false, itens: [], erro: 'raiz invalida' }
  if (!existsSync(join(raiz, '.git')) && !(await git(raiz, ['rev-parse', '--is-inside-work-tree'])).ok) {
    return { ok: true, itens: [], erro: 'nao e repositorio git' }
  }
  const r = await git(raiz, ['status', '--porcelain', '-u'])
  if (!r.ok) {
    const msg = r.erro || ''
    if (/not a git repository|nao e um repositorio/i.test(msg) || /not found|nao encontrado|ENOENT/i.test(msg)) {
      return { ok: true, itens: [], erro: 'git indisponivel ou fora de repo' }
    }
    return { ok: false, itens: [], erro: msg }
  }
  const itens: GitStatusItem[] = []
  for (const line of r.stdout.split(/\r?\n/)) {
    if (!line || line.length < 4) continue
    const st = mapStatus(line.slice(0, 2))
    let p = line.slice(3).trim()
    if (p.includes(' -> ')) p = p.split(' -> ').pop() || p
    p = p.replace(/^"|"$/g, '')
    itens.push({ path: normalize(p).replace(/\\/g, '/'), status: st })
  }
  return { ok: true, itens }
}

export async function gitDiff(raiz: string, relPath: string): Promise<GitDiffResult> {
  if (!raiz || !relPath) return { ok: false, diff: '', erro: 'parametros invalidos' }
  const clean = String(relPath).replace(/^[/\\]+/, '')
  const staged = await git(raiz, ['diff', '--no-color', '--cached', '--', clean])
  const unstaged = await git(raiz, ['diff', '--no-color', '--', clean])
  if (!staged.ok && !unstaged.ok) {
    // untracked: sem diff — mostrar vazio controlado
    const st = await gitStatus(raiz)
    const hit = st.itens.find((i) => i.path === clean.replace(/\\/g, '/') || i.path.endsWith(clean))
    if (hit?.status === '??') {
      return { ok: true, diff: '(arquivo nao rastreado — sem diff staged/unstaged)\n' }
    }
    return { ok: false, diff: '', erro: unstaged.erro || staged.erro || 'diff falhou' }
  }
  const parts = [staged.stdout, unstaged.stdout].filter((s) => s && s.trim())
  return { ok: true, diff: parts.join('\n') || '(sem diferencas)\n' }
}
