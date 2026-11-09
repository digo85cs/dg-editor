#!/usr/bin/env node
/**
 * Garante launchers silenciosos e corrige npm start / electron-vite preview.
 * Roda no postinstall, prestart e no boot do Electron (Windows).
 *
 * Efeito: mesmo boot ANTIGO que chama `npm start` deixa de abrir vite/cmd,
 * porque o shim de electron-vite + package.json.start apontam para iniciar-app.
 */
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const RAIZ_WIN = 'D:\\CURSOR\\DG Editor'

const VBS = [
  "' Abre o DG Editor sem NENHUMA janela de console (cmd/powershell/vite).",
  "' Atalho: wscript + ESTE arquivo.",
  'Option Explicit',
  'Dim sh, raiz, splash, boot, cmd, fso',
  'raiz = "D:\\CURSOR\\DG Editor"',
  'splash = raiz & "\\scripts\\splash-boot.ps1"',
  'boot = raiz & "\\dg-boot.ps1"',
  'Set fso = CreateObject("Scripting.FileSystemObject")',
  'On Error Resume Next',
  'fso.CreateTextFile(raiz & "\\.dg-root", True).Write raiz',
  'On Error GoTo 0',
  'Set sh = CreateObject("WScript.Shell")',
  'sh.CurrentDirectory = raiz',
  'If fso.FileExists(splash) Then',
  '  cmd = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & splash & """"',
  'ElseIf fso.FileExists(boot) Then',
  '  cmd = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & boot & """ -Silent"',
  'Else',
  '  WScript.Quit 1',
  'End If',
  'sh.Run cmd, 0, False',
  ''
].join('\r\n')

const BAT_ABRIR = [
  '@echo off',
  'set "DG_ROOT=D:\\CURSOR\\DG Editor"',
  'if not exist "%DG_ROOT%\\abrir-dg-editor.vbs" exit /b 1',
  'start "" /min wscript.exe //nologo "%DG_ROOT%\\abrir-dg-editor.vbs"',
  'exit /b 0',
  ''
].join('\r\n')

const BAT_ATALHO = [
  '@echo off',
  'cd /d "D:\\CURSOR\\DG Editor"',
  'if not exist "D:\\CURSOR\\DG Editor\\package.json" exit /b 1',
  'powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "D:\\CURSOR\\DG Editor\\scripts\\criar-atalho-desktop.ps1"',
  'exit /b %ERRORLEVEL%',
  ''
].join('\r\n')

/** Shim: electron-vite preview/dev → app silenciosa; build/outros → binario real. */
const SHIM_CMD = [
  '@echo off',
  'setlocal',
  'set "DG_ROOT=%~dp0..\\.."',
  'for %%I in ("%DG_ROOT%") do set "DG_ROOT=%%~fI"',
  'if /I "%~1"=="preview" goto :silent',
  'node "%~dp0\\..\\electron-vite\\bin\\electron-vite.js" %*',
  'exit /b %ERRORLEVEL%',
  ':silent',
  'node "%DG_ROOT%\\scripts\\iniciar-app.cjs"',
  'exit /b %ERRORLEVEL%',
  ''
].join('\r\n')

const SHIM_JS = `#!/usr/bin/env node
'use strict'
const { spawnSync } = require('child_process')
const path = require('path')
const root = path.resolve(__dirname, '..', '..')
const arg = process.argv[2]
if (arg === 'preview') {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'iniciar-app.cjs')], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, DG_ROOT: process.env.DG_ROOT || root }
  })
  process.exit(r.status == null ? 1 : r.status)
}
const real = path.join(__dirname, '..', 'electron-vite', 'bin', 'electron-vite.js')
const r2 = spawnSync(process.execPath, [real, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  stdio: 'inherit',
  windowsHide: true,
  env: process.env
})
process.exit(r2.status == null ? 1 : r2.status)
`

function escrever(abs, conteudo) {
  const dir = path.dirname(abs)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const novo = conteudo.replace(/\n/g, '\r\n').replace(/\r\r\n/g, '\r\n')
  try {
    if (fs.existsSync(abs)) {
      const atual = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n').trim()
      if (atual === conteudo.replace(/\r\n/g, '\n').trim()) return false
    }
  } catch { /* segue */ }
  fs.writeFileSync(abs, novo, 'utf8')
  return true
}

