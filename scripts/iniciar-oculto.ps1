# Inicia DG Editor sem nenhuma janela de console.
$ErrorActionPreference = 'SilentlyContinue'
$Root = Split-Path -Parent $PSScriptRoot
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = (Get-Command node.exe -EA SilentlyContinue).Source
if (-not $psi.FileName) { $psi.FileName = 'node' }
$psi.Arguments = '"' + (Join-Path $Root 'scripts\iniciar-app.cjs') + '"'
$psi.WorkingDirectory = $Root
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
[void][System.Diagnostics.Process]::Start($psi)
