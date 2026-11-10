# Provedores de IA — DG Editor

Documentacao do sistema multi-provider com roteador de cota em cascata (Fases 0 a 4).
Todos os textos e mensagens de erro estao em portugues do Brasil (pt-BR).

## Visao geral

O DG Editor agora suporta 28 provedores de IA organizados em 3 tiers:

- **Tier 1 — gratuitos prioritarios**: OpenRouter (modelos :free), Gemini Flash-Lite, Z.AI direto, Groq, Together, Fireworks, Mistral, DeepInfra, Novita, Hyperbolic, SambaNova, Cerebras, NVIDIA NIM, Perplexity, x.AI, Moonshot, Chutes.ai, ArliAI, LiteLLM (gateway local opcional, desativado por padrao).
- **Tier 2 — pago barato**: OpenAI, Anthropic (shim OpenAI, desativado), Gemini pago, DeepSeek, Z.AI pago.
- **Tier 3 — local (piso garantido)**: Ollama local (`qwen2.5-coder:7b`, `qwen2.5-coder:3b`, `llama3.2`).

A fila global e ordenada por `ordem` (menor = preferencia maior). O roteador descende a fila quando um provedor retorna 429 (rate limit) ou 402 (cota/pagamento), marcando o provedor como esgotado por um TTL. Quando todos estao esgotados, o piso e o Ollama local.

## Fila final de provedores

| Ordem | ID | Tier | Base URL | Cota diaria | Fuso reset | Ativo | Modelos |
|------|-----|------|----------|-------------|------------|-------|---------|
| 1 | openrouter-inkling | 1 | https://openrouter.ai/api/v1 | 50 | UTC | sim | thinkingmachines/inkling-2-small:free |
| 2 | openrouter-glm | 1 | https://openrouter.ai/api/v1 | 30 | UTC | sim | z-ai/glm-4.5-air:free |
| 3 | openrouter-north | 1 | https://openrouter.ai/api/v1 | 50 | UTC | sim | cohere/north-mini-code:free |
| 4 | openrouter-kimi | 1 | https://openrouter.ai/api/v1 | 30 | UTC | sim | moonshotai/kimi-k2.6:free |
| 5 | gemini-flash-lite | 1 | https://generativelanguage.googleapis.com/v1beta/openai | 500 | America/Los_Angeles | sim | gemini-3.5-flash-lite, gemini-3.1-flash-lite |
| 6 | zai-direto | 1 | https://api.z.ai/api/paas/v4 | 100 | UTC | sim | glm-4.7-flash, glm-4.5-flash |
| 7 | groq | 1 | https://api.groq.com/openai/v1 | 1000 | UTC | sim | openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.8-27b |
| 8 | together | 1 | https://api.together.xyz/v1 | 40 | UTC | sim | meta-llama/Llama-3.3-70B-Instruct-Turbo |
| 9 | fireworks | 1 | https://api.fireworks.ai/inference/v1 | 40 | UTC | sim | accounts/fireworks/models/llama-v3p3-70b-instruct |
| 10 | mistral | 1 | https://api.mistral.ai/v1 | 40 | UTC | sim | mistral-small-latest |
| 11 | deepinfra | 1 | https://api.deepinfra.com/v1/openai | 40 | UTC | sim | meta-llama/Llama-3.3-70B-Instruct |
| 12 | novita | 1 | https://api.novita.ai/v3/openai | 40 | UTC | sim | meta-llama/llama-3.3-70b-instruct |
| 13 | hyperbolic | 1 | https://api.hyperbolic.xyz/v1 | 40 | UTC | sim | meta-llama/Llama-3.3-70B-Instruct |
| 14 | sambanova | 1 | https://api.sambanova.ai/v1 | 40 | UTC | sim | Meta-Llama-3.3-70B-Instruct |
| 15 | cerebras | 1 | https://api.cerebras.ai/v1 | 40 | UTC | sim | llama3.3-70b |
| 16 | nvidia-nim | 1 | https://integrate.api.nvidia.com/v1 | 40 | UTC | sim | meta/llama-3.3-70b-instruct |
| 17 | perplexity | 1 | https://api.perplexity.ai | 40 | UTC | sim | sonar |
| 18 | xai | 1 | https://api.x.ai/v1 | 40 | UTC | sim | grok-3-mini |
| 19 | moonshot-direto | 1 | https://api.moonshot.ai/v1 | 40 | UTC | sim | kimi-k2-0711-preview |
| 20 | chutes | 1 | https://llm.chutes.ai/v1 | 40 | UTC | sim | deepseek-ai/DeepSeek-V3 |
| 21 | arli | 1 | https://api.arliai.com/v1 | 40 | UTC | sim | llama-3.3-70b |
| 22 | litellm | 1 | http://127.0.0.1:4000/v1 | 0 | UTC | **nao** | gpt-3.5-turbo |
| 23 | openai | 2 | https://api.openai.com/v1 | — | UTC | sim | gpt-5.3-mini |
| 24 | gemini-pago | 2 | https://generativelanguage.googleapis.com/v1beta/openai | — | UTC | sim | gemini-3.8-flash |
| 25 | deepseek | 2 | https://api.deepseek.com/v1 | — | UTC | sim | deepseek-chat |
| 26 | zai-pago | 2 | https://api.z.ai/api/paas/v4 | — | UTC | sim | glm-5.3 |
| 28 | ollama-local | 3 | http://127.0.0.1:11434 | — | UTC | sim | qwen2.5-coder:7b, qwen2.5-coder:3b, llama3.2 |

