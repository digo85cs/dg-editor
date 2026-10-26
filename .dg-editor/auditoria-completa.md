# Auditoria completa consolidada

**Data:** 2026-10-26T16:56:54.993Z

## Hashes
- `out/main/index.js`: `5fdbfdf20e1a1f0653524cecc1e8f078`
- `.dg-editor/bin/main/mcp/server.js`: `441f344c2a79ceddfb227817656179f1`

## Resumo global

| ok | warn | erro |
|---:|---:|---:|
| 32 | 3 | 0 |

## 8 areas

| area | ok | warn | erro |
|---|---:|---:|---:|
| modelos | 2 | 1 | 0 |
| providers | 5 | 0 | 0 |
| skills | 9 | 0 | 0 |
| agentes | 7 | 0 | 0 |
| mcp | 3 | 0 | 0 |
| pipeline | 3 | 0 | 0 |
| build | 2 | 0 | 0 |
| integridade | 1 | 2 | 0 |

## Detalhes

### modelos
- escolherModelo(codigo)=deepseek/deepseek-chat
- Politica 7b padrao / 14b sob demanda
- 14b pipeline usos=0

### providers
- Fila codigo (4): openrouter:deepseek-chat[ok], openrouter:qwen-2.5-coder-32b[ok], ollama:qwen2.5-coder:7b[ok], ollama:qwen2.5-coder:3b[ok]
- local no fim codigo
- Fila raciocinio (3): openrouter:llama-3.3-70b[ok], ollama:llama3.2[ok], ollama:qwen2.5-coder:14b[ok]
- Fila chat (2): openrouter:gpt-4o-mini[ok], ollama:qwen2.5-coder:1.5b[ok]
- cursor-agent G1 REPROVADO (sem auth); bin=presente; fora da fila

### skills
- count=8
- arvore-projeto chars=961
- debugger chars=1261
- documentador chars=1149
- editar-seguro chars=1162
- leitor-codigo chars=1268
- refatorador chars=1268
- revisor-seguranca chars=1333
- testador chars=1262

### agentes
- count=5 arquiteto,dg-engenheiro,revisor,seguranca,testador
- arquiteto ok=true
- dg-engenheiro ok=true
- revisor ok=true
- seguranca ok=true
- testador ok=true
- dg-engenheiro 8 skills ok

### mcp
- tools=15
- agente_executar
- schemas

### pipeline
- executarAgente
- agente_executar MCP
- anti-recursao

### build
- out/main/index.js md5=5fdbfdf20e1a1f0653524cecc1e8f078
- .dg-editor/bin/main/mcp/server.js md5=441f344c2a79ceddfb227817656179f1

### integridade
- indice simbolos=244
- dossie ausente (nao bloqueante)
- git sujo (12)

## G1 cursor-agent

- **REPROVADO**: Authentication required / Not logged in. G2 nao implementado.

## Regressao G5

- ok=true editou=true revertido=true
- ms=32682 limite=60000 provider=openrouter:deepseek-chat modelo=deepseek/deepseek-chat

## G4 agentes

- aprovados=5/5
