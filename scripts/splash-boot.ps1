# Splash moderno "Carregando" + boot silencioso (sem janela preta do cmd/vite).
# Chamado por abrir-dg-editor.vbs (wscript 0) com powershell -WindowStyle Hidden.
$ErrorActionPreference = 'Continue'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$raizFixa = 'C:\dev\DGEditor'
if (-not (Test-Path (Join-Path $raizFixa 'package.json'))) { $raizFixa = 'D:\CURSOR\DG Editor' }
$raizScript = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { '' }
if (Test-Path (Join-Path $raizFixa 'package.json')) {
  $raiz = $raizFixa
} elseif ($env:DG_ROOT -and (Test-Path (Join-Path $env:DG_ROOT 'package.json'))) {
  $raiz = $env:DG_ROOT
} elseif (Test-Path (Join-Path (Get-Location).Path 'package.json')) {
  $raiz = (Get-Location).Path
} elseif ($raizScript -and (Test-Path (Join-Path $raizScript 'package.json'))) {
  $raiz = $raizScript
} else {
  $raiz = (Get-Location).Path
}
Set-Location $raiz
$env:DG_ROOT = $raiz

$logDir = Join-Path $raiz '.dg-editor\logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir 'boot.log'

function Write-BootLog([string]$msg) {
  $line = ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $msg)
  try { Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8 } catch {}
}

# ---------- Splash UI (marca DG: #121214 + accent #0080ff) ----------
$bg = [System.Drawing.Color]::FromArgb(18, 18, 20)
$accent = [System.Drawing.Color]::FromArgb(0, 128, 255)
$muted = [System.Drawing.Color]::FromArgb(168, 176, 188)
$text = [System.Drawing.Color]::FromArgb(245, 245, 245)

$form = New-Object System.Windows.Forms.Form
$form.Text = 'DG Editor'
$form.FormBorderStyle = 'None'
$form.StartPosition = 'CenterScreen'
$form.Size = New-Object System.Drawing.Size(460, 248)
$form.BackColor = $bg
$form.TopMost = $true
$form.ShowInTaskbar = $true

$painel = New-Object System.Windows.Forms.Panel
$painel.Dock = 'Fill'
$painel.BackColor = $bg
$form.Controls.Add($painel)

$faixa = New-Object System.Windows.Forms.Panel
$faixa.Size = New-Object System.Drawing.Size(460, 3)
$faixa.Location = New-Object System.Drawing.Point(0, 0)
$faixa.BackColor = $accent
$painel.Controls.Add($faixa)

$titulo = New-Object System.Windows.Forms.Label
$titulo.Text = 'DG Editor'
$titulo.ForeColor = $text
$titulo.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 22, [System.Drawing.FontStyle]::Bold)
$titulo.AutoSize = $true
$titulo.Location = New-Object System.Drawing.Point(36, 52)
$logoPath = Join-Path $raiz 'resources\logo-wide-lg.png'
if (-not (Test-Path $logoPath)) { $logoPath = Join-Path $raiz 'resources\logo-wide.png' }
$logoBox = New-Object System.Windows.Forms.PictureBox
$logoBox.SizeMode = 'Zoom'
$logoBox.Size = New-Object System.Drawing.Size(300, 88)
$logoBox.Location = New-Object System.Drawing.Point(80, 28)
$logoBox.BackColor = $bg
if (Test-Path $logoPath) {
  try {
    $logoBox.Image = [System.Drawing.Image]::FromFile($logoPath)
    $painel.Controls.Add($logoBox)
    $titulo.Visible = $false
  } catch {
    $painel.Controls.Add($titulo)
  }
} else {
  $painel.Controls.Add($titulo)
}

$sub = New-Object System.Windows.Forms.Label
$sub.Text = 'Editor de sistemas com IA local'
$sub.ForeColor = $muted
$sub.Font = New-Object System.Drawing.Font('Segoe UI', 9.5)
$sub.AutoSize = $true
$sub.Location = New-Object System.Drawing.Point(38, 122)
$painel.Controls.Add($sub)

$status = New-Object System.Windows.Forms.Label
$status.Text = 'Carregando'
$status.ForeColor = $accent
$status.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 11)
$status.AutoSize = $true
$status.Location = New-Object System.Drawing.Point(38, 152)
$painel.Controls.Add($status)

$trilha = New-Object System.Windows.Forms.Panel
$trilha.Size = New-Object System.Drawing.Size(384, 4)
$trilha.Location = New-Object System.Drawing.Point(38, 190)
$trilha.BackColor = [System.Drawing.Color]::FromArgb(40, 44, 52)
$painel.Controls.Add($trilha)

