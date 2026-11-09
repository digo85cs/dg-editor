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
- **Extraído**: (Fatia 8) init xterm, atalhos e ciclo de vida (`iniciarTerminal`/`destroy`) com deps de PTY injetadas.
- **Residual em `app.js`**: wiring PTY/socket real, integração com layout/abas e teardown de processo quando aplicável.

Atualizar este arquivo ao mover orquestração adicional.
