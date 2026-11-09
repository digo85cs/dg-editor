Set-Location -LiteralPath 'C:\dev\DGEditor'
$git = 'C:\Program Files\Git\bin\git.exe'
& $git add -A
$status = & $git status --porcelain
if ($status) {
  & $git commit -m "auto: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
}
