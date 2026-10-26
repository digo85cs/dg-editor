# Navegador embutido — relatório

**Branch:** `main`  
**Electron:** 33.2.1 · `BaseWindow` + `WebContentsView` · partition `persist:dgnav`  
**Controle:** `127.0.0.1:47821` + header `X-DG-Token`

## Validações (ids reais de `smoke.ts`)

| # | O que valida |
|---|---|
| 1 | Janela aberta (`estadoAtual().aberto`) |
| 2 | `GET /status` em example.com |
| 3 | `/ler` modo texto |
| 4 | `/ler` modo links (IANA) |
| 5 | `/preencher` em httpbin forms |
| 6 | Request sem token → 401 |
| 7 | Painel fechado → `aberto:false` + 409 |
| 8 | Cookie `persist:dgnav` gravável |
| 9 | `/screenshot` PNG base64 |
| 10 | `/ler` seletor inexistente → `candidatos[]` |
| 11 | `/clicar` seletor+texto inexistentes → `candidatos[]` |
| 12 | Singleton: 2× `criar` = mesma instância, `isVisible=false` |
| 13 | Download real em `downloads/_smoke/`, nome legível, colisão `_1` |
| 14 | Paginação `/ler` tabela (`offset`/`limit`/`proximoOffset`) |
| 15 | Sanitização path traversal + nome ≤120 chars |
| 16 | `esperarSeletor` em `/abrir` e `/ler` |
| 17 | Iframe: host sem tabela + `framesDisponiveis` + `/ler` com `frame` |

Smoke: **17/17 PASS** · `typecheck` 0 · `build:mcp` 0 · `build` 0

## Download

- Sempre em `.dg-editor/downloads/` (smoke → `downloads/_smoke/`, removida ao final)
- Nome legível (`relatorio.pdf`); colisão → `relatorio_1.pdf`
- `sanitizarNomeArquivo`: remove `/ \ ..`, chars Windows inválidos, reservados; valida `resolve` dentro do dir
- Retorno: `{ ok, caminho, bytes, nomeOriginal, nomeSalvo, renomeado }`

## SPA / iframes

- `/abrir` e `/ler`: `esperarSeletor`, `esperarTimeoutMs` (default 10000)
- `/ler` e `/clicar`: `frame` (índice ou substring de URL)
- Conteúdo vazio no host → `aviso` + `framesDisponiveis`

## Isolamento smoke

- `DG_NAV_SMOKE=1` → `nav-ultima-url.smoke` (não toca `nav-ultima-url`)
- Downloads de teste só em `downloads/_smoke/` (apagada no `finally`)

## Auditoria de segurança

| item | resultado |
|---|---|
| a) bind só `127.0.0.1` (nunca `0.0.0.0`) | PASS |
| b) token 64 hex via `randomBytes(32)`, arquivo em `.dg-editor/nav-token` + gitignore | PASS |
| c) nenhum token 64hex hardcoded em `src/` | PASS |
| d) nenhum caminho absoluto de máquina em `src/`/relatório | PASS |
| e) sanitização de nome de download + path traversal | PASS |
| f) `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true` | PASS |
| g) sem `executeJavaScript` lendo localStorage de terceiros | PASS |
| h) cap 200k chars nas extrações | PASS |

## Tools MCP

`navegador_abrir` · `navegador_ler` · `navegador_clicar` · `navegador_preencher` · `navegador_baixar`  
(params: `esperarSeletor`, `frame`, `offset`, `limit`)
