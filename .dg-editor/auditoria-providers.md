# Auditoria de providers

Historico de failover (sem chaves). Gerado automaticamente pelo agente e pela auditoria.

## Fase H2 — cursor-cli APROVADO (2026-10-26)

**Decisao G1 revalidada: APROVADO** (login presente: `Logged in as digo85cs@gmail.com`).

### H2.1
```
cursor-agent -p "Responda apenas a palavra: ok" --mode ask --trust
exit: 0
stdout: ok
tempo: ~16274 ms
version: 2026.10.19-6bbf2c4
```

### H2.2 leitura de workspace
```
pedido: linhas de src/main/brain/providers.ts
resposta CLI: 398
Get-Content Count: 397 (diff = newline final)
git status codigo: apenas mudancas da sessao H (CLI nao editou projeto)
```

### Adapter
- formato `cursor-cli`, modo **ask** fixo (somente leitura)
- binario: `cursor-agent.ps1` via powershell -File (evita EINVAL do .cmd)
- timeoutMs: 180000
- disponivel: binario + status H2.1 (`.dg-editor/cursor-cli-status.json` ou `DG_CURSOR_CLI_OK=1`)

### Chamada isolada
```
texto: pong
modeloUsado: cursor-agent
ms: ~15414
```

### Fila codigo (5)
1. openrouter:deepseek-chat [online]
2. openrouter:qwen-2.5-coder-32b [online]
3. cursor-cli:cursor-agent [cli ask]
4. ollama:qwen2.5-coder:7b [local]
5. ollama:qwen2.5-coder:3b [local]

### Fila chat (4) — local primeiro (economia)
1. ollama:qwen2.5-coder:1.5b
2. ollama:qwen2.5-coder:3b
3. openrouter:deepseek-chat
4. cursor-cli:cursor-agent

### Fila revisao (3)
1. openrouter:deepseek-chat
2. cursor-cli:cursor-agent
3. ollama:qwen2.5-coder:7b

### Custo OpenRouter (nota)
- `deepseek/deepseek-chat`: tipicamente barato/free-tier no OpenRouter (verificar pricing atual no site; nao logamos chaves).
- `qwen/qwen-2.5-coder-32b-instruct`: pode ser pago conforme provedor — preferir como 2a posicao, nao chat.
- Chat local 1.5b: **zero custo**, ~35 tok/s.

### Failover real (H5.7)
```
OPENROUTER_API_KEY invalida no processo
1. openrouter:deepseek-chat → auth HTTP 401
2. openrouter:qwen-2.5-coder-32b → auth HTTP 401
3. cursor-cli:cursor-agent → ok (texto: fallback-ok)
ms: ~43725
modelo: cursor-agent
```

## Fase G1 (historico) — REPROVADO na epoca por falta de login

Ver secao H2 acima para estado atual.

## Fase H1 — raiz deterministica

- `resolverRaizProjeto()`: env DG_ROOT → `.dg-root` → subida package.json+.dg-editor → cwd
- `codigo_ler` aceita caminho de arquivo (ex: `src/main/brain/providers.ts`)
- Gate: `node scripts/teste-raiz.mjs` PASS (providers.ts lido, filaDeModelos hit)

## Segredos (H3)

- `dg-config.json`: chave `github.token` **removida**; agora `{ "tokenEnv": "GITHUB_TOKEN" }`
- arquivo no `.gitignore` (nunca trackeado: `git ls-files dg-config.json` vazio)
- `git log --all -p -- dg-config.json | ghp_`: **sem ocorrencias** (token nao commitado)
- **Acao humana obrigatoria**: revogar o token `ghp_...` em https://github.com/settings/tokens (foi colado em chat)

## Historico recente

- 2026-10-26 failover H5.7: openrouter 401 → cursor-cli ok (43725 ms)
- 2026-10-26T17:54:54.309Z | tarefa=codigo | tentou=openrouter:deepseek-v3.2 | motivo=ok modelo=deepseek/deepseek-v3.2 | resultado=ok | 3341ms
- 2026-10-26T17:55:34.119Z | tarefa=codigo | tentou=openrouter:deepseek-v3.2 | motivo=ok modelo=deepseek/deepseek-v3.2 | resultado=ok | 7018ms
- 2026-10-26T17:55:58.804Z | tarefa=codigo | tentou=openrouter:deepseek-v3.2 | motivo=ok modelo=deepseek/deepseek-v3.2 | resultado=ok | 20803ms
- 2026-10-26T17:56:12.033Z | tarefa=codigo | tentou=openrouter:deepseek-v3.2 | motivo=ok modelo=deepseek/deepseek-v3.2 | resultado=ok | 8209ms
- 2026-10-26T17:56:23.881Z | tarefa=codigo | tentou=openrouter:deepseek-v3.2 | motivo=ok modelo=deepseek/deepseek-v3.2 | resultado=ok | 7861ms
- 2026-10-26T17:56:42.222Z | tarefa=codigo | tentou=openrouter:deepseek-v3.2 | motivo=ok modelo=deepseek/deepseek-v3.2 | resultado=ok | 13742ms

## Fix modelos mortos + disponivel honesto (2026-10-26)

- deepseek/deepseek-chat ? deepseek/deepseek-v3.2 (codigo/chat/revisao)
- qwen/qwen-2.5-coder-32b-instruct: ainda valido (HTTP 200)
- disponivel() agora retorna ok|sem-chave|modelo-invalido|indisponivel + catalogo OpenRouter TTL 10min
- failover modelo_morto (404/410) avanca na fila (max 5 saltos)
- Custo estimado OpenRouter (/1M tokens): deepseek-v3.2 prompt~$0.28 completion~$0.42; qwen-2.5-coder-32b prompt~$0.66 completion~$1.00 (valores da API pricing; podem mudar)

