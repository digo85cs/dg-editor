# ARQUITETURA.md — orquestração residual (Block 6)

Contrato de decomposição do renderer (`src/renderer/app.js`). Módulos em `features/*` extraem lógica **pura/render/persistência** com dependências injetadas; **não** importam `app.js`. A orquestração abaixo permanece em `app.js` por alto acoplamento (>10 deps em cascata, DOM vivo, estado/ciclo de vida).

## Arquivos (features/arquivos)
- **Extraído**: `git-helpers.js` (relPosix/corGit/badgeGitHtml/gitStatusMap), `tree-render.js` (CHEV, renderizarArvoreEm, criarNoDir/File com deps), `recentes.js` (caminhoSobPasta, salvar/carregar/adicionar/reapontar/remover state, localStorage `dg-pastas`), `index.js` (pastasPermitidas, carregarFilhos com deps). Wrappers em `app.js` injetam UI/ações.
- **Residual em `app.js`**: `abrirPasta`, `abrirVault`/fechar/atualizarPainelVault, `garantirPastaRaizProjeto`, `selecionarPasta`, `definirContextoPasta`, `renderizarPastas`/DOM wiring, handlers UI de recentes/diff. `selecionarPasta` orquestra estado + chat + análise cacheada + git status + status bar + abas centro + regras template (~15 deps).

## Análise (features/analise)
- **Extraído**: `render.js` (secao/secaoLista, `renderizarAnaliseHtml`, `renderizarErroHtml` com `@shared/erros`), `whereis.js` (`renderizarWhereisMatchesHtml/VazioHtml/ErroHtml`). IPC e wiring de DOM/eventos permanecem em `app.js`.
- **Residual em `app.js`**: `habilitarBotoesAnalise` (depende de `state.pastaAtual` + botões DOM), `rodarAnalise`/`analisarCompleta`/`escolherEscopoAnalise`/`solicitarDialogoEscopoAnalise` (orquestram IPC `analysis:*`, progresso, ativação de aba, cache flag, erros tipados), `buscarOndeEsta` (valida input, IPC `whereis:ask`, injeta HTML, liga cliques `.whereis-hit-file` → `abrirArquivoNoEditor`).

## Chat (features/chat)
- **Extraído**: `render.js` (`normalizarMensagensChat`, `bolhaHtml` — HTML escapado; inserção DOM/scroll/animação `animarEntradaMsg` permanecem em `app.js`), `composer.js` (`deveEnviarPorEnter`, `iniciarComposer` com `onEnviar` injetado).
- **Residual em `app.js`**: `enviarMensagem` (orquestra IPC `chat:send`, streaming `chat:delta`, loading, anexos, seleção agente/modo, histórico, render/scroll, erros), `ligarHistoricoChat`/`novaConversaUi`, estado `histChat`/anexos, scroll/focus DOM vivo.

## Terminal
- **Extraído (estado atual/pré-existente)**: `src/renderer/terminal.js` já é módulo separado (~30KB) — xterm/init/addons/fit, abas/grupos/split, perfis de shell, drag-drop, persistência de layout, handlers de input/resize e IPC PTY (`apiTerm().write/resize/kill/create/onData/onExit`).
- **Residual / não movido em 8a-8c (decisão segura)**: refatorar `terminal.js` para `features/terminal/{xterm-init,keys,index}` exigiria reescrita com >10 dependências/coupling (DOM vivo xterm container/fit/ResizeObserver, PTY IPC, abas/grupos, layout, tema CSS vars, estado global do painel). Conforme regras, **não extrair**; manter `terminal.js` como módulo dedicado. `app.js` mantém wiring mínimo (`initTerminalPanel` lazy via `garantirTerminal`, botão/atalho Ctrl+`, integração menubar/layout). Teardown PTY: `kill` via IPC no main (`node-pty`); renderer faz dispose/unsub dos recursos xterm no módulo — sem duplicar processos; mudanças adicionais exigiriam verificação de `beforeunload` vs `apiTerm().kill` com cuidado.

Atualizar este arquivo ao mover orquestração adicional.
