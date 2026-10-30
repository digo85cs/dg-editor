@echo off
REM So atualiza o atalho em C:\Users\digo8\OneDrive\Desktop (rapido, sem npm).
cd /d "D:\CURSOR\DG Editor"
if not exist "D:\CURSOR\DG Editor\package.json" (
  echo [ERRO] Projeto nao esta em D:\CURSOR\DG Editor
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\CURSOR\DG Editor\scripts\criar-atalho-desktop.ps1"
echo.
pause
