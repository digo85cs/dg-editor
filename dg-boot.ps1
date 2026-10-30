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
Log 'boot-silent=3 (sem npm start / sem vite no console)' 'Gray'

function Invoke-ProcessHidden {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$ArgumentList = @(),
    [string]$OutFile = '',
    [string]$WorkDir = $raiz
  )
  # CreateNoWindow=true (nao so WindowStyle Hidden): evita cmd/node abrir console filho.
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $FilePath
  $psi.WorkingDirectory = $WorkDir
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.RedirectStandardInput = $true
  if ($ArgumentList -and $ArgumentList.Count -gt 0) {
    # PS 5.1: Arguments e string unica
    $parts = foreach ($a in $ArgumentList) {
      if ($null -eq $a) { continue }
      $s = [string]$a
      if ($s -match '[\s"]') { '"' + ($s -replace '"', '\"') + '"' } else { $s }
    }
    $psi.Arguments = [string]::Join(' ', $parts)
  }
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  [void]$p.Start()
  # Leitura async evita deadlock quando stdout+stderr enchem o buffer (vite).
  $tOut = $p.StandardOutput.ReadToEndAsync()
  $tErr = $p.StandardError.ReadToEndAsync()
  $p.WaitForExit()
  $stdout = $tOut.Result
  $stderr = $tErr.Result
  if ($OutFile) {
    $text = $stdout
    if ($stderr) { $text = $text + [Environment]::NewLine + $stderr }
    try { Set-Content -LiteralPath $OutFile -Value $text -Encoding UTF8 } catch {}
  }
  return [int]$p.ExitCode
}

function Invoke-NpmHidden {
  param(
    [Parameter(Mandatory = $true)][string[]]$NpmArgs,
    [string]$OutFile = ''
  )
  # npm.cmd via ComSpec + CreateNoWindow — WindowStyle Hidden NAO basta (vite abre cmd).
  $comspec = if ($env:ComSpec) { $env:ComSpec } else { 'cmd.exe' }
  $argStr = ($NpmArgs | ForEach-Object {
      if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
    }) -join ' '
  $inner = 'npm ' + $argStr
  return Invoke-ProcessHidden -FilePath $comspec -ArgumentList @('/d', '/s', '/c', $inner) -OutFile $OutFile
}

function Invoke-NodeHidden {
  param(
    [Parameter(Mandatory = $true)][string]$ScriptPath,
    [string[]]$ScriptArgs = @(),
    [string]$OutFile = ''
  )
  $node = (Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
  if (-not $node) { $node = 'node.exe' }
  $argsList = @($ScriptPath) + $ScriptArgs
  return Invoke-ProcessHidden -FilePath $node -ArgumentList $argsList -OutFile $OutFile
}

$pkgPath = Join-Path $raiz 'package.json'
if (-not (Test-Path $pkgPath)) { Fail 'package.json nao encontrado' }
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json

# Sincroniza D:\CURSOR\DG Editor com o remoto (espelho do /workspace)
$syncJs = Join-Path $raiz 'scripts\sincronizar-remoto.cjs'
if ((Test-Path $syncJs) -and ($raiz -eq 'D:\CURSOR\DG Editor')) {
  try {
    $sc = Invoke-NodeHidden -ScriptPath $syncJs
    Log ('sync remoto exit=' + $sc) 'Green'
  } catch {
    Log ('sync remoto: ' + $_.Exception.Message) 'Yellow'
  }
}

# Garante VBS + shim (npm start antigo → iniciar-app, nunca vite preview)
$garantirJs = Join-Path $raiz 'scripts\garantir-launchers.cjs'
if (Test-Path $garantirJs) {
  try {
    [void](Invoke-NodeHidden -ScriptPath $garantirJs)
    Log 'launchers silenciosos ok' 'Green'
  } catch {
    Log ('garantir-launchers: ' + $_.Exception.Message) 'Yellow'
  }
}

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
    $psExe = (Get-Command powershell.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
    if (-not $psExe) { $psExe = 'powershell.exe' }
    [void](Invoke-ProcessHidden -FilePath $psExe -ArgumentList @(
        '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $atalhoScript
      ))
    Log 'atalho atualizado' 'Green'
  } catch {
    Log ('atalho: ' + $_.Exception.Message) 'Yellow'
  }
}

# ---------- 4. build so se necessario (node direto — sem npm/cmd/vite console) ----------
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

