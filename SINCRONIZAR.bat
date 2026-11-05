@echo off
REM Baixa/atualiza D:\CURSOR\DG Editor even if this folder is empty/outdated.
REM Pode rodar de qualquer lugar se o script ja existir; senao use o comando do README.
set "DG_ROOT=D:\CURSOR\DG Editor"
if exist "%DG_ROOT%\scripts\sincronizar-windows.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%DG_ROOT%\scripts\sincronizar-windows.ps1"
) else if exist "%~dp0scripts\sincronizar-windows.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sincronizar-windows.ps1"
) else (
  echo Script local ausente. Cole isto no PowerShell:
  echo.
  echo irm https://raw.githubusercontent.com/digo85cs/dg-editor/feat/vault-markdown/scripts/sincronizar-windows.ps1 ^| iex
  echo.
)
pause
