# Pendências — Missão DG Editor

> **Estado 2026-11-16 (pós-correções da auditoria):**
> - `node_modules` saneado: 91 pacotes com arquivos `.js` ausentes reinstalados; `scripts/verificar-deps.cjs` criado e integrado ao `certificar` (etapa `deps`).
> - `node-pty` recompilado para Electron (`npm run rebuild:pty`) após instalar VS Build Tools 2022.
> - Ollama 0.40.16 instalado e no ar com os modelos do projeto (1.5b/3b/7b/14b, llama3.2, nomic-embed).
> - Radar: modelo `thinkingmachines/inkling-2-small:free` removido do provider `openrouter-inkling` (OpenRouter responde 403 fora de harness agentic); resta `openrouter/free`.
> - `test/validator.cjs`: 467/467 asserts (assinatura `enfileirarAgente(raiz, fn)` e asserts de UI atualizados).
> - `scripts/validar-melhorias.cjs`: VALIDACAO OK (inclui Ollama no ar).
> - `npm run certificar`: PASS completo (essenciais, deps, typecheck, test, build, artefatos-out).
> - `npm run qa:ipc`: 15 ok / 0 erro.
> - `npm run qa:e2e`: 76 ok / 10 warn / 0 erro — WARNs são features removidas intencionalmente na refatoração para o painel `#tool-corpo` (IPC segue coberto) + dependências de host (ComfyUI parado, pycdlib/python ausente). Regressões reais corrigidas nesta rodada: aba órfã limpa não fechava (`ativarAba`), anúncios aria-live de etapa/resultado do agente removidos (`anunciarEtapaAgente` + `ligarAnuncioEtapasAgente`), ajustes de fonte por painel removidos (`acessibilidade.js` + atalhos Ctrl+Shift/Ctrl+Alt), e corrida no `live-region` que engolia anúncio de etapa (`prioridade`). Hook `window.__dgTestLimparAbas` adicionado para QA.
> - `npm run qa:perf`: OK (estável).
> - Janela principal agora com `sandbox: true` (preload só usa `electron` + `sanitize.ts` puro); smoke Playwright confirmou bridge `window.api` íntegro.
> - Peer conflict eslint@10 × eslint-plugin-import resolvido via `.npmrc` com `legacy-peer-deps=true` (eslint não tem config/script no projeto — devDep ocioso).
> - Bug corrigido: `scripts/certificar.cjs` não spawnava `npm.cmd` no Windows (shell condicional por extensão).
> - Bug corrigido: `src/main/boot-saude.ts` usava `execSync` bloqueante no boot; agora `execFile` assíncrono.
> - `chat.ts` não tem mais modelo hardcoded: fallback usa `MODELO_FALLBACK_CHAT` do catálogo.
>
> **Ambiente:** Node v26.13.1, npm 11.20.0, git 2.56, Electron v33.2.1. Atenção: `ELECTRON_RUN_AS_NODE=1` estava setado no ambiente e quebra o launch do Electron (qa:e2e) — limpar antes de rodar a suíte.
>
> **Pendente:** smoke visual manual do app instalado; `app.js` (~7k linhas) segue sendo o maior risco de regressão. `dist:win:installer` já gerou `DG-Editor-0.6.0-x64.exe` + Portable em `dist-app/`.

## Melhorias aplicadas (pesquisa GitHub — aider/opencode/Cline/Roo/Continue)

- [x] **Regras multi-formato**: `readComplementaryRules()` lê `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.clinerules`, `.windsurfrules`, `.github/copilot-instructions.md` e injeta no contexto do agente (`contexto-implicito`) e do chat (`regras-escopo`).
- [x] **Weak-model para tarefas baratas**: `resumo`, `commit`, `classificar` → `qwen2.5-coder:1.5b` no catálogo (`modelos-catalogo.ts` + `modelos.default.json`).
- [x] **Repo map estilo aider**: `src/main/agent/repo-mapa.ts` — símbolos exportados por arquivo, cache por assinatura, prioridades por abas, ~7KB, injetado no contexto do agente e do chat.
- [x] **Auto-aprovação**: já existia matriz de risco (`decidirAutoAprovacao` em `agent-router.ts`) — risco baixo/rota localizada/com ≤2 propostas.
- [x] **Memória de projeto**: já existia — embeddings semânticos + vault + `proporMemoria` no chat.
- [x] **Eval/autocorreção**: `qa:ia` (`autocorrigir.ts`) já cobre catálogo fechado de autocorreção.

- [x] **Comandos de chat estilo aider**: `/mapa`, `/diff`, `/commit`, `/limpar`, `/modelo`, `/regras`, `/spec`, `/specs`, `/ajuda` em `src/main/chat-comandos.ts` (intercepta `chat:send`).
- [x] **Spec-driven (artefato)**: `/spec <titulo>` cria `.dg-editor/specs/<slug>.md` com template (objetivo/escopo/tarefas/aceite); specs entram no contexto implícito do agente.
- [x] **MCP clients externos**: `.dg-editor/mcp-externos.json` (ver `mcp-externos.example.json`) — servidores stdio externos aparecem ao agente como `ext_<servidor>__<tool>` via `mcp/externos.ts`.

