/**
 * Tools de autonomia v1: git, testes, qualidade, smoke, avaliacao de resultado.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

function trunc(s: string, n = 4000): string {
  const t = String(s || '')
  return t.length > n ? t.slice(0, n) + '\n…' : t
}

async function run(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs = 60_000
): Promise<{ ok: boolean; code: number; stdout: string; stderr: string }> {
  try {
    const r = await execFileAsync(cmd, args, {
      cwd,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
      encoding: 'utf8'
    })
    return { ok: true, code: 0, stdout: String(r.stdout || ''), stderr: String(r.stderr || '') }
  } catch (e: unknown) {
    const err = e as { code?: number; stdout?: string; stderr?: string; message?: string }
    return {
      ok: false,
      code: typeof err.code === 'number' ? err.code : 1,
      stdout: String(err.stdout || ''),
      stderr: String(err.stderr || err.message || e)
    }
  }
}

export async function gitStatus(raiz: string): Promise<Record<string, unknown>> {
  if (!existsSync(join(raiz, '.git'))) return { ok: false, erro: 'sem .git' }
  const branch = await run('git', ['-C', raiz, 'rev-parse', '--abbrev-ref', 'HEAD'], raiz, 8000)
  const st = await run('git', ['-C', raiz, 'status', '--porcelain', '-b'], raiz, 12000)
  return {
    ok: st.ok || st.stdout.length > 0,
    branch: (branch.stdout || '').trim(),
    porcelain: trunc(st.stdout, 6000),
    stderr: trunc(st.stderr, 800)
  }
}

export async function gitDiff(raiz: string, caminho?: string): Promise<Record<string, unknown>> {
  if (!existsSync(join(raiz, '.git'))) return { ok: false, erro: 'sem .git' }
  const args = ['-C', raiz, 'diff', '--', ...(caminho ? [caminho] : [])]
  const r = await run('git', args, raiz, 20000)
  return {
    ok: true,
    caminho: caminho || null,
    diff: trunc(r.stdout || '(sem diff)', 8000),
    stderr: trunc(r.stderr, 500)
  }
}

function detectarScriptTeste(raiz: string): { cmd: string; args: string[] } | null {
  const pkgPath = join(raiz, 'package.json')
  if (!existsSync(pkgPath)) return null
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> }
    const s = pkg.scripts || {}
    if (s['test:validator']) return { cmd: 'npm', args: ['run', 'test:validator'] }
    if (s['validar'] || s['validar:melhorias']) {
      if (existsSync(join(raiz, 'scripts', 'validar-melhorias.cjs'))) {
        return { cmd: 'node', args: ['scripts/validar-melhorias.cjs'] }
      }
    }
    if (s.test && !/watch/i.test(s.test)) return { cmd: 'npm', args: ['test', '--', '--run'] }
    if (existsSync(join(raiz, 'scripts', 'validar-melhorias.cjs'))) {
      return { cmd: 'node', args: ['scripts/validar-melhorias.cjs'] }
    }
  } catch {
    /* */
  }
  return null
}

export async function testesRodar(raiz: string): Promise<Record<string, unknown>> {
  const det = detectarScriptTeste(raiz)
  if (!det) return { ok: false, erro: 'nenhum script de teste detectado' }
  const r = await run(det.cmd, det.args, raiz, 120_000)
  const saida = trunc((r.stdout || '') + '\n' + (r.stderr || ''), 7000)
  return {
    ok: r.ok,
    comando: det.cmd + ' ' + det.args.join(' '),
    code: r.code,
    saida
  }
}

export async function qualidadeChecar(raiz: string): Promise<Record<string, unknown>> {
  const checks: { id: string; ok: boolean; detalhe: string }[] = []
  const enc = join(raiz, 'scripts', 'verificar-encoding.mjs')
  if (existsSync(enc)) {
    const r = await run('node', ['scripts/verificar-encoding.mjs'], raiz, 60_000)
    checks.push({
      id: 'encoding',
      ok: r.ok,
      detalhe: trunc((r.stdout || r.stderr).split('\n').slice(0, 8).join('\n'), 600)
    })
  }
  const sint = join(raiz, 'scripts', 'verificar-sintaxe.mjs')
  if (existsSync(sint)) {
    const r = await run('node', ['scripts/verificar-sintaxe.mjs'], raiz, 60_000)
    checks.push({
      id: 'sintaxe',
      ok: r.ok,
      detalhe: trunc((r.stdout || r.stderr).split('\n').slice(0, 8).join('\n'), 600)
    })
  }
  if (!checks.length) {
    const r = await run('node', ['--check', 'package.json'], raiz, 5000)
    checks.push({ id: 'node-check', ok: r.ok || existsSync(join(raiz, 'package.json')), detalhe: 'package.json presente' })
  }
  const ok = checks.every((c) => c.ok)
  return { ok, checks }
}

