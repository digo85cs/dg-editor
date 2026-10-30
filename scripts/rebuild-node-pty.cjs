#!/usr/bin/env node
/**
 * Rebuild do node-pty no postinstall.
 * Nao deve derrubar o boot: pasta com espaco (ex.: D:\\CURSOR\\DG Editor)
 * costuma falhar no node-gyp — o app ainda sobe sem PTY nativo perfeito.
 */
'use strict'

const { spawnSync } = require('child_process')
const path = require('path')

const root = path.resolve(__dirname, '..')
const isWin = process.platform === 'win32'
const bin = path.join(
  root,
  'node_modules',
  '.bin',
  isWin ? 'electron-rebuild.cmd' : 'electron-rebuild'
)

console.log('[rebuild-node-pty] tentando electron-rebuild -f -w node-pty ...')
const r = spawnSync(bin, ['-f', '-w', 'node-pty'], {
  cwd: root,
  stdio: 'inherit',
  shell: isWin,
  env: process.env,
  windowsHide: true
})

if (r.error || (typeof r.status === 'number' && r.status !== 0)) {
  console.warn(
    '[rebuild-node-pty] aviso: rebuild falhou/pulado (espaco no caminho ou toolchains). Continuando.'
  )
  process.exit(0)
}
console.log('[rebuild-node-pty] ok')
process.exit(0)