function patchPackageJson() {
  const pkgPath = path.join(ROOT, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  let mudou = false
  if (!pkg.scripts) pkg.scripts = {}
  if (pkg.scripts.start !== 'node scripts/iniciar-app.cjs') {
    pkg.scripts.start = 'node scripts/iniciar-app.cjs'
    mudou = true
  }
  if (pkg.scripts.prestart !== 'node scripts/garantir-launchers.cjs') {
    pkg.scripts.prestart = 'node scripts/garantir-launchers.cjs'
    mudou = true
  }
  if (typeof pkg.scripts.postinstall === 'string' && !pkg.scripts.postinstall.includes('garantir-launchers')) {
    pkg.scripts.postinstall = pkg.scripts.postinstall + ' && node scripts/garantir-launchers.cjs'
    mudou = true
  }
  if (mudou) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + '\n', 'utf8')
  }
  return mudou
}

function instalarShimElectronVite() {
  const bin = path.join(ROOT, 'node_modules', '.bin')
  if (!fs.existsSync(bin)) return false
  let n = 0
  // Windows: .cmd (arquivo real — npm start antigo cai aqui)
  if (escrever(path.join(bin, 'electron-vite.cmd'), SHIM_CMD)) n++
  // Unix/npm: .bin/electron-vite costuma ser SYMLINK para o pacote.
  // NUNCA escrever no symlink (destrói electron-vite/bin/electron-vite.js).
  const shimPath = path.join(bin, 'electron-vite')
  try {
    const st = fs.lstatSync(shimPath)
    if (st.isSymbolicLink() || st.isFile()) {
      fs.unlinkSync(shimPath)
    }
  } catch { /* ausente */ }
  try {
    fs.writeFileSync(shimPath, SHIM_JS, { encoding: 'utf8', mode: 0o755 })
    n++
  } catch { /* ignore */ }
  return n > 0
}

function main() {
  const feitos = []
  // No Windows a raiz oficial e sempre D:\CURSOR\DG Editor
  const alvo =
    process.platform === 'win32' && fs.existsSync(path.join(RAIZ_WIN, 'package.json'))
      ? RAIZ_WIN
      : ROOT
  if (escrever(path.join(alvo, 'abrir-dg-editor.vbs'), VBS)) feitos.push('abrir-dg-editor.vbs')
  if (escrever(path.join(alvo, 'abrir-dg-editor.bat'), BAT_ABRIR)) feitos.push('abrir-dg-editor.bat')
  if (escrever(path.join(alvo, 'atualizar-atalho-desktop.bat'), BAT_ATALHO)) feitos.push('atualizar-atalho-desktop.bat')
  if (escrever(path.join(alvo, 'corrigir-atalho-desktop.bat'), BAT_ATALHO)) feitos.push('corrigir-atalho-desktop.bat')
  try {
    fs.writeFileSync(path.join(alvo, '.dg-root'), (alvo === RAIZ_WIN ? RAIZ_WIN : alvo) + '\n', 'utf8')
  } catch { /* ignore */ }
  // package.json / shim: usa ROOT (cwd do script) — no PC ROOT == RAIZ_WIN apos sync
  if (patchPackageJson()) feitos.push('package.json#start')
  if (instalarShimElectronVite()) feitos.push('shim:electron-vite')
  const markerDir = path.join(alvo, '.dg-editor')
  if (!fs.existsSync(markerDir)) fs.mkdirSync(markerDir, { recursive: true })
  fs.writeFileSync(
    path.join(markerDir, 'boot-silent.flag'),
    'version=5\nraiz=' + alvo + '\nmodo=somente-local\nstart=iniciar-app\natalho=wscript+vbs\n',
    'utf8'
  )
  if (process.argv.includes('--verbose') || feitos.length) {
    console.log('[garantir-launchers] ok raiz=' + alvo + (feitos.length ? ': ' + feitos.join(', ') : ' (ja atualizado)'))
  }
}

main()
