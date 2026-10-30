@echo off
REM Atalho correto do DG Editor (Windows).
REM Pasta de trabalho FIXA: D:\CURSOR\DG Editor
REM NAO use:  ...\node_modules\electron\dist
set "DG_ROOT=D:\CURSOR\DG Editor"
if not exist "%DG_ROOT%\package.json" (
  echo [ERRO] Pasta fixa nao encontrada: %DG_ROOT%
  echo Verifique se o projeto esta em D:\CURSOR\DG Editor
  pause
  exit /b 1
)
cd /d "%DG_ROOT%"
echo %DG_ROOT%> "%DG_ROOT%\.dg-root"
call "%DG_ROOT%\dg-boot.bat"
