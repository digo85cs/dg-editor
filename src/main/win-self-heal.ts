/**
 * Windows: garante launchers + atalho sem intervenção do usuário.
 * Roda no boot do Electron (CreateNoWindow / wscript).
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import { dglog } from './dglog'
import { resolverRaizProjeto, RAIZ_WINDOWS_CANONICA } from './paths'

const RAIZ_CANONICA = RAIZ_WINDOWS_CANONICA

const VBS = `' Abre o DG Editor sem NENHUMA janela de console (cmd/powershell/vite).
Option Explicit
Dim sh, raiz, ps1, cmd, fso
raiz = "D:\\CURSOR\\DG Editor"
ps1 = raiz & "\\scripts\\splash-boot.ps1"
Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FileExists(ps1) Then
  WScript.Quit 1
End If
On Error Resume Next
fso.CreateTextFile(raiz & "\\.dg-root", True).Write raiz
On Error GoTo 0
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = raiz
cmd = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"
sh.Run cmd, 0, False
`

const BAT_ABRIR = `@echo off
set "DG_ROOT=D:\\CURSOR\\DG Editor"
if not exist "%DG_ROOT%\\abrir-dg-editor.vbs" exit /b 1
start "" /min wscript.exe //nologo "%DG_ROOT%\\abrir-dg-editor.vbs"
exit /b 0
`

const BAT_ATALHO = `@echo off
cd /d "D:\\CURSOR\\DG Editor"
if not exist "D:\\CURSOR\\DG Editor\\package.json" exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "D:\\CURSOR\\DG Editor\\scripts\\criar-atalho-desktop.ps1"
exit /b %ERRORLEVEL%
`

function escreverSeMudou(abs: string, conteudo: string): boolean {
  try {
    if (existsSync(abs)) {
      const atual = readFileSync(abs, 'utf8')
      if (atual.replace(/\r\n/g, '\n').trim() === conteudo.replace(/\r\n/g, '\n').trim()) {
        return false
      }
    }
    const dir = join(abs, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(abs, conteudo.replace(/\n/g, '\r\n'), 'utf8')
    return true
  } catch (e) {
    dglog('[win-self-heal] falha ao escrever ' + abs + ': ' + String(e))
    return false
  }
}

/** Atalho que não abre o .vbs (exe empacotado, electron.exe) volta a multiplicar o processo. */
function atalhoForaDoVbs(): boolean {
  const home = process.env.USERPROFILE || ''
  const appData = process.env.APPDATA || ''
  const candidatos = [
    join(home, 'OneDrive', 'Desktop', 'DG Editor.lnk'),
    join(home, 'Desktop', 'DG Editor.lnk'),
    join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'DG Editor.lnk')
  ]
  for (const p of candidatos) {
    if (!existsSync(p)) continue
    let txt = ''
    try {
      txt = readFileSync(p).toString('utf16le')
    } catch {
      return true
    }
    const ok = /wscript/i.test(txt) && txt.includes('abrir-dg-editor.vbs')
    if (!ok) return true
  }
  return false
}

/** Dentro do Electron, process.execPath e o electron.exe. Script .cjs tem de ir no node. */
function caminhoNode(): string {
  const bases = [
    join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
    join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe')
  ]
  for (const p of bases) {
    if (p && existsSync(p)) return p
  }
  return 'node.exe'
}

function spawnHidden(cmd: string, args: string[], cwd: string): void {
  try {
    const child = spawn(cmd, args, {
      cwd,
      windowsHide: true,
      detached: true,
      stdio: 'ignore',
      shell: false
    })
    child.unref()
  } catch (e) {
    dglog('[win-self-heal] spawn: ' + String(e))
  }
}

/**
 * Garante VBS/BAT/.dg-root e dispara atualizacao silenciosa do atalho.
 * No-op fora do Windows.
 */
export function selfHealWindowsLaunchers(): { ok: boolean; escritos: string[] } {
  if (process.platform !== 'win32') {
    return { ok: true, escritos: [] }
  }

  let raiz = ''
  try {
    raiz = resolverRaizProjeto()
  } catch {
    if (existsSync(join(RAIZ_CANONICA, 'package.json'))) raiz = RAIZ_CANONICA
  }
  if (!raiz || !existsSync(join(raiz, 'package.json'))) {
    dglog('[win-self-heal] raiz indisponivel — pulando')
    return { ok: false, escritos: [] }
  }

  const escritos: string[] = []
  const alvos: Array<[string, string]> = [
    [join(raiz, 'abrir-dg-editor.vbs'), VBS],
    [join(raiz, 'abrir-dg-editor.bat'), BAT_ABRIR],
    [join(raiz, 'atualizar-atalho-desktop.bat'), BAT_ATALHO],
    [join(raiz, 'corrigir-atalho-desktop.bat'), BAT_ATALHO]
  ]

  for (const [abs, body] of alvos) {
    if (escreverSeMudou(abs, body)) escritos.push(abs)
  }

  try {
    writeFileSync(join(raiz, '.dg-root'), raiz + '\n', 'utf8')
  } catch {
    /* ignore */
  }

  const garantir = join(raiz, 'scripts', 'garantir-launchers.cjs')
  if (escritos.length && existsSync(garantir)) {
    spawnHidden(caminhoNode(), [garantir], raiz)
    dglog('[win-self-heal] garantir-launchers agendado')
  }

  const atalhoPs1 = join(raiz, 'scripts', 'criar-atalho-desktop.ps1')
  const atalhoRuim = atalhoForaDoVbs()
  if ((escritos.length || atalhoRuim) && existsSync(atalhoPs1)) {
    const ps =
      process.env.SystemRoot
        ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
        : 'powershell.exe'
    spawnHidden(
      ps,
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', atalhoPs1],
      raiz
    )
    dglog('[win-self-heal] atalho agendado')
  }

  if (escritos.length) {
    dglog('[win-self-heal] gravados: ' + escritos.map((p) => p.split(/[/\\]/).pop()).join(', '))
  } else {
    dglog('[win-self-heal] launchers ok')
  }
  return { ok: true, escritos }
}
