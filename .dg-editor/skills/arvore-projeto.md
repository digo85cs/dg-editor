---
titulo: Arvore do projeto
gatilho: arvore, arquivos, projeto_arvore, quantos arquivos, listar arquivos, estrutura
---

# Arvore do projeto

## Quando usar
Sempre que o pedido envolver contar, listar ou mapear arquivos/pastas do projeto.

## Procedimento
1. Chame a tool `projeto_arvore` com os argumentos extraidos do pedido:
   - `maxProfundidade`: numero citado pelo usuario (padrao 2 quando ausente)
   - `filtro`: extensao ou termo citado (padrao "" quando ausente)
2. NUNCA invente a contagem. Use exclusivamente o resultado da tool.
3. Se a tool falhar, reporte o erro literal e sugira `dossie_read` como alternativa.

## Formato da resposta
- Uma frase direta com o numero total, seguida de no maximo 3 exemplos de caminho.
- Exemplo: "Há 115 arquivos no projeto_arvore com profundidade 2. Ex.: src/main/index.ts, ..."

## Erros comuns
- Responder "vou chamar a tool" sem chamar de fato.
- Devolver o JSON da tool sem traduzir para linguagem natural.