function Invoke-BuildHidden {
  param([string]$OutFile)
  $logParts = New-Object System.Collections.Generic.List[string]
  $append = {
    param($title, $code, $chunkFile)
    $body = ''
    if ($chunkFile -and (Test-Path -LiteralPath $chunkFile)) {
      try { $body = Get-Content -LiteralPath $chunkFile -Raw -ErrorAction SilentlyContinue } catch {}
    }
    $logParts.Add(('=== ' + $title + ' exit=' + $code + ' ==='))
    if ($body) { $logParts.Add($body.TrimEnd()) }
  }

  $tmpMcp = Join-Path $env:TEMP ('dg-build-mcp-' + $PID + '.log')
  $tmpEv = Join-Path $env:TEMP ('dg-build-ev-' + $PID + '.log')
  $tmpEmit = Join-Path $env:TEMP ('dg-build-emit-' + $PID + '.log')
  Remove-Item -LiteralPath $tmpMcp, $tmpEv, $tmpEmit -Force -ErrorAction SilentlyContinue

  # Equivale a: npm run build:mcp && electron-vite build && emit-shell-detect
  $tscJs = Join-Path $raiz 'node_modules\typescript\bin\tsc'
  $tscCli = Join-Path $raiz 'node_modules\typescript\lib\tsc.js'
  $mcpTs = 'src\main\mcp\tsconfig.mcp.json'
  if (Test-Path $tscCli) {
    $code = Invoke-NodeHidden -ScriptPath $tscCli -ScriptArgs @('-p', $mcpTs) -OutFile $tmpMcp
  } elseif (Test-Path $tscJs) {
    $code = Invoke-NodeHidden -ScriptPath $tscJs -ScriptArgs @('-p', $mcpTs) -OutFile $tmpMcp
  } else {
    $code = Invoke-NpmHidden -NpmArgs @('run', 'build:mcp') -OutFile $tmpMcp
  }
  & $append 'build:mcp' $code $tmpMcp
  if ($code -ne 0) {
    if ($OutFile) { Set-Content -LiteralPath $OutFile -Value ($logParts -join "`n") -Encoding UTF8 }
    return $code
  }

  $evJs = Join-Path $raiz 'node_modules\electron-vite\bin\electron-vite.js'
  if (-not (Test-Path $evJs)) {
    $code = Invoke-NpmHidden -NpmArgs @('run', 'build') -OutFile $tmpEv
    & $append 'npm run build (fallback)' $code $tmpEv
    if ($OutFile) { Set-Content -LiteralPath $OutFile -Value ($logParts -join "`n") -Encoding UTF8 }
    return $code
  }
  $code = Invoke-NodeHidden -ScriptPath $evJs -ScriptArgs @('build') -OutFile $tmpEv
  & $append 'electron-vite build' $code $tmpEv
  if ($code -ne 0) {
    if ($OutFile) { Set-Content -LiteralPath $OutFile -Value ($logParts -join "`n") -Encoding UTF8 }
    return $code
  }

  $emit = Join-Path $raiz 'scripts\emit-shell-detect.cjs'
  if (Test-Path $emit) {
    $code = Invoke-NodeHidden -ScriptPath $emit -OutFile $tmpEmit
    & $append 'emit-shell-detect' $code $tmpEmit
  }
  if ($OutFile) { Set-Content -LiteralPath $OutFile -Value ($logParts -join "`n") -Encoding UTF8 }
  return [int]$code
}

if (Test-BuildNecessario) {
  Log 'gerando build (sem janela de terminal)...' 'Cyan'
  $buildLog = Join-Path $logDir 'build-last.log'
  $code = Invoke-BuildHidden -OutFile $buildLog
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
# Caminho com espaco (D:\CURSOR\DG Editor): ProcessStartInfo + aspas; NUNCA npm start / vite.
$env:DG_ROOT = $raiz
$psiEl = New-Object System.Diagnostics.ProcessStartInfo
$psiEl.FileName = $electron
# 1o argumento = pasta do app (aspas obrigatorias com espaco)
$psiEl.Arguments = '"' + $raiz + '" --no-sandbox'
$psiEl.WorkingDirectory = $raiz
$psiEl.UseShellExecute = $true
$psiEl.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Normal
try {
  $p = [System.Diagnostics.Process]::Start($psiEl)
} catch {
  Fail ('falha ao iniciar electron: ' + $_.Exception.Message)
}
if (-not $p) { Fail 'falha ao iniciar electron' }

if ($DoneFlag) {
  Set-Content -LiteralPath $DoneFlag -Value ('pid=' + $p.Id) -Encoding ASCII
}
Log ('electron pid=' + $p.Id + ' raiz="' + $raiz + '"') 'Green'
exit 0
