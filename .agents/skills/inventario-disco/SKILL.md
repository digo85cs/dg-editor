---
name: inventario-disco
description: Inventario de disco (Gatilhos: inventario, Get-ChildItem, Test-Path, AutoPartz, partz, bloco A, app_quebrada, NÃO ENCONTRADO)
---

# Inventario de disco

## Quando usar
Pedidos de inventario de arquivos/pastas, verificacao de caminhos (Test-Path, Get-ChildItem), auditoria de projetos no disco ou checklist com blocos A/B/C/D.

## Procedimento
1. Chame disco_buscar com o padrao do nome (ex: partz|autopartz). Nao varra C:\Windows.
2. Autopilot/Autoplay/WinSxS = falso positivo. Descarte e continue a busca.
3. AutoPartz pode ser a pasta "AUTO PARTS APP" no OneDrive\CURSOR.
4. No caminho util: disco_inspecionar + git status/log + Select-String nas rotas pedidas.
5. Complete TODOS os blocos (A/B/C/D) e as N linhas pedidas. Falta = "NÃO ENCONTRADO". Nao invente.
6. Para cada achado, confirme com segunda tool (ler arquivo ou listar subpasta) antes de afirmar.

## Criterio de sucesso
- Todo caminho citado existe e foi verificado por tool.
- Itens nao encontrados aparecem marcados como NÃO ENCONTRADO.
- Nenhum falso positivo do Windows entra no resultado.

## O que NAO fazer
- Nao aceitar o primeiro resultado de busca sem filtrar ruido do sistema.
- Nao completar blocos do checklist com suposicoes.
- Nao rodar varreduras amplas em pastas de sistema.
