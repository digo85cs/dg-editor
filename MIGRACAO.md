# Migração DG Editor (OneDrive -> local)

## Status (final — 2026-11-09)
- **Caminho definitivo:** `C:\dev\DGEditor` (sem espaço; preferido para `node-gyp`/node-pty)
- **Origem preservada (não alterada):** `C:\Users\digo8\OneDrive\CURSOR\DG Editor`
- **Backup intermediário preservado:** `C:\dev\DG Editor` (com espaço) — manter até validação visual; **não apagar sem confirmação**
- **Branch:** `checkpoint/antes-da-migracao-2026-11-06`
- **Excluído na cópia inicial:** `node_modules/`, `out/` (regerados em `C:\dev\DGEditor`)
- **`.git/`** copiado (histórico preservado). `git fsck --no-dangling` executado em `C:\dev\DGEditor` sem erros reportados.
- **Ambiente (validado em `C:\dev\DGEditor`):** `npm run verificar:encoding` **0** (250 arquivos), `npx tsc --noEmit` **0**, `npx vitest run` **46 passed / 11 files**, `npx electron-vite build` **EXIT 0** (avisos Rollup `external`/`ModuleLoader.handleInvalidResolvedId` recorrentes, não fatais).
- **Binários:** `node_modules/electron/dist/electron.exe` **presente** (Electron **33.2.1**, `dist/version` = `33.2.1`; FileVersion `33.2.1`. *Nota: `electron.exe --version` pode imprimir versão do Node interno — usar `dist/version` como referência autoritativa.*) `node_modules/node-pty/build/Release/pty.node` **presente** (307712 bytes, compilado 2026-11-09).

## VS Build Tools (node-pty)
- **Detectado (vswhere, `VC.Tools.x86.x64`):** `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools`
- Python: `3.12.10` (`py` pode reportar outra versão instalada).
- Comando winget (referência, usado/fornecido para instalação):
  ```powershell
  winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" --accept-package-agreements --accept-source-agreements
  ```
- Rebuild: `npm run rebuild:pty` → **ok** (`✔ Rebuild Complete`) em `C:\dev\DGEditor` (caminho sem espaço).

## Checklist (trabalho local)
1. Abrir o projeto em `C:\dev\DGEditor` (não OneDrive, não `C:\dev\DG Editor`).
2. Para reconstruir do zero:
   ```powershell
   cd "C:\dev\DGEditor"
   npm install
   npm install-scripts approve electron
   npm install-scripts approve esbuild
   npm run rebuild:pty
   npm run verificar:encoding
   npx tsc --noEmit
   npx vitest run
   npm run build
   ```
3. Rodar o app **apenas quando decidir validar manualmente**.
4. Após **7 dias** sem problemas (e validação visual), considerar remover `C:\dev\DG Editor` (backup intermediário). Após **30 dias**, considerar arquivar/remover a origem OneDrive.

## Reversão
- Origem OneDrive: `C:\Users\digo8\OneDrive\CURSOR\DG Editor`
- Backup intermediário: `C:\dev\DG Editor`
- Para reverter: abrir/trabalhar na origem/backup desejado.

## Restauração de ambiente pós-migração

### 1. npm install-scripts (allowScripts)
Após `npm install`, autorizar explicitamente:
```powershell
npm install-scripts approve electron
npm install-scripts approve esbuild
npm install-scripts ls
```
Sem isso, `node_modules/electron/dist/electron.exe` **não** é baixado e `npx electron-vite dev`/build pode falhar com "electron nao encontrado". A allowlist é sensível à versão; ao mudar a versão do Electron, aprove a nova versão.

### 2. Versão do Electron (33.2.1, `--save-exact`)
Fixar com `--save-exact` para evitar drift (allowlist por versão).
```powershell
npm install electron@33.2.1 --foreground-scripts --save-exact
```
Se o download falhar, tentar mirror:
```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
npm install electron@33.2.1 --foreground-scripts --save-exact
Remove-Item Env:\ELECTRON_MIRROR
```
**Fallback robusto (bug observado: `install.js`/extract não deixa `dist/electron.exe` completo; zip fica no cache):**
```powershell
$zip = (Get-ChildItem "$env:LOCALAPPDATA\electron\Cache" -Filter "*electron-v33.2.1-win32-x64.zip" -Recurse | Select-Object -First 1).FullName
Remove-Item -Recurse -Force .\node_modules\electron\dist -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path .\node_modules\electron\dist -Force | Out-Null
Expand-Archive -LiteralPath $zip -DestinationPath .\node_modules\electron\dist -Force
Set-Content -Path .\node_modules\electron\path.txt -Value "electron.exe" -NoNewline -Encoding ascii
Test-Path .\node_modules\electron\dist\electron.exe
Get-Content .\node_modules\electron\dist\version  # 33.2.1
```

### 3. node-pty (terminal)
Requer **Visual Studio Build Tools 2022** com workload **"Desktop development with C++"** (`VC.Tools.x86.x64`) e Python no PATH. Sem isso, `npm run rebuild:pty` falha e o painel **TERMINAL** não funciona (resto do app pode funcionar).
```powershell
npm run rebuild:pty
Test-Path .\node_modules\node-pty\build\Release\pty.node  # True
```

### 4. Caminho com espaço
Caminhos com espaço (ex.: `C:\dev\DG Editor`) podem quebrar `node-gyp`/toolchains nativas (`nodejs/node-gyp#65`). `scripts/rebuild-node-pty.cjs` foi endurecido contra parsing de shell, mas a compilação nativa ainda pode falhar. **Usar `C:\dev\DGEditor` (sem espaço).**

## Notas
- Não reativar tarefas de limpeza/auto-commit desativadas.
- Dados de runtime do app (ex.: `%APPDATA%\DG Editor\config\regras-gerais.json`) **não** fazem parte do repositório.
- `src/renderer/app.js.bak-block6` mantido como backup até validação visual do Block 6.
- `package-lock.json` commitado para reprodutibilidade.
