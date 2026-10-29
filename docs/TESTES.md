# Método de validação

## Smoke do navegador

```bash
DG_NAV_SMOKE=1 npx electron out/main/index.js
```

**DEVE rodar ISOLADO.** Rodar junto com `npm test` (ou outro Electron) costuma gerar **21/22 falso negativo** por contenção (porta/token/cache). Confirmar com **3 execuções isoladas** → esperado `SMOKE=22/22`.

No PowerShell:

```powershell
$env:DG_NAV_SMOKE='1'; npx electron out/main/index.js; Remove-Item Env:DG_NAV_SMOKE
```

Entre rodadas: matar processos `electron` residuais e esperar alguns segundos.

## Suíte completa (ordem)

1. `npm run typecheck`
2. `npm run build`
3. `npm test`
4. `npm run qa:ipc`
5. `npm run qa:e2e`
6. `DG_NAV_SMOKE=1 npx electron out/main/index.js` (**3×, ISOLADO**)
7. `npx electron out/main/index.js` → `[auditoria:boot] ok=52 warn=0 erro=0`

Não há script no `package.json` que dispare smoke em paralelo com a suíte; manter assim.
