---
titulo: Leitor de codigo
gatilho: entender, explicar, onde está, onde esta, como funciona, fluxo, ler codigo, localizar
---

# Leitor de codigo

## Quando usar
Pedidos de entendimento, localizacao de simbolo, explicacao de fluxo ou "como funciona X".

## Procedimento
1. Chame `codigo_buscar` com o termo/simbolo pedido (aceita sinonimos).
2. Se houver varios hits, escolha o exportado/principal e cite os candidatos.
3. Chame `codigo_ler` no nome exato; se a tool so devolver a funcao, anote arquivo e linhas.
4. Busque chamadores: `codigo_buscar` pelo nome do simbolo e filtre referencias de chamada.
5. Monte o fluxo: entradas → transformacoes → saidas / efeitos colaterais.
6. Liste dependencias externas (HTTP, fs, MCP, Ollama) que o trecho toca.
7. Responda em portugues com citacoes `arquivo:linha` e um paragrafo de fluxo.

## Criterio de sucesso
- Toda afirmacao aponta arquivo:linha verificavel.
- Fluxo descreve dados de ponta a ponta sem inventar funcoes inexistentes.
- Nenhum arquivo foi modificado nesta skill.

## O que NAO fazer
- Nao reescrever, refatorar nem editar codigo.
- Nao inventar assinaturas ou call sites nao encontrados pelo indice.
- Nao despejar o arquivo inteiro; foque no simbolo e no contexto minimo.
