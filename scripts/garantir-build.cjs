#!/usr/bin/env node
/**
 * Garante out/main/index.js antes de dev/start (checkout limpo).
 * Fast path: se já existe, não faz nada.
 */
'use strict'

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const isWin = process.platform === 'win32'
const outMain = path.join(root, 'out', 'main', 'index.js')

if (fs.existsSync(outMain)) {
  console.log('[iniciar-app] out/ OK — iniciando')
  process.exit(0)
}

console.log('[iniciar-app] out/ ausente — rodando build inicial...')
const r = spawnSync('npx', ['--no-install', 'electron-vite', 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
  windowsHide: true,
  shell: isWin,
})
if (r.error || r.status !== 0) {
  console.error('[garantir-build] build falhou (exit ' + String(r && r.status) + '). Rode: npm run build')
  process.exit(typeof r.status === 'number' && r.status ? r.status : 1)
}
if (!fs.existsSync(outMain)) {
  console.error('[garantir-build] build concluiu mas out/main/index.js não existe. Rode: npm run build')
  process.exit(1)
}
console.log('[garantir-build] build OK')
