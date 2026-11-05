# Plano de auditoria completa e corretiva - DG Editor

## Objetivo
Criar uma auditoria que simule e corrija todos os cantos do DG Editor: build, IPC, main/preload/renderer, agentes/MCP, terminal, dependências, dados, limpeza e integração das melhorias aplicadas (Fases A-D).

## Escopo
- Arquitetura: `src/main`, `src/renderer`, `src/preload`, `src/shared`
- Infra: `scripts/`, `package.json`, `electron-vite.config.ts`, `tsconfig*`
- Sistema: agentes, MCP, fila, checkpoints, vault, terminal (node-pty), navegador embutido
- Melhorias recentes: `.dgignore`, context-manager, modos, permissões, símbolos, dry-run

## Checklist de auditoria

### 1) Estrutura e arquivos
- [ ] Verificar arquivos obrigatórios (`package.json`, `README.md`, `electron-vite.config.ts`)
- [ ] Conferir módulos novos (ignore.ts, modes.ts, permissoes.ts, simbolos*.ts, context-manager.js, etc.)
- [ ] Validar imports/exports cruzados entre main/renderer/preload
- [ ] Procurar referências quebradas (imports inexistentes)

### 2) TypeScript/Build
- [ ] Rodar `npm run typecheck` (se falhar, corrigir tipagens)
- [ ] Rodar `npm run build` completo (main/preload/renderer)
- [ ] Verificar `out/main/index.js`, `out/preload/index.js`, `out/renderer/*`
- [ ] Conferir build MCP (`npm run build:mcp`)

### 3) IPC e segurança
- [ ] Revisar handlers IPC em `src/main/agent/ipc.ts`, `src/main/simbolos-ipc.ts`, etc.
- [ ] Validar `ipc-seguro.ts` (caminhoSeguro, validações)
- [ ] Garantir que novos handlers (`dg:modes:*`, `dg:permissoes:*`, `simbolos:*`) estão registrados
- [ ] Verificar preload expõe APIs necessárias

### 4) Agentes, MCP, fila
- [ ] Validar `src/main/brain/agent.ts`, `src/main/agent/fila.ts`, `src/main/agent/propostas.ts`
- [ ] Conferir MCP server (`src/main/mcp/server.ts`) tem tools esperadas
- [ ] Verificar anti-recursão
- [ ] Validar integração OpenClaw + Agent unificada

### 5) Terminal, node-pty
- [ ] Verificar `node-pty` carregável
- [ ] Checar detecção de shell (pwsh)
- [ ] Validar `src/renderer/terminal.js` e IPC terminal

### 6) Melhorias Fases A-D
- [ ] `.dgignore` integrado em `busca.ts`
- [ ] `context-manager` inicializado em renderer
- [ ] `modes-ui` e `regras-ui` integrados
- [ ] `simbolos` indexação/busca funcional
- [ ] `dry-run` e `permissoes` integrados
- [ ] `checkpoint-timeline` funcional

### 7) Dados e limpeza
- [ ] Verificar `.dg-editor/` estrutura
- [ ] Validar JSONs (`dgrules.json`, configs)
- [ ] Conferir limpeza de temporários
- [ ] Garantir `.gitignore` coerente

### 8) Testes/QA
- [ ] Rodar `npm run qa` ou checagens relevantes
- [ ] Verificar `qa-artifacts/baseline.json`
- [ ] Gerar relatório consolidado

## Plano de execução
1. **Inventário** - Mapear arquivos, imports, handlers IPC
2. **Simulação** - Executar checagens (typecheck, build, auditoria existente)
3. **Detecção** - Identificar erros/warnings/referências quebradas
4. **Correção** - Corrigir problemas encontrados (aditivo, seguro)
5. **Validação** - Re-executar builds e checagens
6. **Relatório** - Gerar `.dg-editor/auditoria-completa-detalhada.md`

## Critérios de sucesso
- `npm run typecheck` sem erros críticos
- `npm run build` completo sem erros
- Todos os módulos novos importados corretamente
- IPC handlers registrados
- Sem referências quebradas
- Build MCP funcional

## Arquivos a gerar
- `.dg-editor/auditoria-completa-detalhada.md` (relatório)
- Eventuais correções pontuais em arquivos existentes (apenas se necessário e seguro)
