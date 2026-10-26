# Auditoria completa consolidada

**Data:** 2026-10-26T17:28:44.542Z

## Hashes
- `out/main/index.js`: `e29ec7cd20e009913e8f78d07ebc4677`
- `.dg-editor/bin/main/mcp/server.js`: `24fe5477c955161d9f5904fd6d67f829`

## Resumo

| ok | warn | erro |
|---:|---:|---:|
| 15 | 0 | 0 |

## 8 areas

| area | ok | warn | erro |
|---|---:|---:|---:|
| modelos | 1 | 0 | 0 |
| providers | 4 | 0 | 0 |
| skills | 1 | 0 | 0 |
| agentes | 1 | 0 | 0 |
| mcp | 2 | 0 | 0 |
| pipeline | 1 | 0 | 0 |
| build | 2 | 0 | 0 |
| integridade | 3 | 0 | 0 |

## Extras H

- G1/H2 cursor-cli: APROVADO (ask-only, fallback posicao 3 codigo)
- Failover: openrouter 401×2 → cursor-cli ok (43725ms, texto=fallback-ok)
- Regressao: {"ok":true,"editou":true,"revertido":true,"ms":34585,"provider":"openrouter:deepseek-chat","modelo":"deepseek/deepseek-chat","tentativas":[{"provider":"openrouter:deepseek-chat","resultado":"ok"}]}
- H4 aprovados: 4/5
- dg-config: github.token removido; usa GITHUB_TOKEN env

### modelos
- raiz=D:\CURSOR\DG Editor fonte=env:DG_ROOT

### providers
- codigo(5): openrouter:deepseek-chat=true, openrouter:qwen-2.5-coder-32b=true, cursor-cli:cursor-agent=true, ollama:qwen2.5-coder:7b=true, ollama:qwen2.5-coder:3b=true
- chat(4): ollama:qwen2.5-coder:1.5b=true, ollama:qwen2.5-coder:3b=true, openrouter:deepseek-chat=true, cursor-cli:cursor-agent=true
- revisao(3): openrouter:deepseek-chat=true, cursor-cli:cursor-agent=true, ollama:qwen2.5-coder:7b=true
- cursor-cli disponivel na fila codigo

### skills
- skills=8

### agentes
- agentes=5 arquiteto,dg-engenheiro,revisor,seguranca,testador

### mcp
- agente_executar
- usa resolverRaizProjeto

### pipeline
- anti-recursao + cursor-cli ask-only

### build
- out/main/index.js md5=e29ec7cd20e009913e8f78d07ebc4677
- .dg-editor/bin/main/mcp/server.js md5=24fe5477c955161d9f5904fd6d67f829

### integridade
- dg-config sem ghp_ token
- .env.example presente
- H1 raiz deterministica ativa

