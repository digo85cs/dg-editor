# Auditoria de providers

Historico de failover (sem chaves). Gerado automaticamente pelo agente e pela auditoria.

## Fase G1 — cursor-agent como provider (2026-10-26)

**Decisao: REPROVADO** — cursor-agent indisponivel como provider: exige autenticacao (`agent login` ou `CURSOR_API_KEY`); CLI reporta `Not logged in`; chamada nao-interativa `-p` retorna exit 1 sem texto util.

### Interface CLI (bruta)
- Versao: `2026.10.19-6bbf2c4`
- Binario: `C:\Users\digo8\AppData\Local\cursor-agent\cursor-agent.ps1` (presente)
- Flag prompt: `-p` / `--print` + argumento prompt — **presente**
- Flag JSON: `--output-format text|json|stream-json` — **presente**
- Flag somente leitura: `--mode ask|plan`, `--plan` — **presente**
- Flag modelo: `--model` — **presente**
- Flag workspace: `--workspace` — **presente**

### G1.2 chamada nao-interativa
```
comando: cursor-agent -p "Responda apenas a palavra: ok" --mode ask
exit: 1
stdout: (vazio)
stderr: Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable.
tempo: ~3743 ms (encerrou sozinho)
```

### G1.3 isolamento de escrita
- arquivo `_g1-teste.txt` intacto = **sim** (auth falhou antes de qualquer tool; arquivo apagado apos teste)
- G2 **NAO implementado** (G1 reprovado). cursor-cli **nao** entrou na fila.

## Politica de fila (atual)

### codigo
1. openrouter / deepseek/deepseek-chat (online)
2. openrouter / qwen/qwen-2.5-coder-32b-instruct (online)
3. ollama / qwen2.5-coder:7b (local)
4. ollama / qwen2.5-coder:3b (local)

### raciocinio
1. openrouter / meta-llama/llama-3.3-70b-instruct
2. ollama / llama3.2:latest
3. ollama / qwen2.5-coder:14b

### chat
1. openrouter / openai/gpt-4o-mini (online)
2. ollama / qwen2.5-coder:1.5b (local)

Chave: apenas `OPENROUTER_API_KEY` em variavel de ambiente do usuario.
Nenhuma `CURSOR_API_KEY` no projeto.

## Historico

- 2026-10-26T14:13:51.881Z | tarefa=codigo | tentou=openrouter:deepseek-chat | motivo=chave ausente (OPENROUTER_API_KEY) | resultado=pulado
- 2026-10-26T14:13:51.883Z | tarefa=codigo | tentou=openrouter:qwen-2.5-coder-32b | motivo=chave ausente (OPENROUTER_API_KEY) | resultado=pulado
- 2026-10-26T14:17:26.150Z | tarefa=codigo | tentou=ollama:qwen2.5-coder:7b | motivo=ok modelo=qwen2.5-coder:7b | resultado=ok | 214266ms

## Teste failover sem chave (2026-10-26)

- OPENROUTER_API_KEY: ausente
- Pulados: openrouter:deepseek-chat, openrouter:qwen-2.5-coder-32b (chave ausente)
- Usado: ollama:qwen2.5-coder:7b
- Tempo: 216618 ms
- Tool: codigo_editar MAX_ITER 6→7 (revertido)
- Bundle MD5: 71E65C2B6E2BBF5BCE676CB582481364

- 2026-10-26T14:21:53.550Z | tarefa=codigo | tentou=openrouter:deepseek-chat | motivo=ok modelo=deepseek/deepseek-chat | resultado=ok | 10907ms
- 2026-10-26T14:23:05.044Z | tarefa=codigo | tentou=openrouter:deepseek-chat | motivo=auth: HTTP 401: {"error":{"message":"User not found.","code":401}} | resultado=falhou | 351ms
- 2026-10-26T14:23:05.136Z | tarefa=codigo | tentou=openrouter:qwen-2.5-coder-32b | motivo=auth: HTTP 401: {"error":{"message":"User not found.","code":401}} | resultado=falhou | 91ms
- 2026-10-26T14:24:54.876Z | tarefa=codigo | tentou=ollama:qwen2.5-coder:7b | motivo=ok modelo=qwen2.5-coder:7b | resultado=ok | 109739ms

