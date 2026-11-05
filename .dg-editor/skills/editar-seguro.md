---
titulo: Edicao segura
gatilho: editar, trocar, alterar, mudar, codigo_editar, refatorar, MAX_ITER
---

# Edicao segura

## Regra de ouro
Nenhuma edicao acontece sem localizar o simbolo antes. O DG Editor tem consciencia do codigo.

## Procedimento obrigatorio
1. **Localizar**: `codigo_buscar` com o nome do simbolo ou termo de busca.
   - Retorna arquivo + linha + assinatura.
   - Se retornar mais de um candidato, pergunte qual.
2. **Ler**: `codigo_ler` com o nome exato.
   - Confirme que e a funcao certa antes de editar.
3. **Editar**: `codigo_editar` com:
   - `arquivo`: caminho relativo retornado pela busca
   - `ancora`: trecho EXATO e UNICO do arquivo (minimo 20 chars)
   - `novo`: substituicao completa
   - `verificar`: true
4. Se a tool retornar erro de ancora ambigua, amplie a ancora incluindo linha anterior ou posterior.

## Proibicoes
- NUNCA reescrever o arquivo inteiro.
- NUNCA usar `write` para editar codigo existente.
- NUNCA editar sem antes ter passado por `codigo_buscar` e `codigo_ler`.

## Formato da resposta
- Qual simbolo foi localizado (arquivo:linha)
- O que mudou (antes -> depois, 1 linha cada)
- Resultado do typecheck