## Provedores desativados (ativo:false)

- **litellm** (ordem 22): gateway local opcional na porta 4000. So ativar se estiver rodando um LiteLLM local.

Nenhum provedor foi removido por falta de chave: todos permanecem cadastrados. Os que nao tiverem chave configurada sao pulados em tempo de execucao.

## Como cadastrar uma chave de API

As chaves nunca ficam em variavel de ambiente nem em texto plano. Sao gravadas criptografadas no cofre do usuario (`<userData>/providers-keys.bin`) usando `safeStorage` do Electron.

Via UI:
1. Abra o painel **Configuracoes** (botao "Configuracoes" na base do Explorer).
2. Clique em **Provedores IA** (novo botao ao lado de Configuracoes).
3. Na secao **Configurar chaves**, cole a chave no campo de senha do provedor desejado.
4. Marque **Ativo** e clique em **Salvar**. Em seguida clique em **Testar** para validar latencia.

Via IPC:
```
ipc.invoke('providers:configurar', { id: 'groq', chave: 'gsk-...' })
ipc.invoke('providers:testar', { id: 'groq' })
```

Nunca informe o valor da chave em nenhum canal de retorno: a UI so exibe `chaveConfigurada: boolean`.

## Como resetar uma cota

Quando um provedor atinge 429/402, o roteador marca ele como esgotado ate o proximo reset (meia-noite no fuso declarado, ou 24h apos `Retry-After`). Para resetar manualmente:

Via UI: secao **Cotas / esgotamentos** → botao **Resetar** no provedor desejado.
Via IPC:
```
ipc.invoke('providers:resetar', { id: 'groq' })
ipc.invoke('providers:cotas')  // lista cotas ativas
```

## Como estender o catalogo (adicionar um provedor)

1. Abra `src/main/brain/providers-registry.ts`.
2. Inclua uma nova entrada em `CATALOGO_PROVIDERS` usando a funcao `desc(...)`, respeitando o campo `ordem` (menor = mais prioritario).
3. Preencha `tier`, `cotaDiaria` (tier 1 ativo deve ter cota), `fusoReset` quando aplicavel, `capacidades` coerentes (`chat`, `codigo`, `analise`, `raciocinio`).
4. Recompile (`npx tsc --noEmit`) e rode os testes (`npx vitest run`).
5. O provedor aparece automaticamente em `providers:listar`, `providers:fila` e na UI.

Exemplo:
```ts
desc('meu-provedor', 'Meu Provedor', 'openai', 'https://api.meuprovedor.com/v1', {
  apiKeyRef: 'meuprovedor',
  tier: 1,
  cotaDiaria: 60,
  ordem: 29,
  modelos: [{ id: 'modelo-v1', capacidades: ['chat', 'codigo'] }],
})
```

## Politica de TTL (esgotamento)

- **429 / 402**: marca esgotado com motivo `rate_limit`.
- **Retry-After header (429)**: `agora + retryAfterSegundos`, limitado a 24h.
- **fusoReset declarado**: proxima meia-noite naquele fuso IANA (calculado com `Intl.DateTimeFormat`, sem libs externas).
- **Padrao**: proxima meia-noite UTC.
- `modelo_morto`: esgotado por 24h.
- `auth`: esgotado (chave mal configurada).
- `limparExpirados` roda no inicio de `proximoDisponivel` e remove entradas vencidas.

