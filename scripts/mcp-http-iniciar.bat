@echo off
rem Inicia o servidor MCP HTTP do DG Editor (127.0.0.1:7331).
rem O tunel publico e mantido pelo servico Windows "cloudflared" (named tunnel).
setlocal
set "DG_ROOT=%~dp0.."
if not exist "%DG_ROOT%\.dg-editor\bin\main\mcp\http-server.js" (
  echo http-server.js nao compilado - rode: npm run mcp:http
  exit /b 1
)
if not exist "%LOCALAPPDATA%\dg-editor\mcp-http-token.txt" (
  echo Token ausente em %LOCALAPPDATA%\dg-editor\mcp-http-token.txt
  exit /b 1
)
set /p DG_MCP_TOKEN=<"%LOCALAPPDATA%\dg-editor\mcp-http-token.txt"
cd /d "%DG_ROOT%"
node .dg-editor\bin\main\mcp\http-server.js
