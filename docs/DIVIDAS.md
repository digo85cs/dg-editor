# Dívidas de arquitetura

## Navegador embutido (`src/main/navegador/janela.ts`)

O navegador tem **dois caminhos** intencionais:

| Modo | Host | Quem cobre |
|------|------|------------|
| `DG_NAV_SMOKE=1` | `BaseWindow` oculta (legado) | Smoke 22/22 |
| Produção | `View` host na `BrowserWindow` principal; bounds via IPC `navegador:bounds` | Uso manual / e2e parcial |

**Risco:** o smoke **não** exercita o embed de produção. Uma regressão na aba Browser pode passar no smoke.

**Como fechar:** reescrever os cenários do smoke com host injetável (ex.: View anexada a uma janela de teste) e então remover o branch `BaseWindow`. Só com decisão explícita — não fazer de passagem.

Ver também o cabeçalho de `janela.ts` (`DÍVIDA DE ARQUITETURA — DOIS CAMINHOS`).
