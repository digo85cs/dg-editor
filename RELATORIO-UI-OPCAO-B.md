# Relatório — UI DG Editor (Opção B)

## Editor escolhido: CodeMirror 6

Justificativa: ESM nativo empacotado pelo electron-vite, funciona offline sem CDN, sem workers AMD do Monaco sob `contextIsolation` no Electron 33. Bundle razoável (~1,2 MB renderer com langs) com highlight, gutters, busca e Ctrl+S.

Alternativa rejeitada: Monaco — exigiria configuração extra de workers no preload/renderer e maior risco de falha no setup atual.

## Bundle delta

- Renderer JS pós-CM6: ~1265 KB (assets build)
- CSS: ~27 KB

## Validação Fase 7

| # | Item | Resultado |
|---|------|-----------|
| 1–3 | typecheck / build / build:mcp | PASS |
| 4 | app build sem erro de bundle | PASS |
| 5–10 | árvore, abas, dirty, Ctrl+S/W/Tab/P/F | implementado (IPC + UI) |
| 11–16 | chat, análise, navegador, tema, IDs, smoke | IDs 32/32; smoke ver log |
| 17 | hexes dark/light | preservados em tokens.css |
| 18–20 | layout/scroll/abas | implementado |
| 21–24 | IPC segurança (fora, >5MB, binário, traversal) | 4/4 PASS |

## Commits (locais, sem push)

Ver `git log` após a série `refactor(ui)` … `docs(ui)`.
