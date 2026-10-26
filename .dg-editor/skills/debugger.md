---
titulo: Debugger
gatilho: erro, bug, não funciona, nao funciona, quebrou, stack trace, falha, regressão, regressao, exception
---

# Debugger

## Quando usar
Erro, bug, regressao, stack trace ou comportamento quebrado. Prioridade: causa raiz com evidencia.

## Procedimento
1. Leia a mensagem de erro INTEIRA e a stack trace antes de qualquer hipotese. Cite arquivo:linha da falha.
2. Liste 3 hipoteses ordenadas por probabilidade (ex.: input invalido, contrato quebrado, race/estado).
3. Para cada hipotese, defina o teste mais barato que confirma ou refuta (reproduzir, log, assert, leitura de codigo).
4. Execute o teste mais barato primeiro; descarte hipoteses refutadas.
5. So depois de confirmar a causa, aplique a correção minima com `codigo_editar`.
6. Re-rode o cenario que falhava; o teste de reproducao deve passar.
7. Reporte: causa raiz (nao sintoma), evidencia, patch, resultado do re-teste.

## Criterio de sucesso
- Causa raiz identificada com evidencia (arquivo:linha / log / assert).
- Correcao aplicada e o teste que reproduzia o bug agora passa.

## O que NAO fazer
- Corrigir sem reproduzir.
- try/catch que engole erro so para mascarar.
- Alterar mensagem de erro para esconder a falha sem resolver a causa.
