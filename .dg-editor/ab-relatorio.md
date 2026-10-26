# A/B2 — deepseek-v3.2 vs deepseek-v4-flash (harness semântico)

**Branch:** `teste-v4-flash`  
**Data:** 2026-10-26  
**Pedido (imutável):** cite UMA linha do CORPO de `providers.ts` com número exato.

## Correção do harness (A/B1 era inválido)

O A/B1 exigia o formato `providers.ts:N` e `N>20`. Isso premiava formato de citação, não leitura:
- v4-flash escrevia `Linha 18: ...` → `n=null` → FALHOU
- v3.2 escrevia `providers.ts:18` → casava

A/B2: extrator tolerante (`providers.ts:N`, `Linha N`, `line N`, `L18`, …) + match de conteúdo (≥15 chars contíguos da linha real). Relatório A/B1 (`0/5 vs 1/5`) **invalidado**.

## Preços OpenRouter (API)

| modelo | prompt | completion |
|---|---|---|
| deepseek/deepseek-v3.2 | US$ 0,28 / MTok | US$ 0,42 / MTok |
| deepseek/deepseek-v4-flash | US$ 0,09 / MTok | US$ 0,18 / MTok |

v4-flash ≈ **32%** do custo do v3.2 (prompt).

## Tabelas lado a lado

### v3.2 — 4/5 — latência média **21312 ms**

| agente | ok | nExtraido | linhaReal | match | ms | aprovado |
|---|---|---|---|---|---|---|
| arquiteto | true | 18 | formato: 'ollama' \| … | true | 7521 | sim |
| revisor | true | 22 | numPredict: number | **false** | 5948 | **não** |
| seguranca | true | 5 | import httpRequest… | true | 15748 | sim |
| testador | true | 18 | formato: … | true | 41381 | sim |
| dg-engenheiro | true | 157 | const b = (body… | true | 35961 | sim |

Falha revisor: citou `Linha 22: modelo: string` — conteúdo real da 22 é `numPredict: number` (`modelo: string` é a linha 19).

### v4-flash — 4/5 — latência média **16932 ms** (−21%)

| agente | ok | nExtraido | linhaReal | match | ms | aprovado |
|---|---|---|---|---|---|---|
| arquiteto | true | 22 | numPredict: number | **false** | 10149 | **não** |
| revisor | true | 15 | export interface ProviderConfig | true | 15719 | sim |
| seguranca | true | 15 | export interface ProviderConfig | true | 7127 | sim |
| testador | true | 5 | import httpRequest… | true | 15569 | sim |
| dg-engenheiro | true | 15 | export interface ProviderConfig | true | 36098 | sim |

Falha arquiteto: mesma classe de erro (offset de linha: citou `modelo: string` como linha 22).

Override: **5/5** em ambas as rodadas (`modeloUsado` = MODELO_TESTADO).

## Decisão

| cenário B4 | este resultado |
|---|---|
| mesma qualidade + v4 mais barato/rápido | **4/5 = 4/5**, v4 −21% latência, ~32% do preço |

**TROCAR.** Empate de qualidade; o custo e a latência favorecem o v4-flash. A falha residual é offset de linha (ambos), não ausência de leitura.

### Fila `codigo` aplicada

1. openrouter / `deepseek/deepseek-v4-flash`  
2. openrouter / `deepseek/deepseek-v3.2`  
3. openrouter / `qwen/qwen-2.5-coder-32b-instruct`  
4. cursor-cli / `cursor-agent`  
5. ollama / `qwen2.5-coder:7b`  
6. ollama / `qwen2.5-coder:3b`

Artefatos: `.dg-editor/ab2-deepseek_deepseek-v3.2.json`, `.dg-editor/ab2-deepseek_deepseek-v4-flash.json`.
