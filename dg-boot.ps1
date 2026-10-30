# dg-boot.ps1 -- prepara deps/build e abre o DG Editor.
# -Silent: sem console; logs em .dg-editor/logs/boot.log; abre Electron e sai.
param(
  [switch]$Silent,
  [string]$DoneFlag = '',
  [string]$ErrorFlag = ''
)

$ErrorActionPreference = 'Continue'

function Get-RaizProjeto {
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

$raizFixa = 'D:\CURSOR\DG Editor'
$raiz = $null
if ($env:DG_ROOT -and (Test-Path (Join-Path $env:DG_ROOT 'package.json'))) {
  $raiz = (Resolve-Path $env:DG_ROOT).Path
} elseif (Test-Path (Join-Path $raizFixa 'package.json')) {
  $raiz = $raizFixa
} else {
  $raiz = Get-RaizProjeto
}
if (-not $raiz) {
  if (-not $Silent) { Write-Host '[ERRO] nao encontrei package.json -- esperado em D:\CURSOR\DG Editor' -ForegroundColor Red }
  if ($ErrorFlag) { Set-Content -LiteralPath $ErrorFlag -Value 'sem-raiz' -Encoding ASCII }
  exit 1
}
Set-Location $raiz
$env:DG_ROOT = $raiz
try {
  Set-Content -LiteralPath (Join-Path $raiz '.dg-root') -Value $raiz -Encoding ASCII -Force
} catch {}

$logDir = Join-Path $raiz '.dg-editor\logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir 'boot.log'

function Log($msg, $cor = 'Gray') {
  $line = ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $msg)
  try { Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8 } catch {}
  if (-not $Silent) {
    Write-Host $line -ForegroundColor $cor
  }
}

function Fail([string]$msg) {
  Log $msg 'Red'
  if ($ErrorFlag) { Set-Content -LiteralPath $ErrorFlag -Value $msg -Encoding ASCII }
  exit 1
}

Log 'DG Editor -- verificacao de boot' 'Cyan'
Log ('raiz fixa/windows: ' + $raiz)

function Invoke-NpmHidden {
  param(
    [Parameter(Mandatory = $true)][string[]]$NpmArgs,
    [string]$OutFile = ''
  )
  # npm.cmd abre console se chamado direto — usa cmd oculto
  $cmdline = 'npm ' + (($NpmArgs | ForEach-Object {
        if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
      }) -join ' ')
  if ($OutFile) {
    $cmdline = $cmdline + ' > "' + $OutFile + '" 2>&1'
  } else {
    $cmdline = $cmdline + ' > NUL 2>&1'
  }
  $p = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/d', '/s', '/c', $cmdline) `
    -WorkingDirectory $raiz `
    -WindowStyle Hidden `
    -Wait `
    -PassThru
  return [int]$p.ExitCode
}

$pkgPath = Join-Path $raiz 'package.json'
if (-not (Test-Path $pkgPath)) { Fail 'package.json nao encontrado' }
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json

# ---------- 1. node_modules ----------
$nm = Join-Path $raiz 'node_modules'
if (-not (Test-Path $nm)) {
  Log 'node_modules ausente -- instalando' 'Yellow'
  $code = Invoke-NpmHidden -NpmArgs @('install', '--no-audit', '--no-fund')
  if ($code -ne 0) { Fail 'npm install falhou' }
  Log 'dependencias instaladas' 'Green'
} else {
  Log 'node_modules presente' 'Green'
}

# ---------- 2. sync deps (ignora packaging) ----------
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
    if ($v.Major -ne $base.Major -or $v.Minor -ne $base.Minor) { return $false }
    return ($v -ge $base)
  }
  if ($limpa.StartsWith('>=')) {
    try { $base = [version]$limpa.Substring(2) } catch { return $false }
    return ($v -ge $base)
  }
  try { return ($v -eq [version]$limpa) } catch { return $false }
}

$ignorarNoBoot = @('electron-builder', '@electron/rebuild', 'playwright-core', 'esbuild')
$todas = @()
if ($pkg.dependencies) { $todas += $pkg.dependencies.PSObject.Properties }
if ($pkg.devDependencies) { $todas += $pkg.devDependencies.PSObject.Properties }

$divergentes = @()
foreach ($d in $todas) {
  if ($ignorarNoBoot -contains $d.Name) { continue }
  $modPkg = Join-Path $nm ($d.Name + '\package.json')
  if (-not (Test-Path $modPkg)) {
    $divergentes += $d.Name
    continue
  }
  try {
    $inst = Get-Content $modPkg -Raw | ConvertFrom-Json
    if (-not (Test-SatisfazFaixa -instalada $inst.version -faixa $d.Value)) {
      $divergentes += $d.Name
    }
  } catch {
    $divergentes += $d.Name
  }
}

if ($divergentes.Count -gt 0) {
  Log ('sincronizando deps: ' + ($divergentes -join ', ')) 'Yellow'
  $code = Invoke-NpmHidden -NpmArgs @('install', '--no-audit', '--no-fund')
  if ($code -ne 0) { Log 'npm install falhou -- seguindo' 'Yellow' }
  else { Log 'dependencias sincronizadas' 'Green' }
} else {
  Log 'dependencias ok' 'Green'
}

# ---------- 3. atalho (silencioso) ----------
$atalhoScript = Join-Path $raiz 'scripts\criar-atalho-desktop.ps1'
if (Test-Path $atalhoScript) {
  try {
    Start-Process -FilePath 'powershell.exe' `
      -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', $atalhoScript) `
      -WindowStyle Hidden -Wait | Out-Null
    Log 'atalho atualizado' 'Green'
  } catch {
    Log ('atalho: ' + $_.Exception.Message) 'Yellow'
  }
}

