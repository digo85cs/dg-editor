# Auditoria de modelos — Fase A

**Data:** 2026-10-26  
**Hash do bundle (`out/main/index.js` MD5):** `3B079143E846ED564737A3729EA86D3D`

## Modelos instalados e velocidade medida (CPU)

| Modelo | tok/s | Load | Papel na politica |
|---|---:|---:|---|
| qwen2.5-coder:1.5b | 35,5 | 2,6s | chat (padrao) |
| qwen2.5-coder:3b | 18,8 | 20,6s | codigo fallback rapido |
| qwen2.5-coder:7b | 7,8 | 35,0s | **codigo padrao** (teto pratico CPU) |
| qwen2.5-coder:14b | 3,8 | 56,0s | codigo/raciocinio com `preferirQualidade` |
| llama3.2 | 9,7 | 18,1s | raciocinio padrao |
| nomic-embed-text | — | — | embeddings (memoria) |

## O que `escolherModelo` retorna

Evidencia (script Node, 2026-10-26):

```
INSTALADOS=["llama3.2:latest","qwen2.5-coder:14b","nomic-embed-text:latest","qwen2.5-coder:7b","qwen2.5-coder:3b","qwen2.5-coder:1.5b"]
TAREFA=chat MODELO=qwen2.5-coder:1.5b
TAREFA=codigo MODELO=qwen2.5-coder:7b
TAREFA=raciocinio MODELO=llama3.2:latest
TAREFA=codigo+preferirQualidade MODELO=qwen2.5-coder:14b
TAREFA=raciocinio+profundo MODELO=qwen2.5-coder:14b
```

## Teste do pipeline (`executarAgente` + `codigo_editar`)

| Campo | Valor |
|---|---|
| Resultado | **PASSOU** |
| Modelo usado | `qwen2.5-coder:7b` |
| Tempo | 214,6 s |
| Tool | `codigo_editar` ancora `const MAX_ITER = 6` → `7` |
| Typecheck | ok (dentro da tool) |
| Revert | `const MAX_ITER = 6` restaurado |

Log:
```
[registry] escolherModelo tarefa=codigo → qwen2.5-coder:7b | codigo: 7b padrao (equilibrio 7.8 tok/s); 3b fallback
[agente] modelo=qwen2.5-coder:7b tarefa=codigo num_predict=1024 timeoutMs=300000
[agente] FALLBACK texto->tool: codigo_editar
```

## Limites por tarefa (`num_predict` / timeout)

| Tarefa | num_predict | timeout |
|---|---:|---:|
| chat | 512 | 120s |
| codigo | 1024 | 300s |
| raciocinio | 2048 | 600s |

Timeout cancela via `AbortController` → `req.destroy()`.

## Auto-auditoria `area: modelos`

```json
{
  "resumo": { "ok": 11, "warn": 0, "erro": 0 },
  "modelos": [
    { "id": "modelos:codigo-instalado", "titulo": "escolherModelo(codigo)=qwen2.5-coder:7b esta instalado" },
    { "id": "modelos:codigo-equilibrio", "titulo": "Politica codigo OK (7b padrao / 14b sob demanda)" },
    { "id": "modelos:14b-usado", "titulo": "14b ja foi selecionado 2x" }
  ]
}
```

## Atualizacao Fase B (2026-10-26)

- Fila hibrida: online OpenRouter → local Ollama
- Contagem 14b agora so selecionadosPipeline (auditoria/teste excluidos)
- Bundle MD5: 71E65C2B6E2BBF5BCE676CB582481364
