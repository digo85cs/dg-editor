#!/usr/bin/env node
/**
 * Inicia o Electron sem vite/preview e sem prender console.
 * Uso: node scripts/iniciar-app.cjs
 * (npm start aponta para caqui — nao use electron-vite preview no dia a dia)
 */
'use strict'

const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const RAIZ_WIN = 'D:\\CURSOR\\DG Editor'

try {
  spawnSync(process.execPath, [path.join(__dirname, 'garantir-launchers.cjs')], {
    cwd: ROOT,
    stdio: 'ignore',
    windowsHide: true
  })
} catch { /* ignore */ }

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

const raiz = resolverRaiz()
process.env.DG_ROOT = raiz

const electronExe =
  process.platform === 'win32'
    ? path.join(raiz, 'node_modules', 'electron', 'dist', 'electron.exe')
    : path.join(raiz, 'node_modules', 'electron', 'dist', 'electron')

if (!fs.existsSync(electronExe)) {
  console.error('[iniciar-app] electron nao encontrado em ' + electronExe)
  process.exit(1)
}

const outMain = path.join(raiz, 'out', 'main', 'index.js')
if (!fs.existsSync(outMain)) {
  console.error('[iniciar-app] falta out/main/index.js — rode o build antes')
  process.exit(1)
}

const child = spawn(electronExe, [raiz, '--no-sandbox'], {
  cwd: raiz,
  env: { ...process.env, DG_ROOT: raiz },
  detached: true,
  stdio: 'ignore',
  windowsHide: true
})
child.unref()
process.exit(0)
