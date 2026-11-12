#Requires -Version 5.1
param([switch]$SkipRunNow)
$ErrorActionPreference = 'Stop'
$script = 'C:\dev\DGEditor\scripts\backup-onedrive.ps1'
$taskName = 'BackupDgEditorOneDrive'
if (-not (Test-Path -LiteralPath $script)) { throw "Script ausente: $script" }
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $script + '"')
$trigger = New-ScheduledTaskTrigger -Daily -At '03:10'
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "OK tarefa: $taskName (diario 03:10)" -ForegroundColor Green
if (-not $SkipRunNow) {
  Write-Host '>> Rodando primeiro backup agora...' -ForegroundColor Cyan
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}