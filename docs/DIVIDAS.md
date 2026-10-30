# Dívidas de arquitetura

## Navegador embutido (`src/main/navegador/janela.ts`)

O navegador tem **dois hosts** intencionais; o **conteúdo** (chrome/content/loadURL) é compartilhado:

| Modo | Host | Quem cobre |
|------|------|------------|
| `DG_NAV_SMOKE=1` | `BaseWindow` oculta (legado) | Smoke 22/22 |
| Produção | `View` host na `BrowserWindow` principal; bounds via IPC `navegador:bounds` | `navegador:embed-status` (`conteudoCompartilhado`) + e2e `ui.browser.*` |

**Mitigação:** `criarViews` + `carregarUrlNasViews` + `layoutInterno` nos dois caminhos. E2e sem `DG_NAV_SMOKE` valida `modo === 'embed'`.

**Ainda aberto:** smoke não anexa o host View de produção. Remover `BaseWindow` exige host injetável — só com decisão explícita.
