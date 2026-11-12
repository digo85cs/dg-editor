#Requires -Version 5.1
# Sincroniza a pasta de trabalho do DG Editor (padrao: C:\dev\DGEditor).
param(
  [string]$Raiz = 'C:\dev\DGEditor',
  [string]$Branch = 'main'
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Raiz)) { New-Item -ItemType Directory -Path $Raiz -Force | Out-Null }
Write-Host ('[sync] raiz=' + $Raiz + ' branch=' + $Branch) -ForegroundColor Cyan
if (Get-Command git -ErrorAction SilentlyContinue) {
  Set-Location $Raiz
  if (Test-Path (Join-Path $Raiz '.git')) {
    git fetch origin $Branch
    git checkout -B $Branch ("origin/" + $Branch) 2>$null
    git pull origin $Branch
  } else {
    Write-Host '[sync] sem .git — use OneDrive BACKUP_DG_EDITOR\ATUAL ou clone manual' -ForegroundColor Yellow
  }
} else {
  Write-Host '[sync] git ausente — copie de OneDrive\BACKUP_DG_EDITOR\ATUAL' -ForegroundColor Yellow
}
Write-Host '[sync] OK' -ForegroundColor Green
