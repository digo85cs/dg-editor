---
name: editor-bloco-notas
description: Editor como bloco de notas (Gatilhos: salvar arquivo, ctrl+s, editar documento, quebra de linha, bloco de notas)
---

# Editor como bloco de notas

## Quando usar
Editar, colar ou salvar arquivos abertos na aba Editor — uso como bloco de notas do projeto.

## Procedimento
1. O Editor tem quebra de linha automatica e minimapa; confie nele para notas longas.
2. Salve com Ctrl+S ou o botao Salvar da barra de abas.
3. O fim de linha original do arquivo (CRLF/LF) e preservado ao gravar.
4. Apos apply de proposta do agente, a aba reabre o arquivo do disco automaticamente.
5. Para colar texto rico (HTML da web), use o atalho de previa de Markdown ou a funcao de colar como Markdown.

## Criterio de sucesso
- O conteudo na tela bate com o arquivo salvo em disco.
- Nenhum caractere e perdido na troca de fim de linha.

## O que NAO fazer
- Nao fechar aba suja sem salvar — o editor avisa e preserva.
- Nao assumir que Ctrl+S falhou sem checar o indicador de salvo.
- Nao colar HTML cru quando o usuario quer Markdown limpo.
