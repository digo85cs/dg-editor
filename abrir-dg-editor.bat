@echo off
REM Abre o DG Editor sem janela preta — so splash "Carregando".
REM Pasta fixa: D:\CURSOR\DG Editor
set "DG_ROOT=D:\CURSOR\DG Editor"
if not exist "%DG_ROOT%\package.json" (
  echo [ERRO] Pasta fixa nao encontrada: %DG_ROOT%
  pause
  exit /b 1
)
cd /d "%DG_ROOT%"
echo %DG_ROOT%> "%DG_ROOT%\.dg-root"
REM start + Hidden = sem console; splash cuida do boot
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%DG_ROOT%\scripts\splash-boot.ps1"
exit /b 0