# ---------- 4. build so se necessario ----------
function Test-BuildNecessario {
  $outMain = Join-Path $raiz 'out\main\index.js'
  $outRend = Join-Path $raiz 'out\renderer\index.html'
  if (-not (Test-Path $outMain) -or -not (Test-Path $outRend)) { return $true }
  $outTime = (Get-Item $outMain).LastWriteTimeUtc
  foreach ($rel in @('src\main', 'src\renderer', 'src\preload', 'package.json', 'electron-vite.config.ts')) {
    $p = Join-Path $raiz $rel
    if (-not (Test-Path $p)) { continue }
    if ((Get-Item $p).PSIsContainer) {
      $novo = Get-ChildItem $p -Recurse -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
      if ($novo -and $novo.LastWriteTimeUtc -gt $outTime) { return $true }
    } else {
      if ((Get-Item $p).LastWriteTimeUtc -gt $outTime) { return $true }
    }
  }
  return $false
}

if (Test-BuildNecessario) {
  Log 'gerando build (npm run build)...' 'Cyan'
  $buildLog = Join-Path $logDir 'build-last.log'
  $code = Invoke-NpmHidden -NpmArgs @('run', 'build') -OutFile $buildLog
  if ($code -ne 0) { Fail 'build falhou — veja .dg-editor/logs/build-last.log' }
  Log 'build ok' 'Green'
} else {
  Log 'build em dia — pulando' 'Green'
}

# ---------- 5. abrir Electron (sem npm start / sem console vite) ----------
$electron = Join-Path $raiz 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $electron)) {
  Fail 'electron.exe nao encontrado em node_modules'
}

Log 'iniciando DG Editor...' 'Cyan'
$p = Start-Process -FilePath $electron -ArgumentList @('.', '--no-sandbox') -WorkingDirectory $raiz -PassThru -WindowStyle Normal
if (-not $p) { Fail 'falha ao iniciar electron' }

if ($DoneFlag) {
  Set-Content -LiteralPath $DoneFlag -Value ('pid=' + $p.Id) -Encoding ASCII
}
Log ('electron pid=' + $p.Id) 'Green'
exit 0
