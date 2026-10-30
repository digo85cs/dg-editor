# dg-boot.ps1 -- Verifica e atualiza dependencias ANTES de abrir o DG Editor.
# Roda fora do Electron, entao node_modules esta livre e nao ocorre EBUSY.

$ErrorActionPreference = 'Continue'

function Get-RaizProjeto {
  # Ordem: pasta do script -> pasta do chamador -> cwd -> $PSScriptRoot
  $candidatos = @()
  if ($PSCommandPath) { $candidatos += (Split-Path -Parent $PSCommandPath) }
  if ($MyInvocation.MyCommand.Path) { $candidatos += (Split-Path -Parent $MyInvocation.MyCommand.Path) }
  $candidatos += (Get-Location).Path
  if ($PSScriptRoot) { $candidatos += $PSScriptRoot }

  foreach ($c in $candidatos) {
    if (-not $c) { continue }
    $atual = $c
    for ($i = 0; $i -lt 5; $i++) {
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
  Write-Host '[ERRO] nao encontrei package.json em nenhum ancestral -- abortando' -ForegroundColor Red
  exit 1
}
Set-Location $raiz

function Log($msg, $cor = 'Gray') {
  Write-Host ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg) -ForegroundColor $cor
}

Log 'DG Editor -- verificacao de boot' 'Cyan'
Log ('raiz: ' + $raiz)

$pkgPath = Join-Path $raiz 'package.json'
if (-not (Test-Path $pkgPath)) {
  Log 'package.json nao encontrado -- abortando' 'Red'
  exit 1
}
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json

# ---------- 1. node_modules existe? ----------
$nm = Join-Path $raiz 'node_modules'
if (-not (Test-Path $nm)) {
  Log 'node_modules ausente -- instalando (pode demorar)' 'Yellow'
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) {
    Log 'npm install falhou -- abortando o boot' 'Red'
    exit 1
  }
  Log 'dependencias instaladas' 'Green'
} else {
  Log 'node_modules presente' 'Green'
}

# ---------- 2. comparar versao declarada vs instalada (semver) ----------
function Test-SatisfazFaixa {
  param([string]$instalada, [string]$faixa)

  $limpa = ($faixa -replace '\s', '')
  if ($limpa.StartsWith('v')) { $limpa = $limpa.Substring(1) }

  try { $v = [version]$instalada } catch { return $false }

  if ($limpa -eq '' -or $limpa -eq '*' -or $limpa -eq 'latest') { return $true }

  if ($limpa.StartsWith('^')) {
    try { $base = [version]$limpa.Substring(1) } catch { return $false }
    if ($v.Major -ne $base.Major) { return $false }
    return ($v -ge $base)
  }

  if ($limpa.StartsWith('~')) {
    try { $base = [version]$limpa.Substring(1) } catch { return $false }
    if ($v.Major -ne $base.Major) { return $false }
    if ($v.Minor -ne $base.Minor) { return $false }
    return ($v -ge $base)
  }

  if ($limpa.StartsWith('>=')) {
    try { $base = [version]$limpa.Substring(2) } catch { return $false }
    return ($v -ge $base)
  }

  try { return ($v -eq [version]$limpa) } catch { return $false }
}

$todas = @()
if ($pkg.dependencies)    { $todas += $pkg.dependencies.PSObject.Properties }
if ($pkg.devDependencies) { $todas += $pkg.devDependencies.PSObject.Properties }

$divergentes = @()
foreach ($d in $todas) {
  $modPkg = Join-Path $nm ($d.Name + '\package.json')
  if (-not (Test-Path $modPkg)) {
    $divergentes += [pscustomobject]@{ Nome = $d.Name; Motivo = 'nao instalado'; Declarado = $d.Value; Instalado = '-' }
    continue
  }
  try {
    $inst = Get-Content $modPkg -Raw | ConvertFrom-Json
    if (-not (Test-SatisfazFaixa -instalada $inst.version -faixa $d.Value)) {
      $divergentes += [pscustomobject]@{ Nome = $d.Name; Motivo = 'fora da faixa'; Declarado = $d.Value; Instalado = $inst.version }
    }
  } catch {
    $divergentes += [pscustomobject]@{ Nome = $d.Name; Motivo = 'package.json ilegivel'; Declarado = $d.Value; Instalado = '?' }
  }
}

Log ('dependencias verificadas: ' + $todas.Count)

if ($divergentes.Count -gt 0) {
  Log ('divergencias: ' + $divergentes.Count) 'Yellow'
  foreach ($dv in $divergentes) {
    Log ('  ' + $dv.Nome + ' -- ' + $dv.Motivo + ' (declarado ' + $dv.Declarado + ', instalado ' + $dv.Instalado + ')') 'Yellow'
  }
  Log 'sincronizando (Electron ainda nao subiu -- arquivos livres)' 'Yellow'
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) {
    Log 'npm install falhou -- abrindo o app mesmo assim' 'Red'
  } else {
    Log 'dependencias sincronizadas' 'Green'
  }
} else {
  Log 'todas as dependencias batem com package.json' 'Green'
}

# ---------- 3. branch + build fresco (UI vem de out/renderer) ----------
try {
  $branch = (git -C $raiz rev-parse --abbrev-ref HEAD 2>$null)
  if ($branch) { Log ('branch: ' + $branch) 'Cyan' }
} catch {}

Log 'gerando build (npm run build) para aplicar UI local...' 'Cyan'
npm run build
if ($LASTEXITCODE -ne 0) {
  Log 'build falhou -- abortando (nao abra electron\\dist direto)' 'Red'
  exit 1
}
Log 'build ok' 'Green'

# ---------- 4. abrir o app (NUNCA use node_modules\electron\dist como atalho) ----------
Log 'iniciando DG Editor via npm start (atalho correto = esta pasta\dg-boot.bat)...' 'Cyan'
npm start