export async function projetoSmoke(raiz: string): Promise<Record<string, unknown>> {
  const passos: { id: string; ok: boolean; detalhe: string }[] = []
  passos.push({
    id: 'package.json',
    ok: existsSync(join(raiz, 'package.json')),
    detalhe: existsSync(join(raiz, 'package.json')) ? 'ok' : 'ausente'
  })
  const git = await gitStatus(raiz)
  passos.push({
    id: 'git',
    ok: !!git.ok,
    detalhe: git.ok ? String(git.branch || 'ok') : String(git.erro || 'sem git')
  })
  const q = await qualidadeChecar(raiz)
  passos.push({
    id: 'qualidade',
    ok: !!q.ok,
    detalhe: q.ok ? 'passou' : 'falhou'
  })
  return { ok: passos.every((p) => p.ok), passos }
}

export function resultadoAvaliar(
  pedido: string,
  textoFinal: string,
  passosResumo: string,
  criterios: string[] = []
): Record<string, unknown> {
  const ped = String(pedido || '').toLowerCase()
  const fin = String(textoFinal || '')
  const finLower = fin.toLowerCase()
  const checks = {
    temResposta: fin.trim().length > 20,
    mencionaPedido: ped.split(/\s+/).filter((w) => w.length > 4).slice(0, 3).some((w) => finLower.includes(w)),
    naoInventouCaminhoWindows:
      !/c:\\windows\\system32\\autopilot/i.test(fin) || /n[aã]o encontrado|falso positivo/i.test(fin),
    temProximoPasso: /pr[oó]xim|falta|pendente|ok|feito|conclu/i.test(fin)
  }
  // Done-when: cada critério precisa ter evidência no texto final.
  const doneWhen = (criterios || [])
    .map((c) => String(c || '').trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((c) => {
      const palavras = c.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
      const ok = palavras.length === 0 || palavras.some((w) => finLower.includes(w))
      return { criterio: c, ok }
    })
  const score = Object.values(checks).filter(Boolean).length
  const doneOk = doneWhen.every((d) => d.ok)
  return {
    ok: score >= 3 && doneOk,
    score,
    checks,
    doneWhen,
    resumoPassos: trunc(passosResumo, 1200),
    recomendacao:
      score >= 3 && doneOk
        ? 'entregar'
        : doneWhen.length && !doneOk
          ? 'revisar: critérios done-when não atendidos'
          : 'revisar resposta antes de entregar'
  }
}

export type MemoriaProjeto = {
  atualizadoEm: string
  stack?: string
  testCmd?: string
  buildCmd?: string
  notas?: string
}

export function lerMemoriaProjeto(raiz: string): MemoriaProjeto | null {
  const p = join(raiz, '.dg-editor', 'projeto-memoria.json')
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as MemoriaProjeto
  } catch {
    return null
  }
}

export function gravarMemoriaProjeto(raiz: string, parcial: Partial<MemoriaProjeto>): MemoriaProjeto {
  const dir = join(raiz, '.dg-editor')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const atual = lerMemoriaProjeto(raiz) || { atualizadoEm: '' }
  const det = detectarScriptTeste(raiz)
  const pkgPath = join(raiz, 'package.json')
  let stack = parcial.stack || atual.stack
  let buildCmd = parcial.buildCmd || atual.buildCmd
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string>; dependencies?: object; devDependencies?: object }
      if (!stack) {
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
        const keys = Object.keys(deps)
        const bits: string[] = []
        if (keys.some((k) => k.includes('electron'))) bits.push('electron')
        if (keys.some((k) => k.includes('react'))) bits.push('react')
        if (keys.some((k) => k.includes('vite'))) bits.push('vite')
        if (existsSync(join(raiz, 'composer.json'))) bits.push('php')
        stack = bits.join('+') || 'node'
      }
      if (!buildCmd && pkg.scripts?.build) buildCmd = 'npm run build'
    } catch {
      /* */
    }
  }
  const out: MemoriaProjeto = {
    atualizadoEm: new Date().toISOString(),
    stack,
    testCmd: parcial.testCmd || atual.testCmd || (det ? det.cmd + ' ' + det.args.join(' ') : undefined),
    buildCmd,
    notas: parcial.notas || atual.notas
  }
  writeFileSync(join(dir, 'projeto-memoria.json'), JSON.stringify(out, null, 2), 'utf8')
  return out
}

export function blocoMemoriaProjeto(raiz: string): string {
  const m = lerMemoriaProjeto(raiz) || gravarMemoriaProjeto(raiz, {})
  return (
    '\n\n### Memoria do projeto\n' +
    '- stack: ' +
    (m.stack || '?') +
    '\n- test: ' +
    (m.testCmd || '?') +
    '\n- build: ' +
    (m.buildCmd || '?') +
    '\n'
  )
}

