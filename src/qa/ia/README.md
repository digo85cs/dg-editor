# Contrato de autocorreção por IA (catálogo fechado)

Este diretório é o **hook** para a próxima etapa. O agente determinístico
(`npm run qa`) já identifica falhas; a IA **não** aplica patches nesta fase.

## Quando `corrigivel: true`

Somente se a falha estiver nesta lista fechada:

1. **lint/typecheck** — erro de tipo isolado
2. **typo óbvio de UI** — ex.: `Salvar` vs `salvarr`
3. **seletor CSS ausente** revelado por E2E — adicionar `data-testid`
4. **formatação** — espaço/indentação

Qualquer outro tipo → `pendente_manual`.

## Fluxo (futuro)

1. `brain.ask()` recebe `ResultadoCenario` + trecho de código.
2. A IA propõe um patch.
3. Aplicar **somente** se:
   - (a) tipo ∈ catálogo acima  
   - (b) mudança ≤ 20 linhas em **1** arquivo  
   - (c) `npm run typecheck` passa  
   - (d) `npm test` passa (todos os testes atuais)  
   - (e) um teste de regressão **novo** entra na seção 8+ do `validator.cjs`
4. Cada correção = **um commit** `fix(qa):` citando `cenarioId` e o teste.
5. Se qualquer critério falhar: **não** aplicar; marcar `pendente_manual`.

## Offline

Se o brain/Ollama estiver offline, o catálogo não é consumido e tudo permanece
`pendente_manual`.
