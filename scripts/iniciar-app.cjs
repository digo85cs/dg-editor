#!/usr/bin/env node
/**
 * Inicia o Electron SEM console visivel.
 * Uso: node scripts/iniciar-app.cjs
 */
'use strict'

const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const RAIZ_WIN = 'D:\\CURSOR\\DG Editor'
const isWin = process.platform === 'win32'

try {
  spawnSync(process.execPath, [path.join(__dirname, 'garantir-launchers.cjs')], {
    cwd: ROOT,
    stdio: 'ignore',
    windowsHide: true
  })
} catch {
  /* ignore */
}

function resolverRaiz() {
  if (process.env.DG_ROOT && fs.existsSync(path.join(process.env.DG_ROOT, 'package.json'))) {
    return path.resolve(process.env.DG_ROOT)
  }
  if (process.platform === 'win32' && fs.existsSync(path.join(RAIZ_WIN, 'package.json'))) {
    return RAIZ_WIN
  }
  if (fs.existsSync(path.join(ROOT, 'package.json'))) return ROOT
  return ROOT
}

function garantirBuild(raiz) {
  const outMain = path.join(raiz, 'out', 'main', 'index.js')
  if (fs.existsSync(outMain)) return true
  const r = spawnSync('npx', ['--no-install', 'electron-vite', 'build'], {
    cwd: raiz,
    stdio: 'ignore',
    env: process.env,
    windowsHide: true,
    shell: isWin
  })
  if (r.error || r.status !== 0) return false
  return fs.existsSync(outMain)
}

const raiz = resolverRaiz()
process.env.DG_ROOT = raiz

const electronExe =
  process.platform === 'win32'
    ? path.join(raiz, 'node_modules', 'electron', 'dist', 'electron.exe')
    : path.join(raiz, 'node_modules', 'electron', 'dist', 'electron')

if (!fs.existsSync(electronExe)) {
  process.exit(1)
}

if (!garantirBuild(raiz)) process.exit(1)

const child = spawn(electronExe, ['.', '--no-sandbox'], {
  cwd: raiz,
  env: { ...process.env, DG_ROOT: raiz },
  stdio: 'ignore',
  windowsHide: true,
  detached: true
})
child.on('error', () => process.exit(1))
child.unref()
process.exit(0)