## Canais IPC

| Canal | Direcao | Payload | Retorno |
|-------|---------|---------|---------|
| `providers:listar` | invoke | — | `{ ok, providers: [{id,label,tier,formato,baseUrl,ativo,chaveConfigurada,esgotadoAte,modelos[]}] }` |
| `providers:configurar` | invoke | `{ id, chave?, ativo? }` | `{ ok, erro? }` (chave nunca retornada) |
| `providers:testar` | invoke | `{ id }` | `{ ok, latenciaMs?, erro? }` |
| `providers:cotas` | invoke | — | `{ ok, cotas: [...] }` |
| `providers:resetar` | invoke | `{ id }` | `{ ok }` |
| `providers:fila` | invoke | — | `{ ok, fila: [{ordem,id,tier,modelo,disponivel}] }` |
| `providers:permitir-pago` | invoke | `{ v: boolean }` | `{ ok }` (liga/desliga uso de tier 2 pago) |
| `providers:gasto` | invoke | — | `{ ok, usd, teto?, porProvider: {id: usd}, naoRastreados: string[] }` |
| `providers:cotas` | invoke | — | `{ ok, cotas: [...] }` |
| `providers:resetar` | invoke | `{ id }` | `{ ok }` |
| `brain:cota` | evento (webContents) | — | `{ status: [...] }` (atualizacao ao vivo na UI) |

## Validacao real da fila (`testar:fila`)

O script `scripts/testar-fila.mjs` faz uma chamada de 1 token (`max_tokens: 1`) em cada
provider ativo que tenha chave configurada (via variavel de ambiente `apiKeyEnv`, pois o
cofre de segredos depende do `safeStorage` do Electron e nao esta disponivel em Node puro).

Executa com:
```
npm run testar:fila
npm run testar:fila -- --json   # saida JSON em stdout
```

Estados possíveis na saida:

| Estado | Significado |
|--------|-------------|
| `[OK ] id — 200 — Nms` | Provider respondeu com sucesso (HTTP 200) |
| `[429] id — rate_limit (retry-after: N) — Nms` | Rate limit atingido |
| `[402] id — cota/pagamento (HTTP 402)` | Cota esgotada / pagamento necessario |
| `[AUTH] id — chave invalida (HTTP 401/403)` | Chave de API invalida |
| `[SKIP] id — sem chave` | Nenhuma chave configurada (ni cofre, ni env) |
| `[SKIP] id — desativado` | Provider marcado como `ativo: false` |
| `[FAIL] id — erro de rede` | Falha de rede / timeout / nao alcançavel |

Nunca imprime o valor da chave. Nao grava nada em disco.

## Observabilidade

O roteador emite o evento `brain:cota` apos cada `marcarEsgotado` e apos `limparExpirados` quando houve limpeza. A UI escuta esse canal e atualiza a tabela de cotas ao vivo. Os logs de arquivo (`dg-log.txt`) registram provedor escolhido, tentativas e esgotamentos, sem expor chaves (mascara `primeiros4 + '****'`).

## Provedores descartados

| ID | Motivo da remocao | Alternativa |
|-----|-------------------|-------------|
| `anthropic-openai-shim` | `https://api.anthropic.com/v1` nao e um endpoint OpenAI-compatible. Forcar o formato `openai` criaria dívida, ja que a Anthropic possui SDK proprio e o `chamarProvider` ja suporta caminhos CLI (`cursor-cli`, `codex-cli`). | Usar o SDK oficial da Anthropic separadamente, ou acessar modelos Claude via OpenRouter (ex: `anthropic/claude-3-5-sonnet`) no provider `openrouter-*`. |

## Rastreamento de custo

O roteador de cota (`src/main/brain/roteador-cota.ts`) rastreia o gasto em USD por provider, calculado como:

```
custo = (tokensEntrada / 1_000_000) * preco.entradaPor1M + (tokensSaida / 1_000_000) * preco.saidaPor1M
```

### Como funciona

- Cada provider em `CATALOGO_PROVIDERS` pode ter um campo opcional `preco: { entradaPor1M, saidaPor1M }` em USD por 1 milhão de tokens.
- Quando `registrarCusto(providerId, tokensEntrada, tokensSaida)` é chamado, o custo é acumulado em `gastoHojeUSD` e `gastoPorProvider[providerId]`.
- Se o provider não tem `preco` definido, **nada é acumulado**, o provider entra na lista `naoRastreados` e uma mensagem de log `'custo não rastreado: <providerId>'` é emitida (uma vez por sessão por provider).
- O teto diário (`tetoDiarioUSD`) só dispara para provedores com preço conhecido. Providers sem preço nunca acionam o teto.

