# Navegador embutido — relatório

**Branch:** `feat/navegador-embutido`  
**Electron:** 33.2.1 (`BaseWindow` + `WebContentsView`)

## Peças

| peça | caminho |
|---|---|
| Janela singleton | `src/main/navegador/janela.ts` |
| Controle HTTP | `127.0.0.1:47821` + `X-DG-Token` |
| Downloads | sempre `.dg-editor/downloads/<timestamp>-<nome>` |
| Tools MCP | `navegador_abrir/ler/clicar/preencher/baixar` |

## `/ler` com paginação

Body: `{ modo, seletor?, offset?, limit? }`

| modo | offset/limit | default limit |
|---|---|---|
| `texto` / `html` | caracteres | 50000 |
| `tabela` | linhas | 500 |
| `links` | itens | todos |

Resposta sempre inclui `truncado` e `proximoOffset`. Cap duro 200k chars.  
Tabela: cada item em `tabelas[]` é `{ totalLinhas, offset, limit, linhas }`.

## Validações (DG_NAV_SMOKE=1)

```
#1  janela aberta                              PASS
#2  GET /status example.com                    PASS
#3  navegador_ler texto                        PASS
#4  navegador_ler links (IANA)                 PASS
#5  preencher input httpbin                    PASS
#6  request sem token → 401                    PASS
#7  fechar painel → aberto:false/409           PASS
#8  cookie persist:dgnav                       PASS
#9  /screenshot PNG                            PASS
#10 /ler seletor inexistente → candidatos      PASS
#11 /clicar seletor+texto → candidatos         PASS
#12 singleton 2× criar, isVisible=false        PASS
#13 download real em .dg-editor/downloads/     PASS
#14 paginação /ler tabela (offset/limit)       PASS
```

`typecheck` 0 · `build:mcp` 0 · `build` 0 · smoke **14/14** PASS.

## Singleton / show

- Menu/IPC: `{ mostrar: true }` + `.dg-editor/nav-ultima-url`
- MCP/controle/smoke: `{ mostrar: false }`
- `.gitignore`: `nav-token`, `nav-ultima-url`, `downloads/` (uma vez cada)
