---
name: dublagem-parodia
description: Dublagem de parodia (Gatilhos: parodia, dublagem, locutor, personagem)
---

# Dublagem de parodia

## Quando usar
Pedido de narracao, dublagem ou voz para parodia, meme falado ou personagem.

## Procedimento
1. Liste as vozes com `midia_vozes_listar` e escolha apenas arquetipos do banco (locutor, ancora, trailer, vila, heroina etc.).
2. Apresente as opcoes ao usuario e espere a escolha antes de narrar.
3. Para cada fala, ajuste velocidade e entonacao ao arquetipo escolhido.
4. Mantenha o aviso de arquetipo visivel no resultado ("voz de locutor", nao nome de pessoa real).
5. Entregue o audio gerado com o caminho do arquivo e a voz usada.

## Criterio de sucesso
- A voz usada e um arquetipo do banco, confirmada pelo usuario.
- O audio final existe em disco e toca corretamente.

## O que NAO fazer
- Nunca clone nem imite voz de pessoa real.
- Nao sugira que a voz pertence a alguem.
- Nao gerar narracao sem o usuario ter escolhido a voz.
