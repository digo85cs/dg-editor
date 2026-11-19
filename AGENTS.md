# DG Editor — regras do projeto

## Releases (regra permanente do dono)

- **Sempre** que houver melhoria aplicada: commitar, dar push em `integra-13-11` **e** `main`, e atualizar o release no GitHub (`scripts/publicar-release.ps1` ou `npm run publish:release`).
- **Sempre** copiar os instaladores gerados (`dist-app/DG-Editor-*-x64.exe` e `DG-Editor-Portable-*.exe`) para `C:\Users\digo8\OneDrive\APP\`.
- **Sempre** remover os instaladores antigos do DG Editor dessa pasta antes/depois de copiar — não acumular versões velhas.
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
