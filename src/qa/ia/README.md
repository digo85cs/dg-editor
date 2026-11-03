# Contrato de autocorreção por IA (catálogo fechado)

Implementação: `autocorrigir.ts` + `npm run qa:ia` (`--dry-run` / real).

## Quando `corrigivel: true`

Somente se a falha estiver nesta lista fechada:

1. **lint/typecheck** — erro de tipo isolado
2. **typo óbvio de UI** — ex.: `Salvar` vs `salvarr`
3. **seletor CSS ausente** revelado por E2E — adicionar `data-testid`
4. **formatação** — espaço/indentação

Qualquer outro tipo → `pendente_manual`.

## Fluxo

1. Classifica a falha no catálogo.
2. Propõe patch (fixture determinística ou `brain.ask()`).
3. Aplicar **somente** se:
   - (a) tipo ∈ catálogo  
   - (b) mudança ≤ 20 linhas em **1** arquivo  
   - (c) `npm run typecheck` passa  
   - (d) `npm test` passa  
   - (e) `npm run qa:ipc` passa  
   - (f) teste de regressão novo no validator  
4. Cada correção = **um commit** `fix(qa):` citando `cenarioId`.
5. `--dry-run`: imprime o patch e **não** aplica.

## Offline

Se o brain/Ollama estiver offline, usa fixture do catálogo quando possível; senão `pendente_manual`.
