import { execFileSync } from 'child_process'
import path from 'path'

export type DiagnosticoResultado = {
  ok: boolean
  typecheck: { ok: boolean; erro?: string }
  testes: { ok: boolean; erro?: string; total?: number; falhas?: number }
  build: { ok: boolean; erro?: string }
  erros: string[]
  sugestao: string | null
}

const RAIZ = process.cwd()

function run(cmd: string, args: string[]): { ok: boolean; saida: string; erro?: string } {
  try {
    const saida = execFileSync(cmd, args, { cwd: RAIZ, encoding: 'utf8', timeout: 300_000 })
    return { ok: true, saida }
  } catch (e: any) {
    const saida = typeof e.stdout === 'string' ? e.stdout : ''
    const stderr = typeof e.stderr === 'string' ? e.stderr : ''
    return { ok: false, saida: saida + stderr, erro: String(e.message) }
  }
}

export function autoDiagnosticar(): DiagnosticoResultado {
  const erros: string[] = []

  const tc = run('npx', ['tsc', '--noEmit'])
  if (!tc.ok) {
    erros.push('typecheck: ' + (tc.erro || tc.saida.slice(0, 500)))
  }

  const td = run('npx', ['vitest', 'run'])
  let total = 0
  let falhas = 0
  const m = td.saida.match(/Tests\s+(\d+) passed.*?(\d+) failed/)
  if (m) { total = +m[1]; falhas = +m[2] }
  if (!td.ok || falhas > 0) {
    erros.push('testes: ' + (td.erro || td.saida.slice(0, 500)) + ' (total=' + total + ' falhas=' + falhas + ')')
  }

  const bd = run('npm', ['run', 'build'])
  if (!bd.ok) {
    erros.push('build: ' + (bd.erro || bd.saida.slice(0, 500)))
  }

  const ok = erros.length === 0
  let sugestao: string | null = null
  if (!ok) {
    sugestao = 'Existem ' + erros.length + ' falha(s) detectadas. Executar auto-correção para tentar corrigir.'
  }

  return {
    ok,
    typecheck: { ok: tc.ok, erro: tc.erro },
    testes: { ok: td.ok && falhas === 0, erro: td.erro, total, falhas },
    build: { ok: bd.ok, erro: bd.erro },
    erros,
    sugestao
  }
}
