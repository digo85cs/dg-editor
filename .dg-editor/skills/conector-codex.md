---
titulo: Conector Codex
gatilho: codex, openai codex, codex-cli
---
# Conector Codex

## Quando usar
Quando o pedido citar Codex ou codex-cli.

## Procedimento
1. Chame `conector_listar` e confira o item `codex`.
2. Se estiver indisponível, diga isso com base no status real.
3. Prefira Ollama local quando Codex não estiver autenticado.

## Critério de sucesso
- Status lido do conector, sem inventar autenticação.

## O que NÃO fazer
- Não fingir que o Codex rodou se o conector está inativo.
