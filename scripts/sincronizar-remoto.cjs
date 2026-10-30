#!/usr/bin/env node
/**
 * Sincroniza D:\CURSOR\DG Editor com o remoto (espelho do /workspace no Cloud Agent).
 * Só age no Windows, na pasta canônica. No Linux/cloud: no-op.
 *
 * Uso: node scripts/sincronizar-remoto.cjs
 */
'use strict'

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const RAIZ_WIN = 'D:\\CURSOR\\DG Editor'
const BRANCH = 'feat/vault-markdown'

function log(msg) {
  const line = '[sync-remoto] ' + msg
  try {
    console.log(line)
  } catch { /* ignore */ }
  try {
    const logDir = path.join(RAIZ_WIN, '.dg-editor', 'logs')
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
    fs.appendFileSync(
      path.join(logDir, 'sync-remoto.log'),
      '[' + new Date().toISOString() + '] ' + msg + '\n',
      'utf8'
    )
  } catch { /* ignore */ }
}

function git(cwd, args) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  })
}

function main() {
  if (process.platform !== 'win32') {
    log('noop (nao-windows)')
    return 0
  }
  if (!fs.existsSync(path.join(RAIZ_WIN, 'package.json'))) {
    log('pasta canonica ausente: ' + RAIZ_WIN)
    return 1
  }
  if (!fs.existsSync(path.join(RAIZ_WIN, '.git'))) {
    log('sem .git em ' + RAIZ_WIN + ' — clone necessario uma vez')
    return 1
  }

  process.chdir(RAIZ_WIN)
  try {
    fs.writeFileSync(path.join(RAIZ_WIN, '.dg-root'), RAIZ_WIN + '\n', 'utf8')
  } catch { /* ignore */ }

  let r = git(RAIZ_WIN, ['remote', 'get-url', 'origin'])
  if (r.status !== 0) {
    log('sem remote origin')
    return 1
  }
  log('origin=' + String(r.stdout || '').trim())

  r = git(RAIZ_WIN, ['fetch', 'origin', BRANCH])
  if (r.status !== 0) {
    log('fetch falhou: ' + String(r.stderr || r.stdout || '').slice(0, 300))
    return 1
  }

  r = git(RAIZ_WIN, ['checkout', '-B', BRANCH, 'origin/' + BRANCH])
  if (r.status !== 0) {
    log('checkout falhou: ' + String(r.stderr || r.stdout || '').slice(0, 300))
    // tenta reset hard na branch atual se ja estiver nela
    const cur = git(RAIZ_WIN, ['rev-parse', '--abbrev-ref', 'HEAD'])
    if (String(cur.stdout || '').trim() !== BRANCH) {
      return 1
    }
  }

  r = git(RAIZ_WIN, ['reset', '--hard', 'origin/' + BRANCH])
  if (r.status !== 0) {
    log('reset --hard falhou: ' + String(r.stderr || r.stdout || '').slice(0, 300))
    return 1
  }

  // limpa arquivos nao rastreados perigosos de boot antigo? soft: so reporta
  const head = git(RAIZ_WIN, ['rev-parse', '--short', 'HEAD'])
  log('ok HEAD=' + String(head.stdout || '').trim() + ' branch=' + BRANCH)

  // reaplica launchers silenciosos apos sync
  const garantir = path.join(RAIZ_WIN, 'scripts', 'garantir-launchers.cjs')
  if (fs.existsSync(garantir)) {
    spawnSync(process.execPath, [garantir], {
      cwd: RAIZ_WIN,
      windowsHide: true,
      stdio: 'ignore'
    })
    log('garantir-launchers ok')
  }

  const atalho = path.join(RAIZ_WIN, 'scripts', 'criar-atalho-desktop.ps1')
  if (fs.existsSync(atalho)) {
    spawnSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', atalho],
      { cwd: RAIZ_WIN, windowsHide: true, stdio: 'ignore' }
    )
    log('atalho atualizado')
  }

  return 0
}

process.exit(main())
