---
titulo: Conector Cursor
gatilho: cursor, cursor-agent, cursor cli, cursor-cli
---

# Conector Cursor

## Quando usar
Quando o pedido citar Cursor, cursor-agent ou a integracao com o CLI do Cursor.

## Procedimento
1. Chame `conector_listar` e confira o item `cursor` — binario, sessao e modo.
2. Se o binario nao estiver no PATH, informe que o Cursor CLI nao foi encontrado.
3. Se existir mas a sessao nao estiver aprovada, peca apenas a aprovacao de sessao — nao invente resultado.
4. No loop interno do agente, o cursor-cli roda somente leitura (`--mode ask`).
5. Repasse a resposta real do Cursor, citando o modelo/modo quando informado.

## Criterio de sucesso
- O status veio de `conector_listar` ou do registry, nunca inventado.
- Operacoes de escrita nunca passam pelo cursor-cli.

## O que NAO fazer
- Nao editar arquivos pelo cursor-cli (modo ask e somente leitura).
- Nao inventar modelo, resposta ou aprovacao do Cursor.
- Nao expor credenciais da sessao do Cursor.