### `naoRastreados`

O campo `naoRastreados` no retorno de `gastoHoje()` e `providers:gasto` lista os providerIds que consumiram tokens mas não têm preço configurado. Quando todos os providers usados estão em `naoRastreados`, o valor exibido é `$0,00` mas com aviso de que o rastreamento está incompleto.

### Como adicionar preço a um provider

Edite `src/main/brain/providers-registry.ts` e inclua o campo `preco` na entrada do provider em `CATALOGO_PROVIDERS`:

```ts
desc('openai', 'OpenAI', 'openai', 'https://api.openai.com/v1', {
  apiKeyRef: 'openai',
  tier: 2,
  ordem: 23,
  preco: { entradaPor1M: 1.25, saidaPor1M: 10.00 },
  modelos: [{ id: 'gpt-5.3-mini', capacidades: ['chat', 'codigo', 'analise', 'raciocinio'] }],
})
```

**Regra rígida**: nunca chutar preço. Só inclua `preco` com valor confirmado em fonte oficial (página de pricing do provedor). Providers gratuitos (`:free` no OpenRouter, Gemini Flash-Lite free tier, Z.AI GLM-4.7-Flash/4.5-Flash, Ollama local) recebem `preco: { entradaPor1M: 0, saidaPor1M: 0 }`.

### Preços confirmados (consultado em 10/11/2026)

| id | entradaPor1M | saidaPor1M | fonte | confiança |
|-----|-------------|------------|-------|-----------|
| openrouter-inkling | 0 | 0 | https://openrouter.ai/collections/free-models | confirmado |
| openrouter-glm | 0 | 0 | https://openrouter.ai/collections/free-models | confirmado |
| openrouter-north | 0 | 0 | https://openrouter.ai/collections/free-models | confirmado |
| openrouter-kimi | 0 | 0 | https://openrouter.ai/collections/free-models | confirmado |
| gemini-flash-lite | 0 | 0 | https://ai.google.dev/pricing | confirmado |
| zai-direto | 0 | 0 | https://docs.z.ai/guides/overview/pricing | confirmado |
| ollama-local | 0 | 0 | https://ollama.com | confirmado |

Providers com `preco: undefined` (sem fonte oficial confirmada): `groq`, `together`, `fireworks`, `mistral`, `deepinfra`, `novita`, `hyperbolic`, `sambanova`, `cerebras`, `nvidia-nim`, `perplexity`, `xai`, `moonshot-direto`, `chutes`, `arli`, `litellm`, `openai`, `gemini-pago`, `deepseek`, `zai-pago`.

---

## Testes

- `src/main/brain/__tests__/providers-registry.test.ts` — catálogo, ordem, configParaProvider, registrar/remover, sem duplicatas, cota tier 1.
- `src/main/brain/__tests__/segredos-providers.test.ts` — round-trip cofre, arquivo sem texto plano, fallback env, sem criptografia.
- `src/main/brain/__tests__/roteador-cota.test.ts` — 429/402, cancelled, rede, cap 24h, fuso LA, piso ollama, expirados, arquivo corrompido, guardrail tier 2, teto diario, registrarCusto, migracao v1->v2.
- `src/main/ipc/__tests__/contratos.test.ts` — shapes dos canais providers e nao-exposicao de chave.

Executa com: `npx vitest run`

## Riscos residuais

- Provedores online (ordens 1-27) nao foram validados por chamada real por falta de chave; permanecem cadastrados mas pulados sem chave.
- Endpoints OpenAI-compatible de terceiros podem mudar de formato sem aviso.
- `chamarProvider` continua usando `node:http` nativo (sem lib de retry externa); o retry de rede e controlado pelo roteador (max 2 falhas de rede, 4 de server).
- O teto de gasto só protege providers com `preco` preenchido. Os seguintes providers têm preço conhecido e são protegidos pelo teto: `openrouter-inkling`, `openrouter-glm`, `openrouter-north`, `openrouter-kimi`, `gemini-flash-lite`, `zai-direto`, `ollama-local`. Todos os demais ficam em `naoRastreados` e não contam para o teto — verificar `providers:gasto` (campo `naoRastreados`) antes de confiar no teto.
