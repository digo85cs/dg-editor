@echo off
set "DG_ROOT=D:\CURSOR\DG Editor"
if not exist "%DG_ROOT%\abrir-dg-editor.vbs" exit /b 1
start "" /min wscript.exe //nologo "%DG_ROOT%\abrir-dg-editor.vbs"
exit /b 0
