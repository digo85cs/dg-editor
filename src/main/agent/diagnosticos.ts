/**
 * Diagnósticos locais para o loop Composer (typecheck / test / erros recentes).
 */
import { spawn } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export type Diagnostico = {
  origem: 'typecheck' | 'test' | 'manual'
  ok: boolean
  resumo: string
  saida: string
  em: string
}

const recentes: Diagnostico[] = []

function pathStore(): string {
  const d = join(app.getPath('userData'), 'agent-diagnostics')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return join(d, 'recent.json')
}

function persistir(): void {
  try {
    writeFileSync(pathStore(), JSON.stringify(recentes.slice(0, 10), null, 2), 'utf8')
  } catch {
    /* */
  }
}

export function listarDiagnosticosRecentes(limite = 5): Diagnostico[] {
  try {
    if (!recentes.length && existsSync(pathStore())) {
      const arr = JSON.parse(readFileSync(pathStore(), 'utf8')) as Diagnostico[]
      if (Array.isArray(arr)) recentes.push(...arr)
    }
  } catch {
    /* */
  }
  return recentes.slice(0, limite)
}

export function registrarDiagnosticoManual(texto: string): Diagnostico {
  const d: Diagnostico = {
    origem: 'manual',
    ok: false,
    resumo: texto.slice(0, 200),
    saida: texto.slice(0, 8000),
    em: new Date().toISOString()
  }
  recentes.unshift(d)
  if (recentes.length > 20) recentes.length = 20
  persistir()
  return d
}

function rodarCmd(
  raiz: string,
  cmd: string,
  args: string[],
  timeoutMs = 120_000
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: raiz,
      shell: false,
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: '0' }
    })
    let stdout = ''
    let stderr = ''
    const t = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* */
      }
      resolve({ code: 124, stdout, stderr: stderr + '\n(timeout)' })
    }, timeoutMs)
    child.stdout?.on('data', (b) => {
      stdout += String(b)
      if (stdout.length > 50_000) stdout = stdout.slice(-50_000)
    })
    child.stderr?.on('data', (b) => {
      stderr += String(b)
      if (stderr.length > 50_000) stderr = stderr.slice(-50_000)
    })
    child.on('close', (code) => {
      clearTimeout(t)
      resolve({ code: code ?? 1, stdout, stderr })
    })
    child.on('error', (e) => {
      clearTimeout(t)
      resolve({ code: 127, stdout, stderr: String(e.message || e) })
    })
  })
}

export async function rodarTypecheck(raiz: string): Promise<Diagnostico> {
  const pkg = join(raiz, 'package.json')
  let usaNpm = false
  try {
    if (existsSync(pkg)) {
      const j = JSON.parse(readFileSync(pkg, 'utf8')) as { scripts?: Record<string, string> }
      usaNpm = !!j.scripts?.typecheck
    }
  } catch {
    /* */
  }
  const r = usaNpm
    ? await rodarCmd(raiz, process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'typecheck', '--silent'])
    : await rodarCmd(raiz, process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--yes', 'tsc', '--noEmit'])
  const saida = (r.stdout + '\n' + r.stderr).trim()
  const d: Diagnostico = {
    origem: 'typecheck',
    ok: r.code === 0,
    resumo: r.code === 0 ? 'typecheck ok' : 'typecheck falhou (code=' + r.code + ')',
    saida: saida.slice(0, 12000),
    em: new Date().toISOString()
  }
  recentes.unshift(d)
  if (recentes.length > 20) recentes.length = 20
  persistir()
  return d
}

export async function rodarTestes(raiz: string): Promise<Diagnostico> {
  const pkg = join(raiz, 'package.json')
  let tem = false
  try {
    if (existsSync(pkg)) {
      const j = JSON.parse(readFileSync(pkg, 'utf8')) as { scripts?: Record<string, string> }
      tem = !!j.scripts?.test
    }
  } catch {
    /* */
  }
  if (!tem) {
    const d: Diagnostico = {
      origem: 'test',
      ok: true,
      resumo: 'sem script test',
      saida: '',
      em: new Date().toISOString()
    }
    return d
  }
  const r = await rodarCmd(
    raiz,
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['test', '--silent'],
    180_000
  )
  const saida = (r.stdout + '\n' + r.stderr).trim()
  const d: Diagnostico = {
    origem: 'test',
    ok: r.code === 0,
    resumo: r.code === 0 ? 'test ok' : 'test falhou (code=' + r.code + ')',
    saida: saida.slice(0, 12000),
    em: new Date().toISOString()
  }
  recentes.unshift(d)
  if (recentes.length > 20) recentes.length = 20
  persistir()
  return d
}

/** Bloco de texto para injetar no prompt do agente. */
export function blocoDiagnosticosParaPrompt(limite = 3): string {
  const lista = listarDiagnosticosRecentes(limite).filter((d) => !d.ok && d.saida)
  if (!lista.length) return ''
  return (
    '### Diagnósticos recentes (corrigir se relacionados)\n' +
    lista
      .map(
        (d) =>
          '- [' + d.origem + ' @ ' + d.em + '] ' + d.resumo + '\n```\n' + d.saida.slice(0, 4000) + '\n```'
      )
      .join('\n')
  )
}