## Fase C — chave ativa (2026-10-26)

### Presenca da chave
- OPENROUTER_API_KEY na env User: sim (valor nunca logado)

### Pipeline online (MAX_ITER 6→7→revert)
- Provider: openrouter:deepseek-chat / deepseek/deepseek-chat
- Tempo: **15.6 s**
- Local Fase A (referencia): **214.6 s**
- Ganho: ~13.7x mais rapido
- Tool codigo_editar: ok + typecheck ok
- Bundle MD5: 230DE2497F45D2E83EACE9D1BB4DCB25

### Failover forçado (chave invalida temporaria)
- openrouter:deepseek-chat → HTTP 401 auth → falhou
- openrouter:qwen-2.5-coder-32b → HTTP 401 auth → falhou
- ollama:qwen2.5-coder:7b → ok (112.7 s, pergunta simples)
- Chave User restaurada apos o teste

### Comparacao
| Cenario | Provider | Tempo |
|---|---|---:|
| Local (Fase A) | qwen2.5-coder:7b | 214.6 s |
| Online (Fase C) | deepseek/deepseek-chat | 15.6 s |
| Failover auth | 7b local apos 401 | 112.7 s |
- 2026-10-26T14:38:09.274Z | tarefa=chat | tentou=openrouter:gemini-flash-1.5 | motivo=outro: HTTP 404: {"error":{"message":"google/gemini-flash-1.5 is no longer available on OpenRouter: no provider serves this model anymore. See available models at http | resultado=falhou | 366ms
- 2026-10-26T14:38:38.364Z | tarefa=chat | tentou=ollama:qwen2.5-coder:1.5b | motivo=ok modelo=qwen2.5-coder:1.5b | resultado=ok | 29083ms
- 2026-10-26T14:38:41.259Z | tarefa=chat | tentou=openrouter:gemini-flash-1.5 | motivo=outro: HTTP 404: {"error":{"message":"google/gemini-flash-1.5 is no longer available on OpenRouter: no provider serves this model anymore. See available models at http | resultado=falhou | 125ms
- 2026-10-26T14:40:36.167Z | tarefa=codigo | tentou=openrouter:deepseek-chat | motivo=ok modelo=deepseek/deepseek-chat | resultado=ok | 18678ms
- 2026-10-26T16:53:47.792Z | tarefa=codigo | tentou=openrouter:deepseek-chat | motivo=ok modelo=deepseek/deepseek-chat | resultado=ok | 12588ms
- 2026-10-26T16:54:07.974Z | tarefa=codigo | tentou=openrouter:deepseek-chat | motivo=ok modelo=deepseek/deepseek-chat | resultado=ok | 16308ms
- 2026-10-26T16:54:24.457Z | tarefa=codigo | tentou=openrouter:deepseek-chat | motivo=ok modelo=deepseek/deepseek-chat | resultado=ok | 13093ms
- 2026-10-26T16:54:35.879Z | tarefa=codigo | tentou=openrouter:deepseek-chat | motivo=ok modelo=deepseek/deepseek-chat | resultado=ok | 7540ms
- 2026-10-26T16:54:54.136Z | tarefa=codigo | tentou=openrouter:deepseek-chat | motivo=ok modelo=deepseek/deepseek-chat | resultado=ok | 14931ms
- 2026-10-26T16:55:06.989Z | tarefa=codigo | tentou=openrouter:deepseek-chat | motivo=ok modelo=deepseek/deepseek-chat | resultado=ok | 9344ms
- 2026-10-26T16:56:54.777Z | tarefa=codigo | tentou=openrouter:deepseek-chat | motivo=ok modelo=deepseek/deepseek-chat | resultado=ok | 30257ms
