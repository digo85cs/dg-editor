@echo off
cd /d "D:\CURSOR\DG Editor"
if not exist "D:\CURSOR\DG Editor\package.json" exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "D:\CURSOR\DG Editor\scripts\criar-atalho-desktop.ps1"
exit /b %ERRORLEVEL%
