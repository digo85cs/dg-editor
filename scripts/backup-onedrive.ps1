#Requires -Version 5.1
param(
  [switch]$SkipZip,
  [switch]$SkipMirror
)
$ErrorActionPreference = 'Continue'
$src = 'C:\dev\DGEditor'
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
function Write-Step($m) { Write-Host ">> $m" -ForegroundColor Cyan }
function Write-Ok($m) { Write-Host "   OK: $m" -ForegroundColor Green }
function Write-Warn($m) { Write-Host "   AVISO: $m" -ForegroundColor Yellow }
if ([Security.Principal.WindowsIdentity]::GetCurrent().Name -match 'SYSTEM|SISTEMA') {
  if (Test-Path 'C:\Users\digo8') {
    $env:USERPROFILE = 'C:\Users\digo8'
    $env:LOCALAPPDATA = 'C:\Users\digo8\AppData\Local'
    $env:APPDATA = 'C:\Users\digo8\AppData\Roaming'
    if (Test-Path 'C:\Users\digo8\OneDrive') { $env:OneDrive = 'C:\Users\digo8\OneDrive' }
  }
}
$oneDrive = $null
foreach ($cand in @('C:\Users\digo8\OneDrive', $env:OneDrive, (Join-Path $env:USERPROFILE 'OneDrive'))) {
  if ($cand -and (Test-Path -LiteralPath $cand)) { $oneDrive = $cand; break }
}
if (-not $oneDrive) { Write-Error 'OneDrive nao encontrado'; exit 2 }
$root = Join-Path $oneDrive 'BACKUP_DG_EDITOR'
$mirror = Join-Path $root 'ATUAL'
$zipPath = Join-Path $root 'BACKUP_DG_EDITOR_ATUAL.zip'
$txtPath = Join-Path $root 'ULTIMO_BACKUP.txt'
$liveCopy = Join-Path $oneDrive 'CURSOR\DG Editor'
New-Item -ItemType Directory -Path $root -Force | Out-Null
New-Item -ItemType Directory -Path $mirror -Force | Out-Null
$xd = @('node_modules','.git','out','dist','build','release','coverage','playwright-report','test-results','.turbo','__pycache__','_tmp_agent','logs')
$xf = @('*.log','*.tmp','Thumbs.db','.env','.env.local','*.zip')
function Invoke-Robo {
  param([string]$From,[string]$To,[switch]$Mirror)
  if (-not (Test-Path -LiteralPath $From)) { Write-Warn "Fonte ausente: $From"; return $false }
  New-Item -ItemType Directory -Path $To -Force | Out-Null
  $argList = @($From,$To,'/E','/NFL','/NDL','/NJH','/NJS','/NP','/R:1','/W:1','/XJ','/MT:8')
  if ($Mirror) { $argList += '/MIR' }
  $argList += @('/XD') + $xd
  $argList += @('/XF') + $xf
  $p = Start-Process -FilePath 'robocopy.exe' -ArgumentList $argList -PassThru -WindowStyle Hidden
  if (-not $p.WaitForExit(300000)) {
    try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {}
    Write-Warn "Timeout robocopy: $From"; return $false
  }
  return ($p.ExitCode -le 7)
}
Write-Host "=== Backup DG Editor -> OneDrive ===" -ForegroundColor White
Write-Host "Fonte: $src"
Write-Host "Root:  $root"
Write-Host "Stamp: $stamp"
if (-not (Test-Path -LiteralPath $src)) { Write-Error "Fonte inexistente: $src"; exit 3 }
$okMirror = $true
if (-not $SkipMirror) {
  Write-Step 'Espelho ATUAL'
  $okMirror = Invoke-Robo -From $src -To $mirror -Mirror
  if ($okMirror) { Write-Ok "espelho: $mirror" } else { Write-Warn 'espelho com avisos' }
  Write-Step 'Copia viva CURSOR\DG Editor'
  $okLive = Invoke-Robo -From $src -To $liveCopy -Mirror
  if ($okLive) { Write-Ok "live: $liveCopy" } else { Write-Warn 'live com avisos' }
}
$okZip = $true
if (-not $SkipZip) {
  Write-Step 'ZIP ATUAL (1 copia)'
  $stage = Join-Path $env:TEMP ("dg_editor_bk_" + $stamp)
  if (Test-Path $stage) { Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue }
  New-Item -ItemType Directory -Path $stage -Force | Out-Null
  $null = Invoke-Robo -From $src -To $stage
  $zipTmp = Join-Path $env:TEMP ("BACKUP_DG_EDITOR_" + $stamp + '.zip')
  if (Test-Path $zipTmp) { Remove-Item $zipTmp -Force -ErrorAction SilentlyContinue }
  try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $zipTmp, 'Optimal', $false)
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force -ErrorAction SilentlyContinue }
    Move-Item -LiteralPath $zipTmp -Destination $zipPath -Force
    Write-Ok ("zip: {0:N1} MB" -f ((Get-Item $zipPath).Length / 1MB))
  } catch {
    $okZip = $false
    Write-Warn ("zip falhou: " + $_.Exception.Message)
  }
  Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Step 'Config AppData (sem segredos)'
$appData = Join-Path $env:APPDATA 'dg-editor'
$cfgDest = Join-Path $root 'appdata-leve'
New-Item -ItemType Directory -Path $cfgDest -Force | Out-Null
foreach ($f in @('dg-editor.json','tema.json','workspace.json')) {
  $p = Join-Path $appData $f
  if (Test-Path -LiteralPath $p) {
    Copy-Item -LiteralPath $p -Destination (Join-Path $cfgDest $f) -Force -ErrorAction SilentlyContinue
  }
}
$mb = 0
if (Test-Path $zipPath) { $mb = [math]::Round((Get-Item $zipPath).Length / 1MB, 1) }
$linhas = @(
  "ULTIMO_BACKUP=$stamp",
  "FONTE=$src",
  "ESPELHO=$mirror",
  "LIVE=$liveCopy",
  "ZIP=$zipPath",
  "ZIP_MB=$mb",
  "OK_MIRROR=$okMirror",
  "OK_ZIP=$okZip",
  "PC=$env:COMPUTERNAME",
  "USER=$env:USERNAME"
)
Set-Content -LiteralPath $txtPath -Value ($linhas -join "`r`n") -Encoding UTF8
Write-Ok "status: $txtPath"
Write-Host "BACKUP DG EDITOR OK" -ForegroundColor Green
exit 0