@echo off
set "DG_ROOT=%~dp0"
if "%DG_ROOT:~-1%"=="\" set "DG_ROOT=%DG_ROOT:~0,-1%"
if not exist "%DG_ROOT%\abrir-dg-editor.vbs" exit /b 1
start "" /min wscript.exe //nologo "%DG_ROOT%\abrir-dg-editor.vbs"
exit /b 0
