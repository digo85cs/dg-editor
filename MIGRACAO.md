# Migração DG Editor (OneDrive -> local)

## Status
- **Cópia preparada:** `C:\dev\DG Editor`
- **Origem preservada (não alterada):** `C:\Users\digo8\OneDrive\CURSOR\DG Editor`
- **Excluído da cópia:** `node_modules/`, `out/` (regerar localmente)
- **Incluído:** `.git/` (histórico), código-fonte, config do projeto
- **Tamanho copiado (excl. node_modules/out):** ~20,6 MB
- **Integridade git:** `git -C "C:\dev\DG Editor" fsck --no-reflogs` executado; sem erros fatais (apenas commits/blobs *dangling* preexistentes, comuns em repositórios ativos)

## Checklist (faça você)
1. Feche editores/terminais abertos na pasta OneDrive `DG Editor`.
2. No destino local:
   ```powershell
   cd "C:\dev\DG Editor"
   npm ci
   npm run typecheck
   npm run build
   ```
3. Abra o projeto no seu editor a partir de `C:\dev\DG Editor` (não da pasta OneDrive).
4. Rode o app **apenas quando você decidir validar manualmente** (este fluxo não inicia o app).
5. Após **30 dias** sem problemas, você pode arquivar/remover a cópia OneDrive original (mantenha backup/zip se preferir).

## Reversão (30 dias)
- A origem OneDrive continua intacta em: `C:\Users\digo8\OneDrive\CURSOR\DG Editor`
- Para reverter: volte a abrir/trabalhar na origem OneDrive e ignore/remova `C:\dev\DG Editor`.

## Restauração de ambiente pós-migração

### 1. npm install-scripts (allowScripts)
Após `npm install`, autorizar explicitamente:
```powershell
npm install-scripts approve electron
npm install-scripts approve esbuild
```
Sem isso, `node_modules/electron/dist/electron.exe` **não** é baixado e `npx electron-vite dev`/build pode falhar com "electron nao encontrado". A allowlist é sensível à versão; ao mudar a versão do Electron, aprove a nova versão (`npm install-scripts ls` para revisar).

### 2. Versão do Electron
Fixar com `--save-exact` para evitar que uma reinstalação puxe outra versão (a allowlist é por versão).
```powershell
npm install electron@<versão> --foreground-scripts --save-exact
```
Se o download falhar, tentar com mirror:
```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
npm install electron@<versão> --foreground-scripts --save-exact
Remove-Item Env:\ELECTRON_MIRROR
```
Validar: `Test-Path .\node_modules\electron\dist\electron.exe` → `True`; `.\node_modules\electron\dist\electron.exe --version`.

### 3. node-pty (terminal)
Requer **Visual Studio Build Tools** (workload "Desktop development with C++") para `node-gyp` compilar o módulo nativo. Sem isso, `npm run rebuild:pty` falha com `Could not find any Visual Studio installation to use` e o painel **TERMINAL** não funciona (o resto do app pode funcionar). Python também é necessário (`python --version`).

### 4. Caminho com espaço
Caminhos com espaço (ex.: `C:\dev\DG Editor`) podem quebrar `node-gyp`/toolchains nativas (issue `nodejs/node-gyp#65`). O script `scripts/rebuild-node-pty.cjs` foi corrigido para não quebrar no parsing do shell, mas a compilação nativa ainda pode falhar por causa do caminho/toolchain. **Preferir `C:\dev\DGEditor` (sem espaço)** para rebuild do `node-pty`.

## Notas
- Não reativar tarefas de limpeza/auto-commit desativadas.
- Dados de runtime do app (ex.: `%APPDATA%\DG Editor\config\regras-gerais.json`) **não** fazem parte do repositório; migração do código não move `%APPDATA%`.
