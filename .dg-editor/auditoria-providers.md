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

