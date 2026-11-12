# Publica instaladores DG Editor no GitHub Releases (electron-builder --publish).
# Requer: gh auth login  OU  $env:GH_TOKEN / $env:GITHUB_TOKEN
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

function Test-GhAuth {
  if ($env:GH_TOKEN -or $env:GITHUB_TOKEN) { return $true }
  try {
    $out = & gh auth status 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0 -and $out -match 'Logged in') { return $true }
  } catch { }
  return $false
}

if (-not (Test-GhAuth)) {
  Write-Host 'BLOQUEADO: sem login GitHub.'
  Write-Host 'Rode: gh auth login -h github.com -p https -w'
  Write-Host 'Ou defina GH_TOKEN com repo+write:packages e rode de novo.'
  exit 2
}

Write-Host 'Publicando release (win nsis+portable x64)...'
if (-not $env:GH_TOKEN -and -not $env:GITHUB_TOKEN) {
  try { $env:GH_TOKEN = (& gh auth token 2>$null) } catch { }
}
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx electron-builder --win nsis portable --x64 --publish always
$code = $LASTEXITCODE
if ($code -ne 0) { exit $code }

# electron-builder às vezes cria draft — publica para o feed do updater funcionar
$ver = (Get-Content package.json -Raw | ConvertFrom-Json).version
$tag = 'v' + $ver
Write-Host ("Garantindo release publica: " + $tag)
try {
  & gh release edit $tag --repo digo85cs/dg-editor --draft=false 2>$null
} catch { }
try {
  & gh repo view digo85cs/dg-editor --json isPrivate -q .isPrivate 2>$null | ForEach-Object {
    if ($_ -eq 'true') {
      Write-Host 'AVISO: repo privado — updater em outro PC precisa repo publico ou token.'
    }
  }
} catch { }
Write-Host ("OK release: https://github.com/digo85cs/dg-editor/releases/tag/" + $tag)
exit 0
