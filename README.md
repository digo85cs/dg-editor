# dg-editor
DG Editor - editor de sistemas com IA (Electron + TypeScript + Ollama local)

## Terminal

Painel inferior com **PowerShell 7** (`pwsh`) via node-pty + xterm.js (atalho **Ctrl+`**).
Perfis de shell por aba, abas múltiplas e split panes (horizontal/vertical).
Atualize o shell com `winget upgrade --id Microsoft.PowerShell`.
Detalhes: [docs/terminal.md](docs/terminal.md).

## Navegador embutido

Aba **Browser** no painel direito (`WebContentsView` na janela principal). Em smoke (`DG_NAV_SMOKE=1`) ainda existe um caminho legado com `BaseWindow` — ver [docs/DIVIDAS.md](docs/DIVIDAS.md).
Cobertura do caminho **embed** (produção): `navegador:embed-status` + cenários e2e `ui.browser.*` (sem `DG_NAV_SMOKE`).

## Agent / Plan / menções / checkpoint

Aba central **Agent**:

| Recurso | Como |
|---------|------|
| **Plan mode** | Checkbox — gera plano em markdown **sem** tools; plano fica salvo em `agent-last-plan.json` |
| **Executar plano** | Roda o último plano em modo agent com propostas de diff |
| **@projeto** | Estrutura + busca + embeddings (Ollama/nomic, opcional) + vault |
| **@arquivo:path** | Injeta conteúdo do arquivo |
| **@nota:Nome** | Resolve wikilink do vault Markdown |
| **@selecao** | Seleção atual do editor |
| **Propostas** | Writes MCP viram unified diffs; **Revisar** / **Aplicar** / **Aplicar todas** (com checkpoint) |
| **Parar** | Aborta o job atual e limpa a fila (`AbortController`) |
| **Desfazer apply** | Restaura o último checkpoint |
| **Statusbar** | `#sb-agent` — modelo · latência · fila |

OpenClaw continua separado (HTTP + aprovação humana, sem shell). O painel de diffs é reutilizado; apply do Agent usa `agente:aplicar-proposta` (checkpoint automático).

## Testes

Ordem da suíte e regra do smoke **isolado**: [docs/TESTES.md](docs/TESTES.md).

Índice de símbolos (MCP): [docs/brain-indice.md](docs/brain-indice.md).
