# Sincroniza D:\CURSOR\DG Editor com a branch feat/vault-markdown.
# Pode ser colado/rodado de QUALQUER pasta (nao precisa existir arquivo local).
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/digo85cs/dg-editor/feat/vault-markdown/scripts/sincronizar-windows.ps1 | iex"
# Ou, se o arquivo ja existir:
#   powershell -NoProfile -ExecutionPolicy Bypass -File "D:\CURSOR\DG Editor\scripts\sincronizar-windows.ps1"

$ErrorActionPreference = 'Stop'
$raiz = 'D:\CURSOR\DG Editor'
$branch = 'feat/vault-markdown'
$repo = 'https://github.com/digo85cs/dg-editor.git'
$zipUrl = "https://github.com/digo85cs/dg-editor/archive/refs/heads/$branch.zip"

function Write-Step([string]$msg) {
  Write-Host ('[sync] ' + $msg) -ForegroundColor Cyan
}

function Test-Git {
  return [bool](Get-Command git -ErrorAction SilentlyContinue)
}

function Sync-ViaGit {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $raiz) | Out-Null
  if (Test-Path (Join-Path $raiz '.git')) {
    Write-Step 'git pull na pasta existente'
    Set-Location $raiz
    git fetch origin $branch
    if ($LASTEXITCODE -ne 0) { throw 'git fetch falhou — confira login/acesso ao GitHub' }
    git checkout -B $branch "origin/$branch"
    git pull origin $branch
    if ($LASTEXITCODE -ne 0) { throw 'git pull falhou' }
    return
  }
  if (Test-Path $raiz) {
    Write-Step 'pasta existe sem .git — clonando em temp e mesclando arquivos'
    $tmp = Join-Path $env:TEMP ('dg-editor-clone-' + [guid]::NewGuid().ToString('n'))
    git clone -b $branch --single-branch $repo $tmp
    if ($LASTEXITCODE -ne 0) { throw 'git clone falhou' }
    # Copia tudo exceto node_modules (preserva deps locais se houver)
    & robocopy $tmp $raiz /E /XD node_modules .git /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    if (-not (Test-Path (Join-Path $raiz '.git'))) {
      Copy-Item -Recurse -Force (Join-Path $tmp '.git') (Join-Path $raiz '.git')
    }
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Set-Location $raiz
    git checkout -B $branch "origin/$branch" 2>$null
    return
  }
  Write-Step 'clonando repositorio'
  git clone -b $branch --single-branch $repo $raiz
  if ($LASTEXITCODE -ne 0) { throw 'git clone falhou' }
  Set-Location $raiz
}

function Sync-ViaZip {
  Write-Step 'baixando ZIP da branch (sem git)'
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $raiz) | Out-Null
  New-Item -ItemType Directory -Force -Path $raiz | Out-Null
  $zip = Join-Path $env:TEMP 'dg-editor-sync.zip'
  $dest = Join-Path $env:TEMP ('dg-editor-extract-' + [guid]::NewGuid().ToString('n'))
  Invoke-WebRequest -Uri $zipUrl -OutFile $zip -UseBasicParsing
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  Expand-Archive -LiteralPath $zip -DestinationPath $dest -Force
  $src = Get-ChildItem -LiteralPath $dest -Directory | Select-Object -First 1
  if (-not $src) { throw 'ZIP vazio ou inacessivel (repo privado? use git clone)' }
  & robocopy $src.FullName $raiz /E /XD node_modules .git /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  Remove-Item -LiteralPath $zip, $dest -Recurse -Force -ErrorAction SilentlyContinue
  Set-Location $raiz
}

Write-Host ''
Write-Host '=== DG Editor — sincronizar Windows ===' -ForegroundColor Green
Write-Host ('destino: ' + $raiz)
Write-Host ('branch:  ' + $branch)
Write-Host ''

if (Test-Git) {
  try {
    Sync-ViaGit
  } catch {
    Write-Host ('[warn] git falhou: ' + $_.Exception.Message) -ForegroundColor Yellow
    Write-Step 'tentando ZIP...'
    Sync-ViaZip
  }
} else {
  Write-Step 'git nao encontrado — usando ZIP'
  Sync-ViaZip
}

$essenciais = @(
  'abrir-dg-editor.vbs',
  'abrir-dg-editor.bat',
  'atualizar-atalho-desktop.bat',
  'faxina.bat',
  'dg-boot.ps1',
  'scripts\splash-boot.ps1',
  'scripts\criar-atalho-desktop.ps1',
  'package.json'
)
Write-Host ''
Write-Step 'arquivos essenciais:'
$faltando = @()
foreach ($rel in $essenciais) {
  $p = Join-Path $raiz $rel
  if (Test-Path -LiteralPath $p) {
    Write-Host ('  [ok] ' + $rel) -ForegroundColor Green
  } else {
    Write-Host ('  [!!] FALTA ' + $rel) -ForegroundColor Red
    $faltando += $rel
  }
}
if ($faltando.Count -gt 0) {
  throw ('sincronizacao incompleta — faltam: ' + ($faltando -join ', '))
}

try {
  Set-Content -LiteralPath (Join-Path $raiz '.dg-root') -Value $raiz -Encoding ASCII -Force
} catch {}

$atalho = Join-Path $raiz 'scripts\criar-atalho-desktop.ps1'
if (Test-Path $atalho) {
  Write-Step 'atualizando atalho da Area de Trabalho...'
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $atalho
}

Write-Host ''
Write-Host 'Pronto. Abra o atalho DG Editor na Area de Trabalho.' -ForegroundColor Cyan
Write-Host ('Pasta: ' + $raiz)
exit 0
