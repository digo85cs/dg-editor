# Cria/corrige o atalho "DG Editor" na Area de Trabalho do Windows.
# Alvo: wscript.exe → abrir-dg-editor.vbs (NUNCA node_modules\electron\dist).
# Desktop canônico deste PC: C:\Users\digo8\OneDrive\Desktop
$ErrorActionPreference = 'Stop'

function Get-RaizProjeto {
  $candidatos = @()
  if ($PSCommandPath) { $candidatos += (Split-Path -Parent $PSCommandPath) }
  if ($MyInvocation.MyCommand.Path) { $candidatos += (Split-Path -Parent $MyInvocation.MyCommand.Path) }
  if ($PSScriptRoot) { $candidatos += $PSScriptRoot }
  $candidatos += (Get-Location).Path

  foreach ($c in $candidatos) {
    if (-not $c) { continue }
    $atual = $c
    for ($i = 0; $i -lt 6; $i++) {
      $temLauncher = (Test-Path (Join-Path $atual 'abrir-dg-editor.vbs')) -or (Test-Path (Join-Path $atual 'abrir-dg-editor.bat'))
      if ((Test-Path (Join-Path $atual 'package.json')) -and $temLauncher) {
        return $atual
      }
      if (Test-Path (Join-Path $atual 'package.json')) { return $atual }
      $pai = Split-Path -Parent $atual
      if (-not $pai -or $pai -eq $atual) { break }
      $atual = $pai
    }
  }
  return $null
}

function Get-PastasDesktop {
  $pastas = New-Object System.Collections.Generic.List[string]
  $add = {
    param($p)
    if ($p -and (Test-Path -LiteralPath $p) -and -not $pastas.Contains($p)) {
      [void]$pastas.Add($p)
    }
  }

  # 1) Desktop OneDrive deste usuario (pedido explicito)
  & $add 'C:\Users\digo8\OneDrive\Desktop'
  & $add (Join-Path $env:USERPROFILE 'OneDrive\Desktop')

  # 2) Desktop resolvido pelo Windows
  & $add ([Environment]::GetFolderPath('Desktop'))
  & $add (Join-Path $env:USERPROFILE 'Desktop')

  $one = $env:OneDrive
  if ($one) {
    & $add (Join-Path $one 'Desktop')
    & $add (Join-Path $one 'Área de Trabalho')
    & $add (Join-Path $one 'Area de Trabalho')
  }

  return ,$pastas.ToArray()
}

function Test-AlvoRuim {
  param(
    [string]$alvo,
    [string]$nome,
    [string]$argumentos = ''
  )
  if (-not $alvo) { return $false }
  if ($nome -eq 'Dg Editor.lnk') { return $true }
  if ($alvo -match 'node_modules[\\/]+electron([\\/]+dist)?') { return $true }
  if ($alvo -match '(^|[\\/])electron\.exe$') { return $true }
  if ($alvo -match '[\\/]electron[\\/]dist([\\/]|$)') { return $true }
  # npm / electron-vite / cmd de build = console preto (ruim)
  if ($alvo -match '(^|[\\/])(npm|npm\.cmd|npx|npx\.cmd)$') { return $true }
  if ($alvo -match '(^|[\\/])cmd\.exe$' -and $argumentos -match 'npm|electron-vite|vite') { return $true }
  if ($nome -eq 'DG Editor.lnk') {
    $alvoBaixo = $alvo.ToLowerInvariant()
    $argsBaixo = [string]$argumentos
    # Correto APENAS: wscript + abrir-dg-editor.vbs (bat direto abre cmd — proibido)
    $okWscript = ($alvoBaixo -match 'wscript\.exe$') -and ($argsBaixo -match 'abrir-dg-editor\.vbs')
    if (-not $okWscript) { return $true }
  }
  return $false
}

$raizFixa = 'D:\CURSOR\DG Editor'
$raiz = $null
if (Test-Path (Join-Path $raizFixa 'package.json')) {
  $raiz = $raizFixa
} else {
  $raiz = Get-RaizProjeto
}
if (-not $raiz) {
  Write-Host '[ERRO] nao achei a raiz do DG Editor — esperado: D:\CURSOR\DG Editor' -ForegroundColor Red
  exit 1
}

# Sempre grava o VBS (nao depende de git pull) e forca atalho = wscript + vbs
$launcher = Join-Path $raiz 'abrir-dg-editor.vbs'
$vbsBody = @'
' Abre o DG Editor sem NENHUMA janela de console (cmd/powershell/vite).
Option Explicit
Dim sh, raiz, splash, boot, cmd, fso
raiz = "D:\CURSOR\DG Editor"
splash = raiz & "\scripts\splash-boot.ps1"
boot = raiz & "\dg-boot.ps1"
Set fso = CreateObject("Scripting.FileSystemObject")
On Error Resume Next
fso.CreateTextFile(raiz & "\.dg-root", True).Write raiz
On Error GoTo 0
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = raiz
If fso.FileExists(splash) Then
  cmd = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & splash & """"
ElseIf fso.FileExists(boot) Then
  cmd = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & boot & """ -Silent"
