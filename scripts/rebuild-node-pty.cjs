#!/usr/bin/env node
/**
 * Rebuild do node-pty no postinstall.
 * Nao deve derrubar o boot: pasta com espaco (ex.: D:\CURSOR\DG Editor)
 * pode falhar no node-gyp; o app ainda sobe sem PTY nativo perfeito.
 * DG_STRICT_REBUILD=1 => falha interrompe o processo.
 */
'use strict'

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const isWin = process.platform === 'win32'
const strict = process.env.DG_STRICT_REBUILD === '1'

function run(cmd, args, opts) {
  return spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
    ...opts,
  })
}

function ok(r) {
  return r && !r.error && r.status === 0
}

const args = ['-f', '-w', 'node-pty']
console.log('[rebuild-node-pty] tentando rebuild do node-pty ...')

let r = null
// 1) npx --no-install (usa dep local; cwd via API — seguro com espaços)
r = run('npx', ['--no-install', 'electron-rebuild', ...args], { shell: isWin })

// 2) fallback: CLI JS direto (evita .cmd/shell e problemas de quoting com espaços)
if (!ok(r)) {
  const cliJs = path.join(root, 'node_modules', '@electron', 'rebuild', 'lib', 'cli.js')
  if (fs.existsSync(cliJs)) {
    console.log('[rebuild-node-pty] fallback: node @electron/rebuild cli.js ...')
    r = run(process.execPath, [cliJs, ...args], { shell: false })
  }
}

if (!ok(r)) {
  const red = '\x1b[31m'
  const reset = '\x1b[0m'
  const detail = r?.error ? String(r.error.message || r.error) : ('exit ' + String(r?.status))
  console.error(red + '[rebuild-node-pty] FALHA: rebuild do node-pty não concluiu (' + detail + ').' + reset)
  console.error(red + 'TERMINAL NÃO FUNCIONARÁ até rodar: npm run rebuild:pty' + reset)
  if (strict) process.exit(typeof r?.status === "number" && r.status ? r.status : 1)
  process.exit(0)
}

console.log('[rebuild-node-pty] ok')
process.exit(0)
