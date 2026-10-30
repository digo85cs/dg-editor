@echo off
REM Boot do DG Editor — sempre na pasta fixa do Windows.
set "DG_ROOT=D:\CURSOR\DG Editor"
if not exist "%DG_ROOT%\package.json" (
  REM fallback: pasta deste .bat (dev/CI)
  cd /d "%~dp0"
  set "DG_ROOT=%CD%"
) else (
  cd /d "%DG_ROOT%"
)
echo %DG_ROOT%> "%CD%\.dg-root"
powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\dg-boot.ps1"
if errorlevel 1 pause