Else
  WScript.Quit 1
End If
sh.Run cmd, 0, False
'@
Set-Content -LiteralPath $launcher -Value $vbsBody -Encoding ASCII -Force

$batAbrir = Join-Path $raiz 'abrir-dg-editor.bat'
@(
  '@echo off',
  'set "DG_ROOT=D:\CURSOR\DG Editor"',
  'if not exist "%DG_ROOT%\abrir-dg-editor.vbs" exit /b 1',
  'start "" /min wscript.exe //nologo "%DG_ROOT%\abrir-dg-editor.vbs"',
  'exit /b 0'
) | Set-Content -LiteralPath $batAbrir -Encoding ASCII -Force

# Garante scripts de start silencioso (mata electron-vite preview no npm start antigo)
$garantir = Join-Path $raiz 'scripts\garantir-launchers.cjs'
if (Test-Path $garantir) {
  try {
    & node.exe $garantir 2>$null
  } catch {}
}

try {
  Set-Content -LiteralPath (Join-Path $raiz '.dg-root') -Value $raiz -Encoding ASCII -Force
} catch {}
$env:DG_ROOT = $raiz

$desktops = Get-PastasDesktop
if (-not $desktops -or $desktops.Count -eq 0) {
  # Força criar a pasta OneDrive Desktop se o path canônico existir como pai
  $deskCanon = 'C:\Users\digo8\OneDrive\Desktop'
  $pai = Split-Path -Parent $deskCanon
  if (Test-Path -LiteralPath $pai) {
    New-Item -ItemType Directory -Path $deskCanon -Force | Out-Null
    $desktops = @($deskCanon)
  }
}
if (-not $desktops -or $desktops.Count -eq 0) {
  Write-Host '[ERRO] Area de Trabalho nao encontrada' -ForegroundColor Red
  exit 1
}

Write-Host ('[info] pastas Desktop: ' + ($desktops -join ' | ')) -ForegroundColor Gray

$nome = 'DG Editor.lnk'
$icoCandidate = Join-Path $raiz 'resources\dg-editor.ico'
if (-not (Test-Path $icoCandidate)) {
  $icoCandidate = Join-Path $raiz 'resources\dg-studio.ico'
}

$lnkPrincipal = $null
foreach ($desktop in $desktops) {
  Get-ChildItem -Path $desktop -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $sh = New-Object -ComObject WScript.Shell
      $existente = $sh.CreateShortcut($_.FullName)
      $alvo = [string]$existente.TargetPath
      $argsLnk = [string]$existente.Arguments
      if (Test-AlvoRuim -alvo $alvo -nome $_.Name -argumentos $argsLnk) {
        Write-Host ('[atalho] removendo: ' + $_.FullName + ' -> ' + $alvo + ' ' + $argsLnk) -ForegroundColor Yellow
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
      }
    } catch {}
  }

  $lnkPath = Join-Path $desktop $nome
  $w = New-Object -ComObject WScript.Shell
  $lnk = $w.CreateShortcut($lnkPath)
  # SEMPRE wscript + vbs (nunca .bat — abre cmd)
  $lnk.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
  $lnk.Arguments = '//nologo "' + $launcher + '"'
  $lnk.WindowStyle = 7
  $lnk.WorkingDirectory = $raiz
  $lnk.Description = 'DG Editor (sem console)'
  if (Test-Path $icoCandidate) {
    $lnk.IconLocation = $icoCandidate + ',0'
  }
  $lnk.Save()
  Write-Host ('[ok] Atalho: ' + $lnkPath) -ForegroundColor Green
  Write-Host ('[ok] Alvo:  wscript -> ' + $launcher) -ForegroundColor Green
  if (-not $lnkPrincipal) { $lnkPrincipal = $lnkPath }
}

# Atalhos que abrem o exe empacotado (dist-app) ou o electron.exe solto.
# Esse caminho nao passa pelo .vbs e volta a abrir varias copias.
$pastasAtalho = @($desktops)
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
if (Test-Path -LiteralPath $startMenu) { $pastasAtalho += $startMenu }
$startMenuAll = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs'
if (Test-Path -LiteralPath $startMenuAll) { $pastasAtalho += $startMenuAll }
foreach ($pasta in $pastasAtalho) {
  Get-ChildItem -Path $pasta -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Name -eq 'DG Editor.lnk' -and $desktops -contains $_.DirectoryName) { return }
    try {
      $sh = New-Object -ComObject WScript.Shell
      $existente = $sh.CreateShortcut($_.FullName)
      $alvo = [string]$existente.TargetPath
      if ($alvo -match 'dist-app|win-unpacked|node_modules\\electron') {
        Write-Host ('[atalho] removendo exe antigo: ' + $_.FullName) -ForegroundColor Yellow
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
      }
    } catch {}
  }
}

Write-Host ''
Write-Host ('Pronto. Use: ' + $lnkPrincipal) -ForegroundColor Cyan
exit 0
