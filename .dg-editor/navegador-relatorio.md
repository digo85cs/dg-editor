# Navegador embutido — relatório

**Electron:** 33.2.1 · `BaseWindow` + `WebContentsView` · partition `persist:dgnav`  
**Controle:** `127.0.0.1:47821` + `X-DG-Token`

## Validações (ids reais de `smoke.ts`)

| # | O que valida |
|---|---|
| 1 | Janela aberta |
| 2 | `GET /status` example.com |
| 3 | `/ler` texto |
| 4 | `/ler` links (IANA) |
| 5 | `/preencher` httpbin |
| 6 | Sem token → 401 |
| 7 | Painel fechado → 409 |
| 8 | Cookie `persist:dgnav` |
| 9 | `/screenshot` PNG |
| 10 | `/ler` seletor inexistente → `candidatos[]` |
| 11 | `/clicar` seletor/texto inexistentes → `candidatos[]` |
| 12 | Singleton + `isVisible=false` |
| 13 | Download legível + colisão `_1` em `_smoke/` |
| 14 | Paginação tabela |
| 15 | Sanitização path traversal + nome ≤120 |
| 16 | `esperarSeletor` |
| 17 | Iframe + `framesDisponiveis` |
| 18 | Rotação de token (remover → 401; novo ≠ antigo; timingSafeEqual) |
| 19 | Rate limit 429 + Retry-After; `/status` limite separado |
| 20 | Fallback `webContents.debugger` (`tentouDebugger: true`) |
| 21 | `aguardarEstavel` (MutationObserver) → tabela final estável |

Smoke: **21/21 PASS**

## Token (sessão)

- `garantirTokenSessao()`: sempre `randomBytes(32)`, sobrescreve `.dg-editor/nav-token`
- `removerTokenSessao()` no `before-quit` (+ smoke `finally`/`exit`)
- Comparação: `crypto.timingSafeEqual`
- MCP relê o arquivo a cada chamada

## Rate limit

- Janela 60s em memória (`rate-limit.ts`)
- 120 req/min gerais · 600/min em `/status`
- Excesso → `429` + `Retry-After` + `{ motivo:'rate limit', retryAfterSec }`
- `resetarRateLimit()` no início do smoke

## Debugger (iframe)

- `extrairDoFrame`: executeJavaScript → em falha (ou `_forceDebugger` no smoke) → CDP
- `Page.createIsolatedWorld` + `Runtime.evaluate`
- `attach` só sob demanda; `detach` sempre no `finally`
- Nota: iframe `sandbox` sem `allow-same-origin` pode bloquear CDP offline no Electron 33; o caminho de fallback é exercitado com iframe data: normal + `_forceDebugger`

## MutationObserver

- `/ler` aceita `aguardarEstavel` (ms, default 0)
- Com `esperarSeletor`: espera silêncio DOM ou timeout → aviso `dom_ainda_mutando`

## Auditoria de segurança (a–j)

| | item | resultado |
|---|---|---|
| a | bind só `127.0.0.1` | PASS |
| b | token `randomBytes(32)` + rotação por sessão | PASS |
| c | nenhum token 64hex em `src/` | PASS |
| d | nenhum path absoluto de máquina em src/relatório | PASS |
| e | sanitização de download | PASS |
| f | `contextIsolation` / `nodeIntegration:false` / `sandbox` | PASS |
| g | sem localStorage de terceiros | PASS |
| h | cap 200k chars | PASS |
| i | `timingSafeEqual` na comparação de token | PASS |
| j | `debugger.detach` no `finally` (sucesso e erro) | PASS |
