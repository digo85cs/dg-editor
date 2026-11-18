# Adapta ONE + Maestro no DG Editor

A Adapta **não** publica API HTTP aberta (estilo OpenAI) para embutir ONE/Maestro como provider. A integração suportada pelo DG é:

1. **ONE** — contexto via `continuidade.md` (copiar/colar)
2. **Maestro** — conector **MCP** apontando para o server do DG

Painel na UI: **Contas** → seção Adapta (ou Configurações).

## Adapta ONE (Contextos)

1. Use o chat do DG (isso grava o dossiê e regenera continuidade).
2. Em Contas → Adapta → **Copiar continuidade** (ou **Gerar** se ainda não existir).
3. No [Adapta ONE](https://adapta.org/): **+** → **Contextos** → novo contexto `DG Editor` → cole o markdown.
4. Ative o contexto nos prompts sobre o projeto.

Docs: [Dominando Contextos](https://docs.adapta.org/inicio-rapido/dominando-contextos).

Arquivos locais (userData do Electron):

- `…/dossie/dossie.txt`
- `…/dossie/continuidade.md`

O painel Adapta mostra os caminhos absolutos.

## Maestro (MCP do DG)

O Maestro aceita conectores MCP próprios ([docs Maestro](https://docs.adapta.org/inicio-rapido/maestro)).

### 1. Compilar o MCP

Na raiz do repositório `dg-editor`:

```bash
npm run build:mcp
```

Binário esperado:

```text
.dg-editor/bin/main/mcp/server.js
```

### 2. Subir / apontar no Maestro

No painel Adapta do DG, use **Copiar comando MCP**. O JSON é no formato:

```json
{
  "command": "node",
  "args": ["/caminho/absoluto/para/dg-editor/.dg-editor/bin/main/mcp/server.js"],
  "cwd": "/caminho/absoluto/para/dg-editor"
}
```

No Maestro: conector MCP custom → cole `command` / `args` / `cwd` conforme a UI pedir.

Alternativa manual (stdio):

```bash
node .dg-editor/bin/main/mcp/server.js
```

(com `cwd` = raiz do projeto).

### 2b. MCP HTTP permanente (recomendado — já configurado)

O DG expõe um servidor MCP **HTTP** em `127.0.0.1:7331` (`src/main/mcp/http-server.ts`), publicado via Cloudflare Tunnel em:

```text
https://dg-mcp.autopartz.app/mcp
```

No Maestro: **Conectores → Adicionar via URL** → Tipo `http`, URL acima, Token = conteúdo de `%LOCALAPPDATA%\dg-editor\mcp-http-token.txt`.

**Persistência (Windows):**

- `cloudflared` service (auto-start) — túnel `dg-editor-mcp`, conta Cloudflare do `autopartz.app`
- Tarefa agendada `DGEditor-MCP-HTTP` (logon) — roda `scripts/mcp-http-oculto.vbs` → `scripts/mcp-http-iniciar.bat`
- Rebuild após mudanças: `npm run mcp:http` (gera `.dg-editor/bin/main/mcp/http-server.js`)

**23 tools expostas:** `dossie_read`, `dossie_snapshot`, `vault_list`, `vault_read`, `vault_write`, `projeto_arvore`, `codigo_buscar`, `codigo_ler`, `codigo_editar`, `git_status`, `git_diff`, `git_commit`, `git_push`, `terminal_exec`, `testes_rodar`, `projeto_smoke`, `qualidade_checar`, `resultado_avaliar`, `custo_resumo`, `projeto_memoria`, `skills_listar`, `agentes_listar`, `chat_historico`.

Travas de segurança: Bearer token obrigatório; `terminal_exec`/`git_commit`/`git_push` exigem `confirmado=true`; caminhos protegidos (.env, chaves, credenciais) bloqueados; `codigo_editar` roda typecheck e reverte se falhar.

### 3. Pedidos úteis no Maestro

- “Leia o dossiê do DG” → tool `dossie_read`
- “Snapshot do dossiê” → `dossie_snapshot`
- “Liste skills / agentes do projeto”
- Busca de símbolos / edição por âncora (tools MCP do DG)

## Atalhos no Browser embutido

No painel Adapta:

- **Abrir ONE** → site / hub
- **Abrir Maestro** → `https://agent.adapta.one/`

Ou use a aba **Browser** do DG e navegue manualmente.

## Provider `maestro` no Brain (stub)

Não há endpoint HTTP público da Adapta compatível com o registry de providers do DG (`ollama` / `api`). O tipo `maestro` em `shared/types` é **reservado**; não selecione nem implemente chat via HTTP até existir API oficial documentada.

Integração suportada hoje:

| Canal | Como |
|-------|------|
| ONE Contextos | `continuidade.md` (copiar/colar; regenerado após turnos do Agent) |
| Maestro | MCP do DG (`npm run build:mcp` + colar JSON no conector) |

## O que não fazer

- Guardar senha da Adapta no DG
- Scraping / login automatizado no ONE ou Maestro
- Esperar provider `maestro` no Brain sem API oficial da Adapta
- Trocar Ollama/API por “maestro HTTP” inventado

## Referências

- [docs.adapta.org](https://docs.adapta.org/)
- [Integrações ONE](https://docs.adapta.org/inicio-rapido/integracoes)
- MCP interno: `src/main/mcp/server.ts`
- Bridge: `src/main/bridge-adapta.ts`
