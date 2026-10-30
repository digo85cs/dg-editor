@echo off
REM Recria o atalho "DG Editor" na Area de Trabalho (alvo correto).
REM Rode este arquivo UMA vez (duplo clique) na pasta D:\CURSOR\DG Editor
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\criar-atalho-desktop.ps1"
if errorlevel 1 (
  echo.
  echo Falhou ao criar o atalho. Rode como usuario normal na pasta do projeto.
  pause
  exit /b 1
)
echo.
echo Pronto. Use o atalho "DG Editor" na Area de Trabalho.
pause
