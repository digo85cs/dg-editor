@echo off
REM Faxina organica em D:\CURSOR\DG Editor — deixa so o necessario para rodar.
REM Remove logs, caches, dist-app, dumps de QA e lixo de packaging.
REM NAO apaga src, out, node_modules, resources nem skills/agentes.
set "DG_ROOT=D:\CURSOR\DG Editor"
if not exist "%DG_ROOT%\package.json" (
  echo [ERRO] Pasta fixa nao encontrada: %DG_ROOT%
  pause
  exit /b 1
)
cd /d "%DG_ROOT%"
echo %DG_ROOT%> "%DG_ROOT%\.dg-root"
echo.
echo === DG Editor — faxina organica ===
echo Pasta: %DG_ROOT%
echo.
node "%DG_ROOT%\scripts\limpeza-workspace.cjs" --organica
set "ERR=%ERRORLEVEL%"
echo.
if not "%ERR%"=="0" (
  echo [ERRO] faxina terminou com codigo %ERR%
  pause
  exit /b %ERR%
)
echo Pronto. Use o atalho DG Editor na Area de Trabalho.
echo ^(Se o atalho estiver errado: atualizar-atalho-desktop.bat^)
echo.
pause
exit /b 0
