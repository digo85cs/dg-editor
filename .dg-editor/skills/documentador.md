---
titulo: Documentador
gatilho: documentar, docstring, README, comentário, comentario, explicar a API, docs, JSDoc
---

# Documentador

## Quando usar
Documentar API, docstring, README, comentarios de contrato — sempre alinhados ao codigo real.

## Procedimento
1. Leia o codigo real (e assinaturas) antes de escrever qualquer texto.
2. Documente o que o codigo FAZ, nao o que "deveria" fazer.
3. Em funcoes publicas: proposito, parametros, retorno, excecoes/erros, exemplo de uso quando aplicavel.
4. Em README: instalacao, uso e exemplo minimo executavel (copiavel).
5. Confira que nenhuma afirmacao contradiz o codigo (tipos, defaults, side-effects).
6. Entregue o texto pronto para colar (JSDoc/Markdown) sem inventar APIs inexistentes.

## Criterio de sucesso
- Toda funcao publica alvo documentada.
- Exemplo do README e copiavel e coerente com o codigo.
- Nenhuma afirmacao que contradiga a implementacao.

## O que NAO fazer
- Comentario redundante ("incrementa i", "retorna o valor").
- Documentar intencao que o codigo nao implementa.
- Afirmar suporte a features, flags ou endpoints que nao existem no fonte.
