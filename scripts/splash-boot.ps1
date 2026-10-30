# Splash moderno "Carregando" + boot silencioso (sem janela preta do cmd/vite).
# Chamado por abrir-dg-editor.bat com -WindowStyle Hidden.
$ErrorActionPreference = 'Continue'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$raizFixa = 'D:\CURSOR\DG Editor'
$raiz = if (Test-Path (Join-Path $raizFixa 'package.json')) { $raizFixa } else { (Get-Location).Path }
Set-Location $raiz
$env:DG_ROOT = $raiz

$logDir = Join-Path $raiz '.dg-editor\logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir 'boot.log'

function Write-BootLog([string]$msg) {
  $line = ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $msg)
  try { Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8 } catch {}
}

# ---------- Splash UI ----------
$form = New-Object System.Windows.Forms.Form
$form.Text = 'DG Editor'
$form.FormBorderStyle = 'None'
$form.StartPosition = 'CenterScreen'
$form.Size = New-Object System.Drawing.Size(420, 220)
$form.BackColor = [System.Drawing.Color]::FromArgb(18, 18, 20)
$form.TopMost = $true
$form.ShowInTaskbar = $true

$painel = New-Object System.Windows.Forms.Panel
$painel.Dock = 'Fill'
$painel.BackColor = [System.Drawing.Color]::FromArgb(18, 18, 20)
$form.Controls.Add($painel)

$titulo = New-Object System.Windows.Forms.Label
$titulo.Text = 'DG Editor'
$titulo.ForeColor = [System.Drawing.Color]::FromArgb(232, 232, 232)
$titulo.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 22, [System.Drawing.FontStyle]::Bold)
$titulo.AutoSize = $true
$titulo.Location = New-Object System.Drawing.Point(36, 48)
$painel.Controls.Add($titulo)

$status = New-Object System.Windows.Forms.Label
$status.Text = 'Carregando'
$status.ForeColor = [System.Drawing.Color]::FromArgb(140, 200, 190)
$status.Font = New-Object System.Drawing.Font('Segoe UI', 12)
$status.AutoSize = $true
$status.Location = New-Object System.Drawing.Point(38, 108)
$painel.Controls.Add($status)

$barra = New-Object System.Windows.Forms.ProgressBar
$barra.Style = 'Marquee'
$barra.MarqueeAnimationSpeed = 28
$barra.Size = New-Object System.Drawing.Size(340, 6)
$barra.Location = New-Object System.Drawing.Point(40, 150)
$painel.Controls.Add($barra)

$dots = 0
$timerDots = New-Object System.Windows.Forms.Timer
$timerDots.Interval = 420
$timerDots.Add_Tick({
  $script:dots = ($script:dots + 1) % 4
  $status.Text = 'Carregando' + ('.' * $script:dots)
})

$jobScript = Join-Path $raiz 'dg-boot.ps1'
$doneFlag = Join-Path $env:TEMP ('dg-boot-done-' + $PID + '.flag')
$errorFlag = Join-Path $env:TEMP ('dg-boot-error-' + $PID + '.flag')
Remove-Item -LiteralPath $doneFlag, $errorFlag -Force -ErrorAction SilentlyContinue

Write-BootLog 'splash iniciado'
$form.Add_Shown({
  $timerDots.Start()
  $argsList = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-WindowStyle', 'Hidden',
    '-File', $jobScript,
    '-Silent',
    '-DoneFlag', $doneFlag,
    '-ErrorFlag', $errorFlag
  )
  Start-Process -FilePath 'powershell.exe' -ArgumentList $argsList -WindowStyle Hidden | Out-Null
})

$timerPoll = New-Object System.Windows.Forms.Timer
$timerPoll.Interval = 400
$startedAt = Get-Date
$timerPoll.Add_Tick({
  if (Test-Path -LiteralPath $errorFlag) {
    $timerDots.Stop(); $timerPoll.Stop()
    $status.ForeColor = [System.Drawing.Color]::FromArgb(220, 90, 90)
    $status.Text = 'Falha no boot — veja .dg-editor\logs\boot.log'
    $barra.Style = 'Continuous'
    $barra.Value = 0
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
