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
  param([string]$alvo, [string]$nome)
  if (-not $alvo) { return $false }
  if ($nome -eq 'Dg Editor.lnk') { return $true }
  if ($alvo -match 'node_modules[\\/]+electron([\\/]+dist)?') { return $true }
  if ($alvo -match '(^|[\\/])electron\.exe$') { return $true }
  if ($alvo -match '[\\/]electron[\\/]dist([\\/]|$)') { return $true }
  # atalho DG Editor deve apontar para o launcher sem console (.vbs)
  if ($nome -eq 'DG Editor.lnk' -and $alvo -notmatch 'abrir-dg-editor\.(vbs|bat)$') { return $true }
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

$launcher = Join-Path $raiz 'abrir-dg-editor.vbs'
if (-not (Test-Path $launcher)) {
  $launcher = Join-Path $raiz 'abrir-dg-editor.bat'
}
if (-not (Test-Path $launcher)) {
  Write-Host '[ERRO] falta abrir-dg-editor.vbs/bat em ' $raiz -ForegroundColor Red
  Write-Host '[dica] git pull origin feat/vault-markdown' -ForegroundColor Yellow
  exit 1
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
      if (Test-AlvoRuim -alvo $alvo -nome $_.Name) {
        Write-Host ('[atalho] removendo: ' + $_.FullName + ' -> ' + $alvo) -ForegroundColor Yellow
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
      }
    } catch {}
  }

  $lnkPath = Join-Path $desktop $nome
  $w = New-Object -ComObject WScript.Shell
  $lnk = $w.CreateShortcut($lnkPath)
  # .vbs via wscript = nenhuma janela de terminal (NAO aponte para .bat/.ps1)
  if ($launcher -like '*.vbs') {
    $lnk.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
    $lnk.Arguments = '//nologo "' + $launcher + '"'
    # 7 = minimizado — wscript em si nao mostra UI; evita flash de console
    $lnk.WindowStyle = 7
  } else {
    $lnk.TargetPath = $launcher
    $lnk.Arguments = ''
    $lnk.WindowStyle = 7
  }
  $lnk.WorkingDirectory = $raiz
  $lnk.Description = 'DG Editor (sem console)'
  if (Test-Path $icoCandidate) {
    $lnk.IconLocation = $icoCandidate + ',0'
  }
  $lnk.Save()
  Write-Host ('[ok] Atalho: ' + $lnkPath) -ForegroundColor Green
  Write-Host ('[ok] Alvo:  ' + $launcher) -ForegroundColor Green
  if (-not $lnkPrincipal) { $lnkPrincipal = $lnkPath }
}

Write-Host ''
Write-Host ('Pronto. Use: ' + $lnkPrincipal) -ForegroundColor Cyan
exit 0
