/**
 * Status e diff git (estado controlado se git ausente / fora de repo).
 */
import { execFile, execFileSync } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { basename, join, normalize } from 'path'

const execFileP = promisify(execFile)

/** Cache 30s por pasta de entrada (git:repos). */
const reposCache = new Map<string, { dados: GitRepoInfo; ts: number }>()
const REPOS_CACHE_MS = 30_000

export interface GitRepoInfo {
  pasta: string
  repo: string | null
  branch?: string
  ultimoCommitTs?: number
  dirty?: boolean
}

/** execFileSync protegido (Fix C1): timeout 3000, stdio ignore/pipe/ignore. */
function gitSyncProtegido(pasta: string, args: string[]): string | null {
  try {
    const out = execFileSync('git', ['-C', pasta, ...args], {
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      encoding: 'utf8'
    })
    return String(out || '').trim()
  } catch {
    return null
  }
}

/**
 * Detecta repos git a partir de pastas abertas.
 * Nunca lança — pasta quebrada / sem git → { pasta, repo: null }.
 */
export function gitRepos(pastas: string[]): GitRepoInfo[] {
  const agora = Date.now()
  const saida: GitRepoInfo[] = []
  for (const pasta of pastas) {
    if (!pasta || typeof pasta !== 'string') {
      saida.push({ pasta: String(pasta || ''), repo: null })
      continue
    }
    const hit = reposCache.get(pasta)
    if (hit && agora - hit.ts <= REPOS_CACHE_MS) {
      saida.push(hit.dados)
      continue
    }
    let dados: GitRepoInfo = { pasta, repo: null }
    try {
      const toplevel = gitSyncProtegido(pasta, ['rev-parse', '--show-toplevel'])
      if (toplevel) {
        const branch = gitSyncProtegido(pasta, ['rev-parse', '--abbrev-ref', 'HEAD']) || 'HEAD'
        const tsRaw = gitSyncProtegido(pasta, ['log', '-1', '--format=%ct'])
        const porcelain = gitSyncProtegido(pasta, ['status', '--porcelain'])
        const linhas = porcelain ? porcelain.split(/\r?\n/).filter((l) => l.length > 0) : []
        const ts = tsRaw ? parseInt(tsRaw, 10) : NaN
        dados = {
          pasta,
          repo: basename(toplevel.replace(/[/\\]+$/, '')),
          branch,
          ultimoCommitTs: Number.isFinite(ts) ? ts : undefined,
          dirty: linhas.length > 0
        }
      }
    } catch {
      dados = { pasta, repo: null }
    }
    reposCache.set(pasta, { dados, ts: agora })
    saida.push(dados)
  }
  return saida
}

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
