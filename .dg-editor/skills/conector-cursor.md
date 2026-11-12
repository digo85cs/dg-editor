---
titulo: Conector Cursor
gatilho: cursor, cursor-agent, cursor cli, cursor-cli
---
# Conector Cursor

## Quando usar
Quando o pedido citar Cursor, cursor-agent ou integração com o CLI do Cursor.

## Procedimento
1. Chame `conector_listar` e confira o item `cursor`.
2. Se o binário estiver ausente, diga que o Cursor CLI não foi encontrado no PATH.
3. Se existir mas a sessão não estiver aprovada, peça só a aprovação de sessão — não invente resultado.
4. No loop interno do agente, o cursor-cli é somente leitura (`--mode ask`).

## Critério de sucesso
- O status veio de `conector_listar` ou do registry, nunca inventado.

## O que NÃO fazer
- Não editar arquivos pelo cursor-cli.
- Não inventar modelo ou resposta do Cursor.
