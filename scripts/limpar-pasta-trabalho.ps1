#Requires -Version 5.1
<#
.SYNOPSIS
  Limpa sobras do DG Editor: relatorios velhos de QA, capturas, testes soltos e backups antigos.
  Nao mexe em codigo, git, node_modules, icones do app nem no estado atual (modelos, chats, indice).
#>
$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $Root 'package.json'))) {
  Write-Error "package.json nao encontrado em $Root"
  exit 1
}

$logDir = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logPath = Join-Path $logDir 'limpeza-pasta-ultima.log'
$linhas = New-Object System.Collections.Generic.List[string]
function L([string]$m) { $linhas.Add(('{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $m)) }

$apagados = 0
$bytes = [int64]0
function Remover([string]$caminho) {
  if (-not (Test-Path -LiteralPath $caminho)) { return }
  $item = Get-Item -LiteralPath $caminho -Force
  $tam = 0L
  if ($item.PSIsContainer) {
    $tam = [int64](Get-ChildItem -LiteralPath $caminho -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
  } else {
    $tam = [int64]$item.Length
  }
  Remove-Item -LiteralPath $caminho -Recurse -Force -ErrorAction SilentlyContinue
  if (-not (Test-Path -LiteralPath $caminho)) {
    $script:apagados++
    $script:bytes += $tam
    L ('apagou {0} ({1:N0} bytes)' -f $item.FullName.Substring($Root.Length), $tam)
  }
}

L ('inicio raiz={0}' -f $Root)

$qa = Join-Path $Root 'qa-artifacts'
if (Test-Path -LiteralPath $qa) {
  Get-ChildItem -LiteralPath $qa -Force | ForEach-Object {
    $manter = $_.Name -in @('baseline.json', '.gitkeep', 'latest', 'continuo')
    if (-not $manter) { Remover $_.FullName }
  }
}

@(
  'teste-*.cjs', 'teste-*.log', 'diag-*.cjs', 'tmp-*.cjs',
  'dossie-tecnico.cjs', 'dossie-tecnico.json', 'dossie-tecnico.md',
  'fase0-snapshot.txt', 'package.json.bak',
  'repair-mojibake.cjs', 'check-acentos.cjs', 'gen-css.cjs', 'fix64.cjs'
) | ForEach-Object {
  Get-ChildItem -LiteralPath $Root -Filter $_ -File -Force -ErrorAction SilentlyContinue | ForEach-Object { Remover $_.FullName }
}

$downloads = Join-Path $Root '.dg-editor\downloads'
if (Test-Path -LiteralPath $downloads) {
  Get-ChildItem -LiteralPath $downloads -Recurse -File -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) -or $_.Extension -match '\.(png|jpe?g|gif|webp|bmp|tmp|log)$' } |
    ForEach-Object { Remover $_.FullName }
}

Remover (Join-Path $Root '.dg-editor\backup')

$backs = Join-Path $Root '.dg-editor\_backups'
if (Test-Path -LiteralPath $backs) {
  $lista = @(Get-ChildItem -LiteralPath $backs -File -Force | Sort-Object LastWriteTime -Descending)
  for ($i = 1; $i -lt $lista.Count; $i++) { Remover $lista[$i].FullName }
}

$tmp = Join-Path $Root 'tmp'
if (Test-Path -LiteralPath $tmp) { Remover $tmp }

L ('fim itens={0} bytes={1:N0}' -f $apagados, $bytes)
$linhas | Set-Content -LiteralPath $logPath -Encoding UTF8
Write-Output ("ITENS={0} BYTES={1}" -f $apagados, $bytes)
