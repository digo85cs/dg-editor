@echo off
REM Redireciona para o launcher sem console (VBS).
REM Pasta fixa: D:\CURSOR\DG Editor
set "DG_ROOT=D:\CURSOR\DG Editor"
if not exist "%DG_ROOT%\package.json" (
  echo [ERRO] Pasta fixa nao encontrada: %DG_ROOT%
  pause
  exit /b 1
)
cd /d "%DG_ROOT%"
echo %DG_ROOT%> "%DG_ROOT%\.dg-root"
REM wscript = zero janela de terminal
wscript //nologo "%DG_ROOT%\abrir-dg-editor.vbs"
exit /b 0
