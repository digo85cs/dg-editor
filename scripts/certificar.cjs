#!/usr/bin/env node
/**
 * Certificacao automatica do DG Editor no workspace Cursor.
 * Roda typecheck + test + build e grava relatorio.
 * Uso: npm run certificar
 */
'use strict'

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const outDir = path.join(ROOT, '.dg-editor', 'logs')
const reportPath = path.join(outDir, 'certificacao.json')
const reportMd = path.join(outDir, 'certificacao.md')

function run(name, cmd, args) {
  const started = Date.now()
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, DG_QA_SEM_PTY: '1' },
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true
  })
  return {
    name,
    ok: r.status === 0,
    code: r.status,
    ms: Date.now() - started,
    stdout: (r.stdout || '').slice(-4000),
    stderr: (r.stderr || '').slice(-4000)
  }
}

function essencialExiste(rel) {
  return fs.existsSync(path.join(ROOT, rel))
}

const essenciais = [
  'package.json',
  'abrir-dg-editor.vbs',
  'abrir-dg-editor.bat',
  'dg-boot.ps1',
  'scripts/splash-boot.ps1',
  'scripts/criar-atalho-desktop.ps1',
  'scripts/limpeza-workspace.cjs',
  'scripts/sincronizar-windows.ps1',
  'scripts/iniciar-app.cjs',
  'scripts/garantir-launchers.cjs',
  'src/main/win-self-heal.ts',
  'src/main/index.ts',
  'resources/dg-editor.ico',
  '.dg-editor/modelos.default.json',
  '.dg-editor/skills',
  '.dg-editor/agentes'
]

console.log('DG Editor — certificacao')
console.log('raiz: ' + ROOT)

const checks = essenciais.map((rel) => ({
  rel,
  ok: essencialExiste(rel)
}))
const missing = checks.filter((c) => !c.ok)

const steps = []
if (missing.length === 0) {
  steps.push({ name: 'essenciais', ok: true, code: 0, ms: 0, stdout: 'ok', stderr: '' })
} else {
  steps.push({
    name: 'essenciais',
    ok: false,
    code: 1,
    ms: 0,
    stdout: '',
    stderr: 'faltam: ' + missing.map((m) => m.rel).join(', ')
  })
}

const node = process.execPath
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

if (missing.length === 0) {
  steps.push(run('typecheck', npm, ['run', 'typecheck']))
  steps.push(run('test', npm, ['test']))
  steps.push(run('build', npm, ['run', 'build']))
}

const outMain = path.join(ROOT, 'out', 'main', 'index.js')
const outRend = path.join(ROOT, 'out', 'renderer', 'index.html')
const outOk = fs.existsSync(outMain) && fs.existsSync(outRend)
steps.push({
  name: 'artefatos-out',
  ok: outOk,
  code: outOk ? 0 : 1,
  ms: 0,
  stdout: outOk ? 'out/main + out/renderer' : '',
  stderr: outOk ? '' : 'out/ incompleto'
})

const ok = steps.every((s) => s.ok)
const report = {
  ok,
  when: new Date().toISOString(),
  root: ROOT,
  branch: (process.env.GIT_BRANCH || '').trim() || null,
  steps: steps.map((s) => ({
    name: s.name,
    ok: s.ok,
    code: s.code,
    ms: s.ms
  })),
  essenciais: checks
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')

const lines = [
  '# Certificacao DG Editor',
  '',
  '- Resultado: **' + (ok ? 'PASS' : 'FAIL') + '**',
  '- Quando: ' + report.when,
  '- Raiz: `' + ROOT + '`',
  '',
  '## Etapas',
  ...steps.map(
    (s) =>
      '- ' +
      (s.ok ? 'PASS' : 'FAIL') +
      ' `' +
      s.name +
      '` (' +
      s.ms +
      ' ms)' +
      (s.stderr && !s.ok ? ' — ' + s.stderr.split('\n')[0] : '')
  ),
  '',
  '## Launchers / essenciais',
  ...checks.map((c) => '- ' + (c.ok ? 'ok' : 'FALTA') + ' `' + c.rel + '`'),
  ''
]
fs.writeFileSync(reportMd, lines.join('\n'), 'utf8')

for (const s of steps) {
  console.log((s.ok ? '[PASS]' : '[FAIL]') + ' ' + s.name + (s.ms ? ' ' + s.ms + 'ms' : ''))
  if (!s.ok && s.stderr) console.log(s.stderr.slice(0, 500))
}
console.log('')
console.log(ok ? 'CERTIFICADO: DG Editor apto a rodar' : 'FALHA na certificacao')
console.log('relatorio: ' + reportMd)
process.exit(ok ? 0 : 1)