## Melhorias aplicadas — rodada Devin-parity (v0.6.3+)

- [x] **Devin API v3**: `src/main/devin-api.ts` — status/criar/status/listar sessões; IPC `devin:*`; comandos `/devin`, `/devin-status`, `/devin-listar`, `/devin-sync`; auth via env ou vault (`/credenciais devin cog_...` + `devin-org`).
- [x] **LSP-lite**: `src/main/lsp/ts-servico.ts` — `ts.LanguageService` por workspace: hover, go-to-def, diagnósticos sintáticos+semânticos; IPC `lsp:*`; diagnósticos injetados no contexto do agente. **Escopo: TypeScript/JavaScript apenas** (checkJs off).
- [x] **Worktree checkpoints**: `src/main/git-worktree.ts` + `/worktree`, `/paralelo <nome> [tarefa]` (agente isolado), `/paralelo-merge <nome>` (merge + limpeza).
- [x] **Marketplace MCP**: `src/main/mcp/mercado.ts` (7 servidores curados) + `/mcps` lista e `/mcps <id>` instala em `mcp-externos.json`.
- [x] **Vault de credenciais**: IPC `credenciais:*` sobre `segredos-providers` (safeStorage); comando `/credenciais`.
- [x] **Agendador de prompts**: `src/main/agendador.ts` + IPC `agendador:*` + evento `agendador:disparo` → renderer injeta no chat; `/agendar <min> <prompt>`, `off|on|remover`.
- [x] **Skill triggers**: `src/main/agent/skill-triggers.ts` — frontmatter `triggers:` em `.dg-editor/skills`, `.agents/skills`, `.kilo/skills` injeta skills no contexto do agente.
- [x] **Fix EPERM packaged**: `resolverRaizDGEditor()` retorna `userData` quando `process.resourcesPath` existe (app instalado não escreve mais em Program Files). Release v0.6.2.
- [x] **Branch main**: `main` agora aponta para `integra-13-11` (v0.6.3); histórico antigo preservado em `legacy-main-2026-10`.

## Roadmap restante (deferred)

- [ ] **Refatoração `app.js`** (~7k linhas): segue o maior risco de regressão; extração incremental por blocos.
- [ ] **LSP multi-linguagem**: Python (pyright) e outros; hoje só TS/JS.
- [ ] **UI do agendador/credenciais/MCP marketplace**: comandos de chat funcionais; falta painel visual (app.js).
- [ ] **Devin PR handoff completo**: detectar PR da sessão cloud e mergear localmente — depende de credencial real para validar payload.
- [ ] **Smoke manual**: abrir app instalado, testar chat/terminal/agente.
- [ ] **qa:e2e warnings**: 10 warns intencionais (features migradas p/ painel + deps de host: ComfyUI, pycdlib).

---

> **Status 2026-11-16 (histórico):** documento da missão `missao-conclusao`.
> A auditoria completa mais recente está em `.dg-editor/auditoria-completa-detalhada.md`.
> Os itens abaixo refletem o estado daquela sessão; vários já foram concluídos depois
> (typecheck, testes, MCP HTTP, isolamento de repositório). Não usar como fonte de verdade.

## Contexto histórico

Branch `missao-conclusao` criada a partir de `checkpoint/antes-da-migracao-2026-11-06`.

Objetivo geral: levar o DG Editor a estado de uso diário confiável (A1–A10). Prioridade 1 = isolamento de repositório (A2).

## Concluído naquela sessão

- **Servidor MCP HTTP read-only** (`src/main/mcp/http-server.ts`): `127.0.0.1:7331`, token `DG_MCP_TOKEN`, 11 ferramentas de leitura, sem expor servidor stdio
- **Isolamento de repositório (A2)**: `http-server.ts`, `providers.ts`, `ollama.ts` agora usam `obterRaizWorkspace()` em vez de `resolverRaizProjeto()` para operações de usuário
- **Detecção de anexos de imagem** em `src/main/ipc/chat.ts`: retorna erro informativo quando visão não está disponível
- **Validações**: `npm run typecheck` (EXIT 0), `npm run build:mcp` (EXIT 0), `npm test` (145/145 testes), `npm run build` (sucesso)
- **Documentos criados**: `docs/ARQUITETURA.md`, `docs/MCP.md`, `docs/REPOSITORIOS.md`, `docs/PENDENCIAS.md`

## Pendentes registrados na época (rever antes de executar)

- [ ] Validar `npm run dev` inicia sem erros
- [ ] Validar painel Agent funciona com agente selecionado
- [ ] Validar OpenClaw (diff + aprovação humana)
- [ ] Validar terminal embutido (PowerShell 7)
- [ ] Rodar `npm run qa` / `qa:ipc` / `qa:e2e` / `qa:perf`
- [ ] Atualizar `README.md` com seção de MCP HTTP
- [ ] Auditar que nenhum token está escrito em arquivo do repositório
- [ ] Confirmar que `DG_MCP_TOKEN` nunca aparece em logs
- [ ] Validar `npm run dist:win:installer`
- [ ] Rodar `npm run certificar` e `npm run limpeza:organica`
