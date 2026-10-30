# dg-editor
DG Editor - editor de sistemas com IA (Electron + TypeScript + Ollama local)

## Abrir no Windows

**Atalho da Área de Trabalho:** rode uma vez `corrigir-atalho-desktop.bat` na pasta do projeto. Ele cria/corrige o ícone **DG Editor** na Área de Trabalho (e remove atalho velho que apontava para `electron\dist`).

Depois use só o atalho **DG Editor** da Área de Trabalho (ou `abrir-dg-editor.bat` / `dg-boot.bat`).

Não use `node_modules\electron\dist` — abre Electron cru / build velho.

```bat
cd /d "D:\CURSOR\DG Editor"
git pull origin feat/vault-markdown
corrigir-atalho-desktop.bat
```

## Terminal

Painel inferior com **PowerShell 7** (`pwsh`) via node-pty + xterm.js (atalho **Ctrl+`**).
Perfis de shell por aba, abas múltiplas e split panes (horizontal/vertical).
Atualize o shell com `winget upgrade --id Microsoft.PowerShell`.
Detalhes: [docs/terminal.md](docs/terminal.md).

## Navegador embutido

Aba **Browser** no painel direito (`WebContentsView` na janela principal). Em smoke (`DG_NAV_SMOKE=1`) ainda existe um caminho legado com `BaseWindow` — ver [docs/DIVIDAS.md](docs/DIVIDAS.md).

## Testes

Ordem da suíte e regra do smoke **isolado**: [docs/TESTES.md](docs/TESTES.md).

Índice de símbolos (MCP): [docs/brain-indice.md](docs/brain-indice.md).
