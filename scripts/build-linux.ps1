# Build Linux x64 (AppImage/deb). No Windows usa WSL se disponivel.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Invoke-NativeLinux {
  Write-Host 'electron-builder --linux AppImage deb --x64'
  npm run build
  if ($LASTEXITCODE -ne 0) { return $LASTEXITCODE }
  npx electron-builder --linux AppImage deb --x64
  return $LASTEXITCODE
}

$isWin = $env:OS -match 'Windows'
if ($isWin) {
  $wsl = Get-Command wsl -ErrorAction SilentlyContinue
  if ($wsl) {
    Write-Host 'Usando WSL para build Linux...'
    $unix = (wsl wslpath -a $root 2>$null)
    if (-not $unix) { $unix = '/mnt/c/dev/DGEditor' }
    wsl bash -lc "cd '$unix' && npm run build && npx electron-builder --linux AppImage deb --x64"
    exit $LASTEXITCODE
  }
  Write-Host 'AVISO: build Linux no Windows sem WSL costuma falhar (fpm/AppImage).'
  Write-Host 'Tentando mesmo assim; se falhar, use WSL ou CI Linux.'
}

$code = Invoke-NativeLinux
exit $code
