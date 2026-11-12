@echo off
cd /d "%~dp0"
if not exist "%~dp0package.json" exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\criar-atalho-desktop.ps1"
exit /b %ERRORLEVEL%
