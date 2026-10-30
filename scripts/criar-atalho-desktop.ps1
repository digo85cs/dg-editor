# Cria/corrige o atalho "DG Editor" na Area de Trabalho do Windows.
# Alvo: <raiz>\abrir-dg-editor.bat  (NUNCA node_modules\electron\dist)
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
      if ((Test-Path (Join-Path $atual 'package.json')) -and (Test-Path (Join-Path $atual 'abrir-dg-editor.bat'))) {
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

  & $add ([Environment]::GetFolderPath('Desktop'))
  & $add (Join-Path $env:USERPROFILE 'Desktop')
  & $add (Join-Path $env:USERPROFILE 'OneDrive\Desktop')
  & $add (Join-Path $env:USERPROFILE 'OneDrive\Área de Trabalho')
  & $add (Join-Path $env:USERPROFILE 'OneDrive\Area de Trabalho')

  # Desktop conhecido do OneDrive (quando redirecionado)
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
  return $false
}

$raiz = Get-RaizProjeto
if (-not $raiz) {
  Write-Host '[ERRO] nao achei a raiz do DG Editor (package.json)' -ForegroundColor Red
  exit 1
}

$bat = Join-Path $raiz 'abrir-dg-editor.bat'
if (-not (Test-Path $bat)) {
  $bat = Join-Path $raiz 'dg-boot.bat'
}
if (-not (Test-Path $bat)) {
  Write-Host '[ERRO] abrir-dg-editor.bat / dg-boot.bat nao encontrados em ' $raiz -ForegroundColor Red
  Write-Host '[dica] rode: git checkout feat/vault-markdown; git pull' -ForegroundColor Yellow
  exit 1
}

$desktops = Get-PastasDesktop
if (-not $desktops -or $desktops.Count -eq 0) {
  Write-Host '[ERRO] Area de Trabalho nao encontrada (Desktop / OneDrive\Desktop)' -ForegroundColor Red
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
  # Remove atalhos ruins (electron\dist, electron.exe, nome legado)
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
  $lnk.TargetPath = $bat
  $lnk.WorkingDirectory = $raiz
  $lnk.WindowStyle = 1
  $lnk.Description = 'DG Editor'
  if (Test-Path $icoCandidate) {
    $lnk.IconLocation = $icoCandidate + ',0'
  }
  $lnk.Save()
  Write-Host ('[ok] Atalho: ' + $lnkPath) -ForegroundColor Green
  Write-Host ('[ok] Alvo:  ' + $bat) -ForegroundColor Green
  if (-not $lnkPrincipal) { $lnkPrincipal = $lnkPath }
}

Write-Host ''
Write-Host 'O atalho NÃO deve apontar para node_modules\electron\dist' -ForegroundColor Cyan
Write-Host ('Use: ' + $lnkPrincipal) -ForegroundColor Cyan
exit 0
