# Auditoria de providers

Historico de failover (sem chaves). Gerado automaticamente pelo agente e pela auditoria.

## Politica de fila (Fase B)

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
1. openrouter / google/gemini-flash-1.5
2. ollama / qwen2.5-coder:1.5b

Chave: apenas `OPENROUTER_API_KEY` em variavel de ambiente do usuario.

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
