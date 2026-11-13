# Arquitetura — DG Editor

## Visão geral

O DG Editor é um editor de sistemas com IA local, construído com Electron. Separa-se em três camadas:

- **Main process** (`src/main/`): lógica de negócio, IPC, MCP, provedores de IA, agente, memória, sistema de arquivos, git.
- **Renderer process** (`src/renderer/`): UI em HTML/CSS/JS puro, gerenciamento de abas, editor, chats, painéis laterais.
- **Preload** (`src/preload/`): ponte `window.api` exposta ao renderer via `contextBridge`.

## Camada Main

### Entrada
`src/main/index.ts` — inicializa o Electron, registra todos os handlers IPC, sobe o servidor MCP stdio.

### IPC
Os handlers estão em `src/main/ipc/`:
- `chat.ts` — `chat:send`, detecção de anexos de imagem, roteamento para agente
- `brain.ts` — `brain:ask`, `brain:providers`, `brain:ollama-status`, `brain:models`, `brain:avaliar`
- `ferramentas.ts` — `workspace:salvar`, `workspace:definir-raiz`, `workspace:carregar`, `backup:onedrive`
- `mcp.ts` — ponte para cliente MCP stdio
- `folder.ts`, `dossie.ts`, `modelos.ts`, `providers.ts`, `guardian.ts`, `skills.ts`, `regras-gerais.ts`, `automation:*`, `vault:*`, `navegador:*`, etc.

### Provedores de IA
`src/main/brain/providers.ts` — adaptadores unificados:
- **Ollama local** (`ollama.ts`) — único ponto de contato com `http://127.0.0.1:11434`
- **OpenAI-compatible** (OpenRouter etc.) — via HTTP
- **cursor-cli** — somente leitura, `--mode ask`
- **codex-cli** — execução com `cwd` na raiz do workspace ativo

### Modelo de seleção
`src/main/brain/ollama.ts` — `escolherModelo()` e `askOllama()` usam a raiz do workspace ativo (`obterRaizWorkspace()`) para resolver o catálogo de modelos por tarefa.

### Memória e índice
- `src/main/brain/indice.ts` — índice de símbolos (funções, classes, tipos) por workspace
- `src/main/memory/embeddings.ts` — índice vetorial de turnos de chat (Ollama/nomic embeddings)
- `src/main/memory/hybrid.ts` — `montarContexto()` combina `loadChat` + busca semelhante
- `src/main/chatstore.ts` — persistência de chats por workspace (`.dg-editor/chats/`)

### Dossie e vault
- `src/main/dossie.ts` — `lerDossie`, `dossieSnapshot` (`.dg-editor/dossie.txt`)
- Vault Markdown em `.dg-editor/` com backlinks e tags

### Agente
`src/main/brain/agent.ts` — `executarAgente()` com guarda `profundidadeAgente`. Fila de jobs em `src/main/agent/fila.ts` (`filasPorRaiz`, isolamento por raiz). Orquestrador em `src/main/agent/orquestrador.ts`.

### Segurança
- `src/main/guardian.ts` — `guardianPodeOperar()`, limites de RAM/CPU
- Caminhos protegidos (`.env`, `.pem`, chaves, tokens) recusados pelo MCP HTTP
- Path traversal bloqueado via `caminhoEhProtegido()` e `dentroDoVault()`

### Workspace / Isolamento de repositório
`src/main/workspace-raiz.ts`:
- `definirRaizWorkspace(pasta)` — define a raiz ativa do workspace
- `obterRaizWorkspace()` — retorna a raiz ativa (memória ou `DG_ROOT` env)
- `resolverRaizChat(rootPayload)` — resolve a raiz do chat preferindo o payload, senão a raiz ativa persistida

Handlers de chat usam `resolverRaizChat` para isolar operações por repositório. Nunca usam `resolverRaizProjeto()` para operações de usuário.

## MCP

Dois servidores, isolados:

1. **stdio** (`src/main/mcp/server.ts`) — para uso local, não exposto por rede.
2. **HTTP** (`src/main/mcp/http-server.ts`) — `127.0.0.1:7331`, somente leitura, autenticado por `DG_MCP_TOKEN`, 11 ferramentas de leitura.

## Build e scripts

- `npm run dev` — modo desenvolvimento (electron-vite)
- `npm run build` — build de produção (verificação de encoding, sintaxe, electron-vite)
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — vitest (22 suítes, 145 testes)
- `npm run mcp:http` — inicia o servidor MCP HTTP (requer `DG_MCP_TOKEN`)
- `npm run mcp` — inicia o servidor MCP stdio

## Tecnologias

- Electron, electron-vite, Vite
- TypeScript (main), JavaScript (renderer)
- `@modelcontextprotocol/sdk` (MCP)
- `@hono/node-server` (disponível para HTTP)
- Zod (validação de schemas)
- Ollama (IA local)
- node-pty + xterm.js (terminal)
- WebContentsView (navegador embutido)
