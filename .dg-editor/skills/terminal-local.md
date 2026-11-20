---
titulo: Terminal local
gatilho: terminal, comando, shell, npm, git status
---

# Terminal local

## Quando usar
Pedido que exige rodar comando: status, build, teste, script, git, instalacao leve.

## Procedimento
1. Use `terminal_exec` (ou o terminal do app) para comandos de leitura e verificacao: `git status`, `npm test`, `npm run build`, listagens filtradas.
2. Rode um comando por vez e reporte saida relevante — erro e sucesso.
3. Pedidos destrutivos (delete, reset, force push, instalacao global) exigem confirmacao explicita do usuario antes.
4. Para achar projeto no PC (inventario), use `disco_buscar` — nunca `Get-ChildItem C:\` sem excluir Windows/Program Files.
5. Comandos longos: rode em background ou avise que pode demorar.

## Criterio de sucesso
- O comando rodou de verdade e a saida real foi reportada.
- Nenhum comando destrutivo rodou sem confirmacao.

## O que NAO fazer
- Nao rodar `rm -rf`, format, deploy ou publicacao sem autorizacao.
- Nao varrer o disco inteiro pelo terminal.
- Nao reportar "deve funcionar" sem ter rodado.
