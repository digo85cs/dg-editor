# Isolamento de Repositório — DG Editor

## Princípio

Operações de chat, MCP e agente devem ser escopadas ao **workspace ativo** selecionado pelo usuário, nunca vazar para o diretório da própria aplicação DG Editor.

## Duas raízes distintas

| Função | Retorna | Uso adequado |
|--------|---------|--------------|
| `resolverRaizProjeto()` | Diretório do DG Editor (acha `package.json` com `name === 'dg-editor'`) | Configuração da própria aplicação |
| `resolverRaizDGEditor()` | Diretório do DG Editor | Configuração da própria aplicação |
| `obterRaizWorkspace()` | Workspace ativo do usuário (memória ou `DG_ROOT` env) | Operações de usuário (chat, git, código, índice) |
| `resolverRaizChat(payload)` | Payload ou workspace ativo | Handlers de chat IPC |

## Onde cada uma é usada

### `obterRaizWorkspace()` / `resolverRaizChat()` (correto para usuário)

- `src/main/ipc/chat.ts:handleChatSend` — resolve raiz do chat antes de processar a mensagem
- `src/main/mcp/http-server.ts:21` — raiz base do servidor MCP HTTP
- `src/main/brain/providers.ts:399,413,460,568` — cursor-cli status, workspace e codex cwd
- `src/main/brain/ollama.ts:159,365` — seleção de modelo por tarefa

### `resolverRaizProjeto()` / `resolverRaizDGEditor()` (apenas para app)

- `src/main/paths.ts` — definições das funções
- Configuração global da aplicação (`dg-config.json`, caminhos de sistema)

## Fluxo de isolamento no chat

1. Usuário seleciona uma pasta no Bloco 1 → `definirRaizWorkspace(pasta)` armazena a raiz ativa
2. `chat:send` é invocado com `root` → `resolverRaizChat(root)` confirma/usa a raiz ativa
3. `definirRaizWorkspace(rootOk)` e `process.env.DG_ROOT = rootOk` propagam para subprocessos
4. Todas as operações subsequentes (ollama, índice, chats, git) usam essa raiz

## Verificações pendentes

- `caminhoIndice` e `caminhoChat` devem gravar na raiz do workspace ativo (não em `resolverRaizProjeto()`)
- `src/main/brain/ollama.ts:24` (`loadDgConfig`) lê `dg-config.json` do DG Editor — config de nível de aplicação, mantida intencionalmente
