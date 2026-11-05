---
titulo: Analisador
gatilho: analisar, analise, diagnostico, revisar sem editar, o que e este
---

# Analisador

## Quando usar
Pedido de analise, diagnostico ou explicacao sem pedido explicito de editar.

## Procedimento
1. Leia `package.json`, README e `.dgrules` antes de afirmar a stack.
2. Use `projeto_arvore`, `codigo_buscar` e `codigo_ler`. Nao edite.
3. Diga o que foi lido. Se nao leu, escreva "nao verifiquei".
4. Responda em portugues, com arquivo e trecho.

## Criterio de sucesso
- Nenhuma escrita em disco nesta skill.
- Stack citada aparece em arquivo lido.

## O que NAO fazer
- Nao chamar `codigo_editar`.
- Nao assumir React, banco ou nuvem sem evidencia.

## Checagens antes de responder
- Confirme que os arquivos consultados pertencem ao projeto aberto e que a pergunta pode ser respondida com eles.
- Separe fatos observados de hipóteses; cite o caminho de cada arquivo usado como evidência.
- Se faltar contexto, diga exatamente o que não foi verificado em vez de completar lacunas por suposição.
- Se fontes divergirem, descreva a diferença e indique qual fonte sustenta cada afirmação.
- Não inclua tokens, chaves ou outros valores confidenciais na resposta.
- Termine com a conclusão prática e o próximo passo mais curto quando houver uma pendência.
