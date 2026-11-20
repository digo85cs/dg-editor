---
titulo: Inventario de disco
gatilho: inventario, Get-ChildItem, Test-Path, AutoPartz, partz, bloco A, app_quebrada, NÃO ENCONTRADO
---
Protocolo obrigatorio (estilo Cursor):
1. Chame disco_buscar com o padrao do nome (ex: partz|autopartz). Nao varra C:\Windows.
2. Autopilot/Autoplay/WinSxS = falso positivo. Descarte e continue.
3. AutoPartz pode ser a pasta "AUTO PARTS APP" no OneDrive\CURSOR.
4. No caminho util: disco_inspecionar + git status/log + Select-String nas rotas pedidas.
5. Complete TODOS os blocos (A/B/C/D) e as N linhas pedidas. Falta = NÃO ENCONTRADO. Nao invente.