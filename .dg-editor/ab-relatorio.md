# A/B deepseek-v3.2 vs deepseek-v4-flash

**Branch:** `teste-v4-flash`  
**Data:** 2026-10-26  
**Base:** `45b602c`

## A1 — Validação prévia

| check | resultado |
|---|---|
| `deepseek/deepseek-v4-flash` chat | HTTP 200, id aceito `deepseek/deepseek-v4-flash` |
| quirk | modelo usa *reasoning tokens*; com `max_tokens=10/32` o `content` vem `null` (`finish=length`). Com ≥128 tokens responde `ok`. |
| pricing v3.2 | prompt **$0.28**/1M · completion **$0.42**/1M |
| pricing v4-flash | prompt **$0.091**/1M · completion **$0.182**/1M |
| ratio prompt v4/v3 | **0.325** (< 0.5) → A/B **vale** por preço |

## A2 — Harness

- Script: `scripts/ab-modelos.mjs`
- `invocarAgente` **não** força OpenRouter (só Ollama) → harness usa `executarAgente({ modeloForcado })`
- Override online corrigido em `agent.ts` (antes forçava formato ollama e invalidava o A/B)
- PEDIDO idêntico nas duas rodadas
- `modeloUsado` bateu com `MODELO_TESTADO` em **10/10** chamadas (`overrideOk=true`)

## Tabelas (critério N > 20 + `providers.ts:N`)

### Baseline — deepseek/deepseek-v3.2

| agente | ok | modelo | ms | N | veredito |
|---|---|---|---:|---:|---|
| arquiteto | true | v3.2 | 11567 | 18 | FALHOU (N≤20) |
| revisor | true | v3.2 | 6640 | 18 | FALHOU (N≤20) |
| seguranca | true | v3.2 | 15163 | 5 | FALHOU (N≤20) |
| testador | true | v3.2 | 55201 | 156 | **APROVADO** |
| dg-engenheiro | true | v3.2 | 46379 | 18 | FALHOU (N≤20) |

**1/5 aprovados** · tempo médio ≈ 27.0 s

### Candidato — deepseek/deepseek-v4-flash

| agente | ok | modelo | ms | N | veredito |
|---|---|---|---:|---:|---|
| arquiteto | true | v4-flash | 7168 | — | FALHOU (sem `providers.ts:N`; citou "Linha 10") |
| revisor | true | v4-flash | 12577 | — | FALHOU (sem `providers.ts:N`; "Linha 18") |
| seguranca | true | v4-flash | 33931 | — | FALHOU (dump da tool, sem cite) |
| testador | true | v4-flash | 10626 | — | FALHOU (sem `providers.ts:N`; "Linha 18") |
| dg-engenheiro | true | v4-flash | 7827 | — | FALHOU (sem `providers.ts:N`; "Linha 6") |

**0/5 aprovados** · tempo médio ≈ 14.4 s (mais rápido, mas fora do formato de cite)

## A3 — Decisão

| cenário aplicável | decisão |
|---|---|
| v4 ≤ 3/5 | **NÃO TROCAR** |

Justificativa numérica:
- v4-flash: **0/5** no critério qualitativo (abaixo de 4)
- v3.2 baseline com o **mesmo** critério: só **1/5** → o limiar `N > 20` reprova o modelo em produção, não só o candidato
- Preço favorece v4 (~3× mais barato no prompt), mas qualidade de cite no formato exigido é pior
- Tempo: v4 mais rápido (~14s vs ~27s médios), insuficiente para trocar com 0/5

**Fila `codigo` permanece:** v3.2 → qwen-32b → cursor-cli → ollama 7b → ollama 3b

## A4 — Aplicação

- Fila **não** alterada
- Mantidos nesta branch: harness `scripts/ab-modelos.mjs`, fix de `modeloForcado` online, logs JSON em `.dg-editor/ab-*.json`

## Pendente (para o dono)

Ajustar limiar do critério (b): com `N > 20`, o A/B mede dificuldade da tarefa, não diferença de modelo. Sugestões possíveis: `N >= 5`, ou aceitar `Linha N` + trecho do corpo, ou exigir símbolo/função nomeada em vez de número arbitrário.
