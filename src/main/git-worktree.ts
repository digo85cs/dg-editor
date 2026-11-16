/**
 * Checkpoints isolados via git worktree — edições do agente não sujam
 * o working tree do usuário (padrão Cline/Roo).
 * Worktrees ficam em <repo>/.dg-worktrees/<nome> com branch dg/wt-<nome>.
 */
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const execFileP = promisify(execFile)

export interface WorktreeCheckpoint {
  nome: string
  caminho: string
  branch: string
}

const DIR = '.dg-worktrees'

async function git(raiz: string, args: string[]): Promise<{ ok: boolean; stdout: string; erro?: string }> {
  try {
    const { stdout } = await execFileP('git', ['-C', raiz, ...args], { timeout: 15000, windowsHide: true })
    return { ok: true, stdout: String(stdout) }
  } catch (e) {
    const err = e as { stderr?: string; message?: string }
    return { ok: false, stdout: '', erro: (err.stderr || err.message || String(e)).slice(0, 300) }
  }
}

function slug(nome: string): string {
  return nome.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'wt'
}

export async function criarWorktreeCheckpoint(
  raiz: string,
  nome: string
): Promise<{ ok: boolean; caminho?: string; branch?: string; erro?: string }> {
  const s = slug(nome)
  const dirBase = join(raiz, DIR)
  const caminho = join(dirBase, s)
  const branch = 'dg/wt-' + s
  if (existsSync(caminho)) return { ok: false, erro: 'worktree já existe: ' + caminho }
  mkdirSync(dirBase, { recursive: true })
  const r = await git(raiz, ['worktree', 'add', '-b', branch, caminho, 'HEAD'])
  if (!r.ok) return { ok: false, erro: r.erro }
  return { ok: true, caminho, branch }
}

export async function removerWorktreeCheckpoint(
  raiz: string,
  nome: string
): Promise<{ ok: boolean; erro?: string }> {
  const s = slug(nome)
  const caminho = join(raiz, DIR, s)
  if (!existsSync(caminho)) return { ok: false, erro: 'worktree não encontrado: ' + s }
  const r = await git(raiz, ['worktree', 'remove', '--force', caminho])
  if (!r.ok) return { ok: false, erro: r.erro }
  await git(raiz, ['branch', '-D', 'dg/wt-' + s]).catch(() => undefined)
  return { ok: true }
}

export async function listarWorktrees(raiz: string): Promise<WorktreeCheckpoint[]> {
  const r = await git(raiz, ['worktree', 'list', '--porcelain'])
  if (!r.ok) return []
  const out: WorktreeCheckpoint[] = []
  let atual: Partial<WorktreeCheckpoint> = {}
  for (const linha of r.stdout.split('\n')) {
    if (linha.startsWith('worktree ')) {
      if (atual.caminho) out.push(atual as WorktreeCheckpoint)
      atual = { caminho: linha.slice(9).trim() }
    } else if (linha.startsWith('branch ')) {
      atual.branch = linha.slice(7).trim().replace('refs/heads/', '')
    }
  }
  if (atual.caminho) out.push(atual as WorktreeCheckpoint)
  return out.filter((w) => w.caminho.includes(DIR))
}
