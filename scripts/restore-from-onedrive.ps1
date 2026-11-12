#Requires -Version 5.1
param(
  [string]$Destino = 'C:\dev\DGEditor',
  [switch]$FromZip
)
$ErrorActionPreference = 'Stop'
$od = 'C:\Users\digo8\OneDrive'
$mirror = Join-Path $od 'BACKUP_DG_EDITOR\ATUAL'
$zip = Join-Path $od 'BACKUP_DG_EDITOR\BACKUP_DG_EDITOR_ATUAL.zip'
Write-Host "=== Restaurar DG Editor ===" -ForegroundColor Cyan
if ($FromZip) {
  if (-not (Test-Path $zip)) { throw "ZIP ausente: $zip" }
  $tmp = Join-Path $env:TEMP ('dg_restore_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
  New-Item $tmp -ItemType Directory -Force | Out-Null
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $tmp)
  $src = $tmp
} else {
  if (-not (Test-Path $mirror)) { throw "Espelho ausente: $mirror" }
  $src = $mirror
}
New-Item -ItemType Directory -Path $Destino -Force | Out-Null
$xd = @('node_modules','.git','out')
& robocopy.exe $src $Destino /E /XD $xd /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
Write-Host "Arquivos em: $Destino" -ForegroundColor Green
Write-Host "Proximo: cd `"$Destino`"; npm install; npm run build; npm start"
if ($FromZip -and (Test-Path $tmp)) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }