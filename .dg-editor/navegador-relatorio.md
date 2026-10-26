# Navegador embutido — relatório

**Branch:** `feat/navegador-embutido`  
**Electron:** 33.2.1 (`BaseWindow` + `WebContentsView`; 28 não tinha a API)

## O que foi criado

| peça | caminho |
|---|---|
| Janela + WebContentsView | `src/main/navegador/janela.ts` |
| Token local | `src/main/navegador/token.ts` → `.dg-editor/nav-token` |
| Servidor de controle | `src/main/navegador/controle.ts` → `127.0.0.1:47821` |
| Smoke | `src/main/navegador/smoke.ts` (`DG_NAV_SMOKE=1`) |
| Cliente MCP | `src/main/mcp/navegador-client.ts` |
| Tools MCP | `navegador_abrir/ler/clicar/preencher/baixar` em `server.ts` |
| Menu | Arquivo / Sistemas → **Navegador** (`Ctrl+Shift+N`) |
| Skill | `navegador-embutido.md` |

## Endpoints (POST JSON, exceto GET `/status`)

Auth obrigatória: header `X-DG-Token` = conteúdo de `.dg-editor/nav-token`.

| método | path | função |
|---|---|---|
| GET | `/status` | `{ aberto, url, titulo, carregando, logado }` |
| POST | `/abrir` | `{ url }` — navega (abre painel se preciso) |
| POST | `/ler` | `{ modo, seletor? }` texto\|tabela\|links\|html (cap 200k) |
| POST | `/clicar` | `{ seletor? , texto? }` |
| POST | `/preencher` | `{ seletor, valor }` (setter nativo + events) |
| POST | `/baixar` | `{ url? , seletor? }` → `.dg-editor/downloads/` |
| POST | `/screenshot` | PNG base64 |

Bind **somente** `127.0.0.1` (abort se for outro host).

## Tools MCP

Chamam o controle via HTTP local; se o app estiver fechado:  
*"navegador do DG Editor não está aberto — abra o painel Navegador no app"*.

## Partition

`persist:dgnav` — cookies/localStorage em disco. Login é **manual** pelo usuário na view.

## Validações (DG_NAV_SMOKE=1)

```
#1 janela aberta                     PASS
#2 GET /status example.com           PASS
#3 navegador_ler texto               PASS
#4 navegador_ler links (IANA)        PASS
#5 preencher input httpbin           PASS
#6 request sem token → 401           PASS
#7 fechar painel → aberto:false/409  PASS
#8 cookie persist:dgnav gravável     PASS
```

`typecheck` 0 · `build:mcp` 0 · `build` 0 · smoke exit 0.

## Como usar

1. Abrir DG Editor → **Arquivo → Navegador…**
2. Logar manualmente no site desejado
3. Agente MCP usa `navegador_ler` / `clicar` / etc. na sessão já autenticada