export async function terminalExec(
  raiz: string,
  comando: string,
  args: string[] = [],
  confirmado = false
): Promise<Record<string, unknown>> {
  const cmd = comando.trim()
  const linha = (cmd + ' ' + args.join(' ')).toLowerCase()
  const destrutivo =
    /\b(rm|del|rmdir|unlink|format|shutdown|reboot)\b/.test(linha) ||
    /\b(install|uninstall|remove)\b/.test(linha) ||
    /push\s+--force|--force\s+push|reset\s+--hard|clean\s+-fdx/.test(linha)
  if (destrutivo && !confirmado) {
    return {
      ok: false,
      erro: 'comando destrutivo — peça confirmação ao usuário e chame de novo com confirmado=true',
      comando: cmd,
      args
    }
  }
  if (!/^[a-zA-Z0-9._+-]+$/.test(cmd)) {
    return { ok: false, erro: 'comando invalido' }
  }
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: raiz,
      timeout: 20000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      shell: false,
      encoding: 'utf8'
    })
    const texto = (String(stdout || '') + (stderr ? '\n' + String(stderr) : '')).slice(0, 12000)
    return { ok: true, texto }
  } catch (e: unknown) {
    const err = e as { message?: string; stdout?: string; stderr?: string }
    return {
      ok: false,
      erro: err.message || String(e),
      stdout: err.stdout || '',
      stderr: err.stderr || ''
    }
  }
}

export async function gitCommit(
  raiz: string,
  mensagem: string,
  confirmado = false
): Promise<Record<string, unknown>> {
  if (!confirmado) {
    return { ok: false, erro: 'git_commit exige confirmado=true (revise a mensagem antes)' }
  }
  const msg = String(mensagem || '').trim()
  if (!msg || msg.length > 500) return { ok: false, erro: 'mensagem invalida (1-500 chars)' }
  const st = await gitStatus(raiz)
  const porcelain = String(st.porcelain || '')
  const linhas = porcelain.split('\n').filter((l) => l.trim() && !l.startsWith('##'))
  if (linhas.length === 0) return { ok: false, erro: 'nada para commitar (working tree limpo)' }
  const add = await run('git', ['-C', raiz, 'add', '-A'], raiz, 30000)
  if (!add.ok) return { ok: false, erro: 'git add falhou', stderr: trunc(add.stderr, 800) }
  const c = await run('git', ['-C', raiz, 'commit', '-m', msg], raiz, 60000)
  return {
    ok: c.ok,
    code: c.code,
    stdout: trunc(c.stdout, 2000),
    stderr: trunc(c.stderr, 1000),
    arquivos: linhas.length
  }
}

export async function gitPush(
  raiz: string,
  confirmado = false
): Promise<Record<string, unknown>> {
  if (!confirmado) {
    return { ok: false, erro: 'git_push exige confirmado=true (publica no remoto)' }
  }
  const branch = await run('git', ['-C', raiz, 'rev-parse', '--abbrev-ref', 'HEAD'], raiz, 8000)
  const atual = (branch.stdout || '').trim()
  if (!atual || atual === 'HEAD') return { ok: false, erro: 'branch indeterminada' }
  const p = await run('git', ['-C', raiz, 'push', 'origin', atual], raiz, 120000)
  return {
    ok: p.ok,
    branch: atual,
    code: p.code,
    stdout: trunc(p.stdout, 2000),
    stderr: trunc(p.stderr, 1000)
  }
}

export async function codigoEditar(
  raiz: string,
  arquivo: string,
  ancora: string,
  novo: string,
  verificar = true
): Promise<Record<string, unknown>> {
  const caminho = resolve(raiz, arquivo)
  if (!existsSync(caminho)) {
    return { ok: false, erro: 'arquivo nao encontrado: ' + arquivo }
  }
  const conteudo = readFileSync(caminho, 'utf8')
  if (!conteudo.includes(ancora)) {
    return { ok: false, erro: 'ancora nao encontrada no arquivo' }
  }
  const ocorrencias = (conteudo.match(new RegExp(ancora.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
  if (ocorrencias !== 1) {
    return { ok: false, erro: `ancora encontrada ${ocorrencias} vezes — deve ser exatamente 1` }
  }
  const novoConteudo = conteudo.replace(ancora, novo)
  writeFileSync(caminho, novoConteudo, 'utf8')
  if (verificar) {
    const tsc = await run('tsc', ['--noEmit'], raiz, 60000)
    if (!tsc.ok) {
      writeFileSync(caminho, conteudo, 'utf8')
      return { ok: false, erro: 'typecheck falhou — edição revertida', stderr: tsc.stderr }
    }
  }
  return { ok: true, arquivo, alterado: true }
}
