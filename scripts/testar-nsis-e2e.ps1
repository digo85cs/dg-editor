# Teste e2e do instalador NSIS em pasta limpa (simula PC novo).
# Uso: powershell -File scripts/testar-nsis-e2e.ps1
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz
$ver = (Get-Content (Join-Path $raiz 'package.json') -Raw | ConvertFrom-Json).version
$setup = Join-Path $raiz ("dist-app\DG-Editor-{0}-x64.exe" -f $ver)
$dest = Join-Path $env:LOCALAPPDATA 'DGEditor-e2e-clean'
$log = Join-Path $raiz '.dg-editor\logs\nsis-e2e.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
function Log([string]$m) {
  $line = ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $m)
  Add-Content -LiteralPath $log -Value $line -Encoding UTF8
  Write-Host $line
}
if (-not (Test-Path -LiteralPath $setup)) { throw "Instalador ausente: $setup" }

Log "Limpando destino $dest"
if (Test-Path -LiteralPath $dest) {
  # tenta desinstalar se houver uninstaller
  $un = Get-ChildItem -LiteralPath $dest -Filter 'Uninstall*.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($un) {
    Log "Desinstalando anterior $($un.FullName)"
    Start-Process -FilePath $un.FullName -ArgumentList '/S' -Wait -WindowStyle Hidden
  }
  Start-Sleep -Seconds 1
  Remove-Item -LiteralPath $dest -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $dest | Out-Null

# Remove atalho de teste anterior (nao mexe no atalho de desenvolvimento se alvo for vbs)
$desk = [Environment]::GetFolderPath('Desktop')
$one = Join-Path $env:USERPROFILE 'OneDrive\Desktop'
foreach ($d in @($desk, $one) | Select-Object -Unique) {
  $lnk = Join-Path $d 'DG Editor.lnk'
  if (-not (Test-Path -LiteralPath $lnk)) { continue }
  try {
    $sh = New-Object -ComObject WScript.Shell
    $s = $sh.CreateShortcut($lnk)
    if ([string]$s.TargetPath -match 'DGEditor-e2e-clean|Program Files\\DG Editor|DG Editor\.exe$') {
      if ([string]$s.Arguments -notmatch 'abrir-dg-editor\.vbs') {
        Log "Removendo atalho instalado antigo: $lnk"
        Remove-Item -LiteralPath $lnk -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {}
}

Log "Instalando silenciosamente em $dest"
# /S silencioso; /D= deve ser ultimo argumento; currentuser evita UAC quando possivel
$args = @('/S', '/currentuser', "/D=$dest")
$p = Start-Process -FilePath $setup -ArgumentList $args -PassThru -WindowStyle Hidden
$timeout = [DateTime]::UtcNow.AddMinutes(8)
while (-not $p.HasExited -and [DateTime]::UtcNow -lt $timeout) { Start-Sleep -Seconds 2 }
if (-not $p.HasExited) {
  try { $p.Kill() } catch {}
  throw 'Timeout na instalacao NSIS'
}
Log ("ExitCode instalador=" + $p.ExitCode)

$exe = Join-Path $dest 'DG Editor.exe'
$falhas = 0
function Ok($m) { Log "[ok] $m" }
function Falha($m) { Log "[falha] $m"; $script:falhas++ }

if (Test-Path -LiteralPath $exe) { Ok "exe em $exe" } else {
  # fallback: as vezes NSIS ignora /currentuser com perMachine e instala em Program Files
  $pf = Join-Path ${env:ProgramFiles} 'DG Editor\DG Editor.exe'
  if (Test-Path -LiteralPath $pf) { $exe = $pf; $dest = Split-Path $pf; Ok "exe em Program Files: $exe" }
  else { Falha "DG Editor.exe nao encontrado apos install" }
}

if (Test-Path -LiteralPath $exe) {
  $vi = (Get-Item $exe).VersionInfo
  Ok ("ProductName=" + $vi.ProductName)
  # app.getVersion vem do package dentro do asar — checa resources
  $asar = Join-Path $dest 'resources\app.asar'
  if (Test-Path $asar) { Ok 'app.asar presente' } else { Falha 'app.asar ausente' }
}

# Atalho Desktop
$achouAtalho = $false
foreach ($d in @($desk, $one, (Join-Path $env:PUBLIC 'Desktop')) | Select-Object -Unique) {
  if (-not $d -or -not (Test-Path $d)) { continue }
  $lnk = Join-Path $d 'DG Editor.lnk'
  if (-not (Test-Path -LiteralPath $lnk)) { continue }
  $sh = New-Object -ComObject WScript.Shell
  $s = $sh.CreateShortcut($lnk)
  $alvo = [string]$s.TargetPath
  $icon = [string]$s.IconLocation
  if ($alvo -match 'DG Editor\.exe$') {
    Ok ("atalho Desktop: $lnk -> $alvo")
    if ($icon -match 'DG Editor\.exe|dg-editor') { Ok "icone atalho: $icon" } else { Log "[aviso] icone=$icon" }
    $achouAtalho = $true
    break
  }
}
if (-not $achouAtalho) { Falha 'atalho Desktop DG Editor.lnk (exe) nao encontrado' }

# Smoke rapido: sobe o exe empacotado com flag e mata
if (Test-Path -LiteralPath $exe) {
  Log 'Smoke start empacotado (3s)'
  $env:DG_QA_E2E = '1'
  $proc = Start-Process -FilePath $exe -ArgumentList '--no-sandbox','--disable-gpu' -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 4
  if ($proc -and -not $proc.HasExited) {
    Ok 'processo empacotado iniciou'
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
    Get-Process -Name 'DG Editor' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  } else {
    Falha 'processo empacotado nao ficou ativo'
  }
  Remove-Item Env:DG_QA_E2E -ErrorAction SilentlyContinue
}

# Desinstala limpo
$un2 = Get-ChildItem -LiteralPath $dest -Filter 'Uninstall*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($un2) {
  Log "Desinstalando $un2"
  Start-Process -FilePath $un2.FullName -ArgumentList '/S' -Wait -WindowStyle Hidden
  Start-Sleep -Seconds 2
}

if ($falhas -eq 0) { Log 'NSIS_E2E_OK'; exit 0 }
Log ("NSIS_E2E_FALHOU=$falhas")
exit 1
