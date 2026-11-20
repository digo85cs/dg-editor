# DG Editor — regras do projeto

## Releases (regra permanente do dono)

- **Sempre** que houver melhoria aplicada: commitar, dar push em `integra-13-11` **e** `main`, e atualizar o release no GitHub (`scripts/publicar-release.ps1` ou `npm run publish:release`).
- **Sempre** copiar os instaladores gerados (`dist-app/DG-Editor-*-x64.exe` e `DG-Editor-Portable-*.exe`) para `C:\Users\digo8\OneDrive\APP\`.
- **Sempre** remover os instaladores antigos do DG Editor dessa pasta antes/depois de copiar — não acumular versões velhas.
- **Sempre** atualizar a versão local e o atalho da área de trabalho: rodar `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/criar-atalho-desktop.ps1` (atalho `OneDrive\Desktop\DG Editor.lnk` → `abrir-dg-editor.vbs` → repo `C:\dev\DGEditor`).
- Bump de versão em `package.json` antes de cada release (`npm version X.Y.Z --no-git-tag-version`).

## Validação mínima antes de commit/push

- `npx tsc --noEmit` limpo
- `node scripts/verificar-sintaxe.mjs` OK
- `npx vitest run` verde (quando mexer em lógica coberta por teste)
- Mudanças no MCP HTTP (`src/main/mcp/http-server.ts`): recompilar com `npx tsc -p src/main/mcp/tsconfig.mcp.json` e reiniciar o servidor (`scripts/mcp-http-oculto.vbs`) antes de validar via `https://dg-mcp.autopartz.app/mcp`.

## Ponte Maestro (produção)

- Endpoint público: `https://dg-mcp.autopartz.app/mcp` (Cloudflare Tunnel `dg-editor-mcp` + serviço `cloudflared` + tarefa `DGEditor-MCP-HTTP`).
- Token Bearer em `%LOCALAPPDATA%\dg-editor\mcp-http-token.txt`.
- Docs completas em `docs/adapta.md`.

## Não fazer

- Não tocar produção AutoPartz (FTP/DB/deploy) — fronteira combinada.
- Não commitar segredos; `.dg-editor/` runtime (chats, resposta-cache, relatorios, midia) é gitignored.

## App empacotado (v0.9.14) — defaults via resources

- `resolverRaizDGEditor()` em app instalado retorna **userData** (não o repo). Sem `src/`, `.dg-editor/bin`, skills ou agentes.
- MCP stdio usa `resources/mcp-server.cjs` (bundle esbuild único, gerado por `npm run build:mcp-bundle` no prebuild; testado com initialize OK).
- `dirEmpacotado(sub)` em `paths.ts` → `resourcesPath/dg-editor/<sub>`; `listarSkills`/`listarAgentes`/`regrasParaContexto` **mesclam** local + pacote (local vence por id).
- `extraResources` leva `.dg-editor/{skills,agentes,regras}/*.md` → `resources/dg-editor/`.
- Auditoria: checks de `src/` pulam com warn único quando empacotado; `checarMcp` valida o bundle; git check ok sem `.git`.
- Auditoria no instalado deve mostrar ~23 OK / poucos warns reais (providers sem chave etc.), não 58 erros.

## Armadilhas de diagnóstico (20/11/2026)

- **`ELECTRON_RUN_AS_NODE=1`**: o Devin CLI (Electron) exporta essa var; shells filhos a herdam e **qualquer exe Electron lançado dali vira Node puro** (`DG Editor.exe --version` → `v20.18.1`). Sintoma: app "morre em <1s, exit 0, sem logs". Sempre `Remove-Item Env:ELECTRON_RUN_AS_NODE` antes de testar o app empacotado.
- **Requires literais `require('./x')`/`require('../x')` em `src/main` NÃO são bundlados** pelo electron-vite — viram require em runtime e quebram porque `out/main/` só tem `index.js`+`chunks/`. Auditar com scan de `require("..")` vs filesystem após build. Corrigido em v0.9.17: agendador (scheduler nunca subia no instalado) e segredos-providers (vault de chaves ilegível → Gemini/Devin/OpenAI falhavam em silêncio).
- `await import()` de módulo já inline pode virar `require()` quebrado no output CJS — preferir import estático quando o módulo já entra no bundle.
- Logs do app: `dglog`/`Xt` escrevem em `<cwd>/.dg-editor/logs/dg-log.jsonl` (não userData); logs estruturados em `%APPDATA%/DG Editor/logs/dg-*.jsonl`.
- **Módulos renderer extraídos de app.js**: cada arquivo precisa do próprio helper `$`/`escapar`/`mostrarToast` — imports não são compartilhados. Falta de `$` em `config-contas.js` (v0.9.18) derrubava TODOS os modais Config/Contas silenciosamente (só `pageerror` no console entregava). Armadilha irmã dos requires não bundlados: auditoria de "usa X sem definir/importar" pega rápido.
