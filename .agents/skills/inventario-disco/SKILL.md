---
name: inventario-disco
description: Inventario de disco (Gatilhos: inventario, Get-ChildItem, Test-Path, AutoPartz, partz, bloco A, app_quebrada, NÃO ENCONTRADO)
---

# Inventario de disco

## Quando usar
Pedido de inventario, busca de projeto ou verificacao de existencia de arquivos/pastas no PC.

## Procedimento
1. Chame `disco_buscar` com o padrao do nome (ex.: `partz|autopartz`). Nunca varra `C:\Windows` nem a raiz inteira.
2. Descarte falsos positivos conhecidos: Autopilot, Autoplay, WinSxS, caches do sistema.
3. Considere locais provaveis: `OneDrive\CURSOR`, `C:\dev`, `C:\xampp\htdocs`, Areas de Trabalho.
4. No caminho util, rode `disco_inspecionar` + `git status`/`git log` + busca de texto nas rotas pedidas.
5. Complete TODOS os blocos (A/B/C/D) e as N linhas solicitadas. Item faltante = "NAO ENCONTRADO". Nao invente caminho.

## Criterio de sucesso
- Cada linha do checklist tem caminho real verificado ou "NAO ENCONTRADO".
- Nenhum falso positivo do Windows entrou no resultado.

## O que NAO fazer
- Nao listar milhares de arquivos sem filtro.
- Nao reportar caminho que nao foi verificado existir.
- Nao demorar varrendo diretorios de sistema.
