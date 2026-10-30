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
  exit 1
}

$desktop = [Environment]::GetFolderPath('Desktop')
if (-not $desktop -or -not (Test-Path $desktop)) {
  $desktop = Join-Path $env:USERPROFILE 'Desktop'
}
if (-not (Test-Path $desktop)) {
  Write-Host '[ERRO] Area de Trabalho nao encontrada' -ForegroundColor Red
  exit 1
}

$nome = 'DG Editor.lnk'
$lnkPath = Join-Path $desktop $nome

# Remove atalho antigo apontando para electron\dist (se existir com outro nome)
# e o atalho legado "Dg Editor.lnk"
Get-ChildItem -Path $desktop -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object {
  try {
    $sh = New-Object -ComObject WScript.Shell
    $existente = $sh.CreateShortcut($_.FullName)
    $alvo = [string]$existente.TargetPath
    $ehLegadoNome = $_.Name -eq 'Dg Editor.lnk'
    if (
      $ehLegadoNome -or
      $alvo -match 'node_modules[\\/]+electron[\\/]+dist' -or
      $alvo -match 'electron\.exe$'
    ) {
      Write-Host ('[atalho] removendo atalho antigo: ' + $_.Name + ' -> ' + $alvo) -ForegroundColor Yellow
      Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
    }
  } catch {}
}

$w = New-Object -ComObject WScript.Shell
$lnk = $w.CreateShortcut($lnkPath)
$lnk.TargetPath = $bat
$lnk.WorkingDirectory = $raiz
$lnk.WindowStyle = 1
$lnk.Description = 'DG Editor'
# Ícone próprio do DG Editor (nunca o ícone genérico do runtime)
$icoCandidate = Join-Path $raiz 'resources\dg-editor.ico'
if (-not (Test-Path $icoCandidate)) {
  $icoCandidate = Join-Path $raiz 'resources\dg-studio.ico'
}
if (Test-Path $icoCandidate) {
  $lnk.IconLocation = $icoCandidate + ',0'
}
$lnk.Save()

Write-Host ('[ok] Atalho DG Editor: ' + $lnkPath) -ForegroundColor Green
Write-Host ('[ok] Alvo: ' + $bat) -ForegroundColor Green
exit 0
