---
name: conector-codex
description: Conector Codex (Gatilhos: codex, openai codex, codex-cli)
---

# Conector Codex

## Quando usar
Quando o pedido citar Codex, codex-cli ou a integracao com a CLI da OpenAI.

## Procedimento
1. Chame `conector_listar` e confira o item `codex` — status, autenticacao e versao.
2. Se o conector estiver inativo ou sem credencial, diga isso com base no status real e ofereca alternativa (Ollama local, outro provider configurado).
3. Se estiver ativo, encaminhe o pedido ao conector e repasse a saida real.
4. Reporte o que o Codex devolveu, incluindo erros de autenticacao ou quota quando ocorrerem.

## Criterio de sucesso
- O status foi lido de `conector_listar`, nunca inventado.
- Se o Codex nao rodou, a resposta explica o motivo real.

## O que NAO fazer
- Nao fingir que o Codex executou quando o conector esta inativo.
- Nao pedir nem exibir tokens/chaves — credenciais ficam no vault.
- Nao trocar silenciosamente para nuvem paga sem avisar o usuario.
