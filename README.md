# DG Editor
Editor de sistemas com IA local.

## Abrir no Windows

**Atalho da Área de Trabalho:** rode uma vez `corrigir-atalho-desktop.bat` na pasta do projeto. Ele cria/corrige o ícone **DG Editor** na Área de Trabalho (e remove atalho velho que apontava para `electron\dist`).

Depois use só o atalho **DG Editor** da Área de Trabalho (ou `abrir-dg-editor.bat` / `dg-boot.bat`).

Não use `node_modules\electron\dist` — abre Electron cru / build velho.

```bat
cd /d "D:\CURSOR\DG Editor"
git pull origin feat/vault-markdown
corrigir-atalho-desktop.bat
```

### App instalável (Windows, sem pasta electron)

Gera `DG Editor.exe` com ícone e nome próprios:

```bat
npm install
npm run dist:win:installer
```

Saída em `dist-app\`. O atalho do instalador aponta para **DG Editor**, não para o runtime interno.

## Terminal

Painel inferior com **PowerShell 7** (`pwsh`) via node-pty + xterm.js (atalho **Ctrl+`**).
Perfis de shell por aba, abas múltiplas e split panes (horizontal/vertical).
Atualize o shell com `winget upgrade --id Microsoft.PowerShell`.
Detalhes: [docs/terminal.md](docs/terminal.md).

## Navegador embutido

Aba **Browser** no painel direito (`WebContentsView` na janela principal). Smoke clássico (`DG_NAV_SMOKE=1`) usa `BaseWindow`; smoke do caminho de produção: `DG_NAV_SMOKE=1 DG_NAV_SMOKE_EMBED=1` — ver [docs/DIVIDAS.md](docs/DIVIDAS.md).
Cobertura do caminho **embed** (produção): `navegador:embed-status` + e2e `ui.browser.*` + smoke-embed.

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
| **Propostas** | Writes MCP viram unified diffs; **Revisar** / **Aplicar arquivo** / **Aplicar hunks** / **Aplicar todas** (checkpoint) |
| **Hunks** | Aceitar/rejeitar por hunk no painel de diff (`propostas:definir-hunks`) |
| **Diff no editor** | Botão **No editor** → preview side-by-side (`propostas:preview`) |
| **Auto-verify** | Após o turno, typecheck + rodada de correção se falhar |
| **Contexto implícito** | `.dgrules` (cria template se ausente) + abas + git + diagnósticos + erros do editor |
| **Checklist do plano** | Passos editáveis; **Próximo passo** executa só o pendente |
| **Parar** | Aborta o job atual e limpa a fila (`AbortController`) |
| **Desfazer apply** | Restaura o último checkpoint |
| **Statusbar** | `#sb-agent` — modelo · latência · fila |

Fila de propostas **unificada** (Agent + OpenClaw). Apply do Agent usa `agente:aplicar-proposta` (checkpoint). OpenClaw segue HTTP + aprovação humana, sem shell.

## Contas / identidade

E-mail canônico do dono (único para contas do DG Editor): **digo85cs@gmail.com** (`src/shared/owner.ts`). Aparece em **Contas → Identidade**.

## Adapta ONE / Maestro

Continuidade para Contextos do ONE + MCP para o Maestro: painel em **Contas** / **Configurações**. Guia: [docs/adapta.md](docs/adapta.md).

## Testes

Ordem da suíte e regra do smoke **isolado**: [docs/TESTES.md](docs/TESTES.md).

Índice de símbolos (MCP): [docs/brain-indice.md](docs/brain-indice.md).
