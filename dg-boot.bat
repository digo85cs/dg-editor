@echo off
REM Boot com console (debug). Uso diario: abrir-dg-editor.bat (splash).
set "DG_ROOT=D:\CURSOR\DG Editor"
if not exist "%DG_ROOT%\package.json" (
  cd /d "%~dp0"
  set "DG_ROOT=%CD%"
) else (
  cd /d "%DG_ROOT%"
)
echo %DG_ROOT%> "%CD%\.dg-root"
powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\dg-boot.ps1"
if errorlevel 1 pause
