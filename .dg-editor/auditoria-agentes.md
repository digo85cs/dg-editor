# Auditoria agentes T3 (pos-fix modelos)

**Data:** 2026-10-26T17:56:44.274Z

| agente | ok | modelo | ms | veredito | trecho |
|---|---|---|---:|---|---|
| arquiteto | true | `deepseek/deepseek-v3.2` | 10087 | APROVADO | providers.ts:2 — * Adapters unificados: Ollama local + OpenAI-compatible (OpenRouter etc) + cursor-cli. |
| dg-engenheiro | true | `deepseek/deepseek-v3.2` | 22137 | APROVADO | providers.ts:5 — import { request as httpRequest, type ClientRequest } from 'http' |
| revisor | true | `deepseek/deepseek-v3.2` | 10000 | APROVADO | providers.ts:1 — /** |
| seguranca | true | `deepseek/deepseek-v3.2` | 9282 | APROVADO | providers.ts:3 — * Nenhuma chave no codigo — so process.env[cfg.apiKeyEnv]. |
| testador | true | `deepseek/deepseek-v3.2` | 15667 | APROVADO | providers.ts:18 — formato: 'ollama' / 'openai' / 'cursor-cli' |

**Aprovados:** 5/5
