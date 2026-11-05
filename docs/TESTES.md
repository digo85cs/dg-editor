# Método de validação

## Smoke do navegador

**Clássico** (host `BaseWindow` legado — gate histórico):

```bash
DG_NAV_SMOKE=1 DG_QA_E2E=1 npx electron out/main/index.js --no-sandbox --disable-gpu
```

**Embed** (host View de produção):

```bash
DG_NAV_SMOKE=1 DG_NAV_SMOKE_EMBED=1 DG_QA_E2E=1 npx electron out/main/index.js --no-sandbox --disable-gpu
```

(`DG_QA_E2E=1` evita o keeper Ollama competir com o smoke.)

**DEVE rodar ISOLADO.** Rodar junto com `npm test` (ou outro Electron) costuma gerar **21/22 falso negativo** por contenção (porta/token/cache). Confirmar com **3 execuções isoladas** → esperado `SMOKE=22/22` em **cada** modo.

No PowerShell (clássico):

```powershell
$env:DG_NAV_SMOKE='1'; $env:DG_QA_E2E='1'; npx electron out/main/index.js --no-sandbox --disable-gpu; Remove-Item Env:DG_NAV_SMOKE, Env:DG_QA_E2E
```

Entre rodadas: matar processos `electron` residuais e esperar alguns segundos.

## Suíte completa (ordem)

1. `npm run typecheck`
2. `npm run build`
3. `npm test`
4. `npm run qa:ipc`
5. `npm run qa:e2e` (inclui Agent Plan/Parar/Undo + Browser embed-status)
6. Smoke clássico (**3×, ISOLADO**) → `SMOKE=22/22`
7. Smoke embed (**1×, ISOLADO**) → `SMOKE=22/22`
8. `npx electron out/main/index.js` → `[auditoria:boot] ok=52 warn=0 erro=0`

Não há script no `package.json` que dispare smoke em paralelo com a suíte; manter assim.
