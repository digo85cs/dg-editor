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

## O que não fazer

- Guardar senha da Adapta no DG
- Scraping / login automatizado no ONE ou Maestro
- Esperar provider `maestro` no Brain sem API oficial da Adapta

## Referências

- [docs.adapta.org](https://docs.adapta.org/)
- [Integrações ONE](https://docs.adapta.org/inicio-rapido/integracoes)
- MCP interno: `src/main/mcp/server.ts`
- Bridge: `src/main/bridge-adapta.ts`
