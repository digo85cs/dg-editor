# Auditoria completa consolidada

**Data:** 2026-10-26T14:42:13.587Z

## Hashes
- `out/main/index.js`: `596a191eb658d260b091e2bda6b8a142`
- `.dg-editor/bin/main/mcp/server.js`: `441f344c2a79ceddfb227817656179f1`

## Resumo global

| ok | warn | erro |
|---:|---:|---:|
| 33 | 2 | 0 |

## 8 areas

| area | ok | warn | erro |
|---|---:|---:|---:|
| modelos | 2 | 1 | 0 |
| providers | 7 | 0 | 0 |
| skills | 9 | 0 | 0 |
| agentes | 5 | 0 | 0 |
| mcp | 3 | 0 | 0 |
| pipeline | 3 | 0 | 0 |
| build | 2 | 0 | 0 |
| integridade | 2 | 1 | 0 |

## Detalhes

### modelos
- escolherModelo(codigo)=deepseek/deepseek-chat online
- Politica 7b padrao / 14b sob demanda
- 14b pipeline usos=0 (so origin=pipeline)

### providers
- Fila codigo: openrouter:deepseek-chat[ok], openrouter:qwen-2.5-coder-32b[ok], ollama:qwen2.5-coder:7b[ok], ollama:qwen2.5-coder:3b[ok]
- local no fim
- chave presente sim (codigo): openrouter:deepseek-chat,openrouter:qwen-2.5-coder-32b
- Fila raciocinio: openrouter:llama-3.3-70b[ok], ollama:llama3.2[ok], ollama:qwen2.5-coder:14b[ok]
- chave presente sim (raciocinio): openrouter:llama-3.3-70b
- Fila chat: openrouter:gpt-4o-mini[ok], ollama:qwen2.5-coder:1.5b[ok]
- chave presente sim (chat): openrouter:gpt-4o-mini

### skills
- count=8
- arvore-projeto chars=961 gatilho=true proc=true
- debugger chars=1261 gatilho=true proc=true
- documentador chars=1149 gatilho=true proc=true
- editar-seguro chars=1162 gatilho=true proc=true
- leitor-codigo chars=1268 gatilho=true proc=true
- refatorador chars=1268 gatilho=true proc=true
- revisor-seguranca chars=1333 gatilho=true proc=true
- testador chars=1262 gatilho=true proc=true

### agentes
- count=4
- arquiteto esp/sys/skills=true skills=leitor-codigo,refatorador,documentador
- revisor esp/sys/skills=true skills=leitor-codigo,refatorador,testador
- seguranca esp/sys/skills=true skills=revisor-seguranca,leitor-codigo,documentador
- testador esp/sys/skills=true skills=testador,leitor-codigo,debugger

### mcp
- tools=15 dossie_read,dossie_write,dossie_snapshot,vault_list,vault_read,vault_write,projeto_arvore,codigo_buscar,codigo_ler,codigo_editar,skill_listar,skill_ler,agente_listar,agente_invocar,agente_executar
- agente_executar presente
- schemas presentes

### pipeline
- executarAgente acessivel
- agente_executar acessivel
- anti-recursao

### build
- out/main/index.js md5=596a191eb658d260b091e2bda6b8a142
- .dg-editor/bin/main/mcp/server.js md5=441f344c2a79ceddfb227817656179f1

### integridade
- indice simbolos=244
- dossie ausente
- git limpo (working tree clean apos commit final)

## Regressao F3

- editou: true (MAX_ITER 6→7)
- ms: 20930 (limite online 60000)
- provider: openrouter:deepseek-chat
- modelo: deepseek/deepseek-chat
- online: true
- revertido: true

## Chave OpenRouter

- chave presente (env User): sim (valor nunca logado)
- slug `google/gemini-flash-1.5` removido (HTTP 404 no provedor); chat usa `openai/gpt-4o-mini`
- codigo online: `deepseek/deepseek-chat` OK (HTTP 200)
