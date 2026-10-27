#Requires -Version 5.1
<#
.SYNOPSIS
  Loop de QA do DG Editor com timeout por suite (sobrevive a madrugada).
.PARAMETER Fim
  DateTime de encerramento (default: amanha 08:00).
.PARAMETER IntervaloMin
  Minutos entre o inicio de cada ciclo (default 20).
.PARAMETER Suites
  Lista separada por virgula: ipc,perf,e2e (default ipc,perf,e2e).
#>
param(
  [DateTime]$Fim = [DateTime]::Today.AddDays(1).AddHours(8),
  [int]$IntervaloMin = 20,
  [string]$Suites = 'ipc,perf,e2e'
)

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $Root 'package.json'))) {
  Write-Error "package.json nao encontrado em $Root"
  exit 1
}

$ContDir = Join-Path $Root 'qa-artifacts\continuo'
New-Item -ItemType Directory -Force -Path $ContDir | Out-Null
$stamp = Get-Date -Format 'yyyy-MM-dd'
$mdPath = Join-Path $ContDir "relatorio-$stamp.md"
$jsonlPath = Join-Path $ContDir 'ciclos.jsonl'

if (-not (Test-Path -LiteralPath $mdPath)) {
  @(
    '# QA Continuo — DG Editor'
    ''
    "- Inicio: $(Get-Date -Format 'o')"
    "- Fim planejado: $($Fim.ToString('o'))"
    "- IntervaloMin: $IntervaloMin"
    "- Suites: $Suites"
    ''
    '| Ciclo | ISO | Suite | Exit | Ok | Warn | Erro | Nota |'
    '|------:|-----|-------|-----:|---:|-----:|-----:|------|'
  ) | Set-Content -LiteralPath $mdPath -Encoding UTF8
}

function Parse-Resumo([string]$texto) {
  $ok = $null; $warn = $null; $erro = $null
  if ($texto -match 'ok=(\d+)') { $ok = [int]$Matches[1] }
  if ($texto -match 'warn=(\d+)') { $warn = [int]$Matches[1] }
  if ($texto -match 'erro=(\d+)') { $erro = [int]$Matches[1] }
  return @{ ok = $ok; warn = $warn; erro = $erro }
}

function Run-SuiteJob([string]$suiteNome) {
  $script = {
    param($raiz, $suite)
    Set-Location -LiteralPath $raiz
    $npmCmd = "npm run qa:$suite --silent 2>&1"
    $out = Invoke-Expression $npmCmd | Out-String
    return @{
      exit = $LASTEXITCODE
      out = $out
    }
  }
  $job = Start-Job -ScriptBlock $script -ArgumentList $Root, $suiteNome
  $okWait = Wait-Job -Job $job -Timeout 900
  if (-not $okWait) {
    Stop-Job -Job $job -ErrorAction SilentlyContinue
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    return @{ exit = -1; out = ''; nota = 'TIMEOUT' }
  }
  $r = Receive-Job -Job $job -ErrorAction SilentlyContinue
  Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
  if ($null -eq $r) {
    return @{ exit = -2; out = ''; nota = 'sem_resultado' }
  }
  return @{
    exit = [int]$r.exit
    out = [string]$r.out
    nota = ''
  }
}

$lista = @($Suites.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$ciclo = 0
$proximo = Get-Date

Write-Host "[qa-continuo] root=$Root fim=$($Fim.ToString('o')) suites=$($lista -join ',')"

while ((Get-Date) -lt $Fim) {
  $ciclo++
  $iso = (Get-Date).ToString('o')
  Write-Host ""
  Write-Host "[qa-continuo] === ciclo $ciclo @ $iso ==="

  foreach ($s in $lista) {
    Write-Host "[qa-continuo] suite=$s ..."
    $res = Run-SuiteJob $s
    $resumo = Parse-Resumo $res.out
    $nota = $res.nota
    if (-not $nota -and $res.exit -ne 0) { $nota = 'exit_' + $res.exit }
    if (-not $nota) { $nota = 'ok' }

    $linha = "| $ciclo | $iso | $s | $($res.exit) | $($resumo.ok) | $($resumo.warn) | $($resumo.erro) | $nota |"
    Add-Content -LiteralPath $mdPath -Value $linha -Encoding UTF8
    Write-Host $linha

    $obj = [ordered]@{
      ciclo = $ciclo
      iso = $iso
      suite = $s
      exit = $res.exit
      ok = $resumo.ok
      warn = $resumo.warn
      erro = $resumo.erro
      nota = $nota
    }
    ($obj | ConvertTo-Json -Compress) | Add-Content -LiteralPath $jsonlPath -Encoding UTF8
  }

  $proximo = $proximo.AddMinutes($IntervaloMin)
  $agora = Get-Date
  if ($proximo -le $agora) { $proximo = $agora.AddMinutes($IntervaloMin) }
  if ($proximo -ge $Fim) { break }
  $sleepSec = [Math]::Max(1, [int]($proximo - $agora).TotalSeconds)
  Write-Host "[qa-continuo] sleep ${sleepSec}s ate $($proximo.ToString('HH:mm:ss'))"
  Start-Sleep -Seconds $sleepSec
}

@(
  ''
  '## Encerrado'
  "- Fim: $(Get-Date -Format 'o')"
  "- Total de ciclos: $ciclo"
) | Add-Content -LiteralPath $mdPath -Encoding UTF8

Write-Host "[qa-continuo] encerrado apos $ciclo ciclo(s). md=$mdPath"
exit 0
