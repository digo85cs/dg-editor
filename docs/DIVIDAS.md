# Dívidas de arquitetura

## Navegador embutido (`src/main/navegador/janela.ts`)

O navegador tem **dois hosts** intencionais; o **conteúdo** (chrome/content/loadURL) é compartilhado:

| Modo | Host | Quem cobre |
|------|------|------------|
| `DG_NAV_SMOKE=1` (sem EMBED) | `BaseWindow` oculta (legado) | Smoke 22/22 clássico |
| `DG_NAV_SMOKE=1` + `DG_NAV_SMOKE_EMBED=1` | `View` host na `BrowserWindow` pai injetada | Smoke no caminho **embed** (produção) |
| Produção | `View` host na `BrowserWindow` principal; bounds via IPC `navegador:bounds` | `navegador:embed-status` (`conteudoCompartilhado`) + e2e `ui.browser.*` |

**Mitigação:** `criarViews` + `carregarUrlNasViews` + `layoutInterno` nos dois caminhos. E2e sem `DG_NAV_SMOKE` valida `modo === 'embed'`.

**Validação local:**

```bash
# clássico (BaseWindow) — gate oficial 22/22
DG_NAV_SMOKE=1 DG_QA_E2E=1 npx electron out/main/index.js --no-sandbox --disable-gpu

# embed (View de produção) — também 22/22
DG_NAV_SMOKE=1 DG_NAV_SMOKE_EMBED=1 DG_QA_E2E=1 npx electron out/main/index.js --no-sandbox --disable-gpu
```

(`DG_QA_E2E=1` evita o keeper Ollama competir com o smoke neste ambiente.)

**Gate oficial (2026-11):** smoke embed e BaseWindow em `SMOKE=22/22` (screenshot com fallback CDP se capturePage sem surface).


## Automacao (dispatch)

Implementado e integrado:
- `windows.*`, `dg-editor`, **Office COM** (`office-com.ts`), **Browser Bloco 3** + **CDP 9222** (`browser-cdp.ts`)
- IPC: `automation:listar` / `automation:executar` / `automation:aprovacao-resolver` + UI `automation-aprovacao.js`
- MCP: `automacao_listar` / `automacao_executar` (browser → `navegador_*` Bloco 3)

## ProductName no .exe

`signAndEditExecutable` permanece `false` (symlink winCodeSign). `afterPack` → `scripts/afterPack-rcedit.cjs` (resedit/pe-library) grava ProductName/FileDescription = DG Editor.

## Modularizacao renderer

`app.js` orquestra; módulos: `features/ui/tema.js`, `features/chat/reeditar.js`, `features/layout/browser-bloco3.js`. Refator adicional continua sem urgência.
