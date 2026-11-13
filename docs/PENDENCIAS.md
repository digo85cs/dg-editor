# Pendências — Missão DG Editor

## Contexto

Branch `missao-conclusao` criada a partir de `checkpoint/antes-da-migracao-2026-11-06`.

Objetivo geral: levar o DG Editor a estado de uso diário confiável (A1–A10). Prioridade 1 = isolamento de repositório (A2).

## Concluído nesta sessão

- **Servidor MCP HTTP read-only** (`src/main/mcp/http-server.ts`): `127.0.0.1:7331`, token `DG_MCP_TOKEN`, 11 ferramentas de leitura, sem expor servidor stdio
- **Isolamento de repositório (A2)**: `http-server.ts`, `providers.ts`, `ollama.ts` agora usam `obterRaizWorkspace()` em vez de `resolverRaizProjeto()` para operações de usuário
- **Detecção de anexos de imagem** em `src/main/ipc/chat.ts`: retorna erro informativo quando visão não está disponível
- **Validações**: `npm run typecheck` (EXIT 0), `npm run build:mcp` (EXIT 0), `npm test` (145/145 testes), `npm run build` (sucesso)
- **Documentos criados**: `docs/ARQUITETURA.md`, `docs/MCP.md`, `docs/REPOSITORIOS.md`, `docs/PENDENCIAS.md`

## Pendentes (Partes 3–16 da missão)

### Parte 3 — Ambiente de uso diário
- [ ] Validar `npm run dev` inicia sem erros
- [ ] Validar painel Agent funciona com agente selecionado
- [ ] Validar OpenClaw (diff + aprovação humana)
- [ ] Validar terminal embutido (PowerShell 7)

### Parte 4 — Testes QA
- [ ] Rodar `npm run qa` (suíte completa)
- [ ] Rodar `npm run qa:ipc`
- [ ] Rodar `npm run qa:e2e`
- [ ] Rodar `npm run qa:perf`
- [ ] Atualizar baseline com `npm run qa:baseline`

### Parte 5 — Documentação
- [ ] Atualizar `README.md` com seção de MCP HTTP
- [ ] Revisar `docs/DIVIDAS.md` após mudanças de isolamento

### Parte 6 — Métricas e ciclos
- [ ] Revisar `.dg-editor/metrics.json`
- [ ] Revisar `.dg-editor/ciclos-melhoria/`
- [ ] Revisar `.dg-editor/projeto-memoria.json`
- [ ] Revisar `.dg-editor/skill-packs.json`

### Parte 7 — Segurança
- [ ] Auditar que nenhum token está escrito em arquivo do repositório
- [ ] Verificar que `DG_MCP_TOKEN` nunca aparece em logs
- [ ] Confirmar que servidor stdio não foi alterado nem exposto

### Parte 8 — Build e release
- [ ] Validar `npm run dist:win:installer`
- [ ] Verificar atalho do instalador aponta para DG Editor, não runtime interno

### Parte 9 — Certificação
- [ ] Rodar `npm run certificar`
- [ ] Rodar `npm run limpeza:organica`

### Parte 10–16 — Itens restantes da missão
- [ ] (Conforme plano detalhado da missão Partes 10–16)

## Commit pendente

- Branch `missao-conclusao` tem alterações não commitadas:
  - `M package.json`
  - `M src/main/ipc/chat.ts`
  - `M src/main/mcp/tsconfig.mcp.json`
  - `M src/main/mcp/http-server.ts`
  - `M src/main/brain/providers.ts`
  - `M src/main/brain/ollama.ts`
  - `?? docs/ARQUITETURA.md`
  - `?? docs/MCP.md`
  - `?? docs/REPOSITORIOS.md`
  - `?? docs/PENDENCIAS.md`
  - Arquivos não rastreados em `.dg-editor/` (métricas, ciclos, memória, skills)
