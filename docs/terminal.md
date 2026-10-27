# Terminal embutido

## O que é

O DG Editor usa o mesmo stack do VS Code:

- **node-pty** — pseudo-terminal real (ConPTY no Windows)
- **xterm.js** (`@xterm/xterm`) — renderer no painel inferior

Isso executa PowerShell de verdade (cores ANSI, `git`, `npm`, editores TUI).

## Por que não é o Windows Terminal

O app **Windows Terminal** (`wt.exe`) não expõe API de hospedagem em outro
processo. Embutir `wt.exe` com `SetParent` não é suportado. O equivalente
funcional é node-pty + xterm — o mesmo caminho do VS Code.

## Detecção de shell (cascata)

1. Maior versão em `%ProgramFiles%\PowerShell\*\pwsh.exe` (semver numérico)
2. `pwsh-preview.exe` nas mesmas pastas
3. `pwsh` no PATH
4. `%LocalAppData%\Microsoft\WindowsApps\pwsh.exe`
5. `powershell.exe` (Windows PowerShell 5.1)
6. `cmd.exe`

A escolha da maior pasta em `PowerShell\` faz o app acompanhar automaticamente
pwsh 8, 9… quando o usuário instalar — sem atualizar o DG Editor.

## Atualizar o PowerShell

```powershell
winget upgrade --id Microsoft.PowerShell
```

Reinicie o DG Editor após a atualização (a detecção roda no boot).

## Atalho

- **Ctrl+`** — abre/fecha o painel
- **Ctrl+1..9** — troca de aba no grupo ativo
- **Ctrl+Alt+←/→** (split horizontal) ou **Ctrl+Alt+↑/↓** (vertical) — alterna grupo
- Arrastar a borda superior redimensiona (altura em `localStorage`)

## Perfis de shell

O seletor no header lista todos os shells detectados (`listarShells()`):

- cada versão de pwsh em `%ProgramFiles%\PowerShell`
- pwsh no PATH / WindowsApps (sem duplicar versão)
- pwsh-preview, Windows PowerShell 5.1 e cmd

A troca de perfil reinicia **só a aba ativa**. Abas novas herdam o shell da aba ativa.

## Split panes

Botão **⧉** divide o painel em dois grupos independentes (abas e sessões próprias).

- Orientação horizontal/vertical (⇄); divisor arrastável (20%–80%)
- Fechar divisão (▣) mata o grupo B e preserva o A
- Última aba de um grupo em split: remove aquele grupo; se sobrar um, volta a `single`
- Em split, arraste abas entre grupos (ou reordene) sem matar o pty
- Persistidos: modo, orientação, altura e estrutura de abas (`dg.terminal.layout`) — nunca o conteúdo do terminal

### Perfil padrão e restauração

- Estrela no header: define o shell da aba ativa como padrão (`userData/dg-editor.json`)
- Ao reabrir o painel, restaura grupos/abas/shells do snapshot (máx. 4 abas/grupo); JSON inválido cai em single com 1 aba

## Troubleshooting

| Sintoma | Ação |
|---------|------|
| `NODE_MODULE_VERSION` / node-pty não carrega | `npm run postinstall` |
| MSB8040 Spectre | O `postinstall` aplica `scripts/patch-node-pty-spectre.cjs` antes do rebuild |
| Shell antigo | Instale/atualize pwsh com winget (acima) |
| Terminal não abre | Veja a auditoria de boot (`terminal:shell` / `terminal:node-pty`) |
