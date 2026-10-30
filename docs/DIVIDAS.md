# Dívidas de arquitetura

## Navegador embutido (`src/main/navegador/janela.ts`)

O navegador tem **dois caminhos** intencionais:

| Modo | Host | Quem cobre |
|------|------|------------|
| `DG_NAV_SMOKE=1` | `BaseWindow` oculta (legado) | Smoke 22/22 |
| Produção | `View` host na `BrowserWindow` principal; bounds via IPC `navegador:bounds` | `navegador:embed-status` + e2e `ui.browser.aba` / `ui.browser.embed-status` |

**Mitigação parcial:** e2e sem `DG_NAV_SMOKE` valida `modo === 'embed'` e a aba Browser. O smoke **ainda não** exercita o host View de produção.

**Como fechar de vez:** reescrever os cenários do smoke com host injetável (ex.: View anexada a uma janela de teste) e então remover o branch `BaseWindow`. Só com decisão explícita — não fazer de passagem.

Ver também o cabeçalho de `janela.ts` (`DÍVIDA DE ARQUITETURA — DOIS CAMINHOS`).
