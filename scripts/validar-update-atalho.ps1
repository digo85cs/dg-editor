# Valida versao, feed de update, icone canonico e atalho Desktop do DG Editor.
$ErrorActionPreference = 'Continue'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz
$falhas = 0

function Ok([string]$m) { Write-Host ('[ok] ' + $m) -ForegroundColor Green }
function Falha([string]$m) { Write-Host ('[falha] ' + $m) -ForegroundColor Red; $script:falhas++ }

# 1) Versao package.json
$pkg = Get-Content (Join-Path $raiz 'package.json') -Raw | ConvertFrom-Json
$ver = [string]$pkg.version
if ($ver -match '^\d+\.\d+\.\d+') { Ok ('versao package.json = ' + $ver) } else { Falha 'versao invalida' }

# 2) Publish GitHub configurado (update em outro PC)
$pub = $pkg.build.publish
if ($pub -and ($pub | Where-Object { $_.provider -eq 'github' -and $_.repo -eq 'dg-editor' })) {
  Ok 'publish github digO85cs/dg-editor configurado para electron-updater'
} else {
  Falha 'publish github ausente — update remoto nao funciona'
}

# 3) NSIS: pasta editavel + desktop
$nsis = $pkg.build.nsis
if ($nsis.allowToChangeInstallationDirectory -eq $true) { Ok 'NSIS permite escolher pasta' } else { Falha 'NSIS sem allowToChangeInstallationDirectory' }
if ($nsis.perMachine -eq $true) { Ok 'NSIS perMachine (Program Files)' } else { Falha 'NSIS sem perMachine' }
if ($nsis.createDesktopShortcut -eq $true) { Ok 'NSIS cria atalho Desktop' } else { Falha 'NSIS createDesktopShortcut desligado' }
$side = Join-Path $raiz 'resources\installer-sidebar.bmp'
if (Test-Path $side) { Ok 'installer-sidebar.bmp presente' } else { Falha 'faltando installer-sidebar.bmp' }
$nsh = Join-Path $raiz 'build\installer.nsh'
if (Test-Path $nsh) { Ok 'build/installer.nsh presente' } else { Falha 'faltando installer.nsh' }

# 4) Icone canonico
$icoDesk = Join-Path $raiz 'resources\dg-editor-desktop.ico'
$ico = Join-Path $raiz 'resources\dg-editor.ico'
if (Test-Path $icoDesk) { Ok 'dg-editor-desktop.ico' } elseif (Test-Path $ico) { Ok 'dg-editor.ico (fallback)' } else { Falha 'sem icone .ico' }

# 5) IPC update no preload
$pre = Get-Content (Join-Path $raiz 'src\preload\index.ts') -Raw
foreach ($ch in @('update:status','update:verificar','update:instalar')) {
  if ($pre -match [regex]::Escape($ch)) { Ok ('preload ' + $ch) } else { Falha ('preload sem ' + $ch) }
}

# 6) Atalho Desktop (dev) + icone
& (Join-Path $raiz 'scripts\criar-atalho-desktop.ps1') 2>&1 | Out-Host
$desk = [Environment]::GetFolderPath('Desktop')
$one = Join-Path $env:USERPROFILE 'OneDrive\Desktop'
$candidatos = @($desk, $one, 'C:\Users\digo8\OneDrive\Desktop') | Select-Object -Unique
$achou = $false
foreach ($d in $candidatos) {
  $lnk = Join-Path $d 'DG Editor.lnk'
  if (-not (Test-Path -LiteralPath $lnk)) { continue }
  $sh = New-Object -ComObject WScript.Shell
  $s = $sh.CreateShortcut($lnk)
  $alvo = [string]$s.TargetPath
  $args = [string]$s.Arguments
  $icon = [string]$s.IconLocation
  if ($alvo -match 'wscript\.exe$' -and $args -match 'abrir-dg-editor\.vbs') {
    Ok ('atalho Desktop OK: ' + $lnk)
    if ($icon -match 'dg-editor(-desktop)?\.ico') { Ok ('icone canonico: ' + $icon) } else { Falha ('icone nao canonico: ' + $icon) }
    $achou = $true
    break
  } else {
    Falha ('atalho invalido: ' + $alvo + ' ' + $args)
    $achou = $true
    break
  }
}
if (-not $achou) { Falha 'atalho DG Editor.lnk nao encontrado no Desktop' }

# 7) latest.yml (se existir) nao pode ficar atras da versao atual apos publish
$latest = Join-Path $raiz 'dist-app\latest.yml'
if (Test-Path $latest) {
  $ly = Get-Content $latest -Raw
  if ($ly -match ('version:\s*' + [regex]::Escape($ver))) {
    Ok ('latest.yml na versao ' + $ver)
  } else {
    Write-Host ('[aviso] latest.yml antigo — rode npm run dist:win:installer ou publish:release para ' + $ver) -ForegroundColor Yellow
  }
} else {
  Write-Host '[aviso] sem dist-app/latest.yml ainda (normal antes do installer)' -ForegroundColor Yellow
}

Write-Host ''
if ($falhas -eq 0) {
  Write-Host 'VALIDACAO OK' -ForegroundColor Green
  exit 0
}
Write-Host ('VALIDACAO FALHOU: ' + $falhas + ' item(ns)') -ForegroundColor Red
exit 1
