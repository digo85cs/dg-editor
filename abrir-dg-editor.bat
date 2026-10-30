@echo off
REM Entrega imediata ao VBS (zero console). Nao rode npm/build daqui.
REM Preferivel: atalho → wscript + abrir-dg-editor.vbs
set "DG_ROOT=D:\CURSOR\DG Editor"
if not exist "%DG_ROOT%\abrir-dg-editor.vbs" (
  echo [ERRO] Falta abrir-dg-editor.vbs em %DG_ROOT%
  echo Rode: git pull origin feat/vault-markdown
  pause
  exit /b 1
)
REM start deixa o cmd fechar na hora; wscript nao mostra janela
start "" /min wscript.exe //nologo "%DG_ROOT%\abrir-dg-editor.vbs"
exit /b 0