$barra = New-Object System.Windows.Forms.Panel
$barra.Size = New-Object System.Drawing.Size(96, 4)
$barra.Location = New-Object System.Drawing.Point(0, 0)
$barra.BackColor = $accent
$trilha.Controls.Add($barra)

$dots = 0
$barX = 0
$barDir = 1
$timerDots = New-Object System.Windows.Forms.Timer
$timerDots.Interval = 36
$timerDots.Add_Tick({
  $script:dots = ($script:dots + 1) % 28
  if (($script:dots % 12) -eq 0) {
    $fase = [int]([Math]::Floor($script:dots / 12)) % 4
    $status.Text = 'Carregando' + ('.' * $fase)
  }
  $script:barX += (6 * $script:barDir)
  if ($script:barX -gt 288) { $script:barX = 288; $script:barDir = -1 }
  if ($script:barX -lt 0) { $script:barX = 0; $script:barDir = 1 }
  $barra.Location = New-Object System.Drawing.Point($script:barX, 0)
})

$jobScript = Join-Path $raiz 'dg-boot.ps1'
$doneFlag = Join-Path $env:TEMP ('dg-boot-done-' + $PID + '.flag')
$errorFlag = Join-Path $env:TEMP ('dg-boot-error-' + $PID + '.flag')
Remove-Item -LiteralPath $doneFlag, $errorFlag -Force -ErrorAction SilentlyContinue

function Test-ComandoEhApp([string]$cmd) {
  if (-not $cmd) { return $false }
  $b = $cmd.ToLowerInvariant()
  if ($b.Contains('--type=')) { return $false }
  if ($b.Contains('.cjs') -or $b.Contains('.mjs') -or $b.Contains('\scripts\')) { return $false }
  if (-not $b.Contains('\dg editor\node_modules\electron\')) { return $false }
  return ($b.Contains('\dg editor"') -or $b.Contains('\dg editor --'))
}

function Test-DgEditorAberto {
  if (Get-Process -Name 'DG Editor' -ErrorAction SilentlyContinue) { return $true }
  try {
    $els = @(Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" -ErrorAction Stop)
  } catch {
    return $false
  }
  foreach ($el in $els) {
    if (Test-ComandoEhApp ([string]$el.CommandLine)) { return $true }
  }
  return $false
}

if (Test-DgEditorAberto) {
  Write-BootLog 'ja aberto — splash nao inicia outro boot'
  exit 0
}

Write-BootLog 'splash iniciado'
$form.Add_Shown({
  $timerDots.Start()
  # CreateNoWindow: WindowStyle Hidden ainda deixa filhos (npm/vite) abrirem cmd.
  $psExe = (Get-Command powershell.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
  if (-not $psExe) { $psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe' }
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $psExe
  $psi.Arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $jobScript + '" -Silent -DoneFlag "' + $doneFlag + '" -ErrorFlag "' + $errorFlag + '"'
  $psi.WorkingDirectory = $raiz
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  try {
    [void][System.Diagnostics.Process]::Start($psi)
  } catch {
    Write-BootLog ('falha ao iniciar boot: ' + $_.Exception.Message)
  }
})

$timerPoll = New-Object System.Windows.Forms.Timer
$timerPoll.Interval = 400
$startedAt = Get-Date
$timerPoll.Add_Tick({
  if (Test-Path -LiteralPath $errorFlag) {
    $timerDots.Stop(); $timerPoll.Stop()
    $status.ForeColor = [System.Drawing.Color]::FromArgb(220, 90, 90)
    $status.Text = 'Falha no boot — veja .dg-editor\logs\boot.log'
    $barra.BackColor = [System.Drawing.Color]::FromArgb(220, 90, 90)
    $barra.Width = 384
    $barra.Location = New-Object System.Drawing.Point(0, 0)
    Start-Sleep -Seconds 4
    $form.Close()
    return
  }
  $electronUp = Get-Process -Name 'electron','DG Editor' -ErrorAction SilentlyContinue
  if ((Test-Path -LiteralPath $doneFlag) -or $electronUp) {
    $timerDots.Stop(); $timerPoll.Stop()
    Write-BootLog 'app no ar — fechando splash'
    $form.Close()
    return
  }
  # timeout 8 min
  if (((Get-Date) - $startedAt).TotalMinutes -gt 8) {
    $timerDots.Stop(); $timerPoll.Stop()
    $status.Text = 'Demorou demais — veja o log de boot'
    Start-Sleep -Seconds 3
    $form.Close()
  }
})
$timerPoll.Start()

[void]$form.ShowDialog()
$timerDots.Dispose()
$timerPoll.Dispose()
$form.Dispose()
exit 0
