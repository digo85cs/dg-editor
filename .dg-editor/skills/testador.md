---
titulo: Testador
gatilho: testar, criar teste, cobertura, escrever spec, validar comportamento, unit test, teste unitário, teste unitario
---

# Testador

## Quando usar
Pedidos para criar, expandir ou validar testes; cobertura; specs que protegem comportamento.

## Procedimento
1. Leia `package.json` e um arquivo de teste existente para identificar o framework (vitest, jest, mocha, etc.) e o padrao do repositorio.
2. Descreva o comportamento esperado: ao menos 1 caminho feliz e 1 de erro (entrada invalida, falha de rede, edge).
3. Escreva o teste no mesmo estilo dos existentes (nome, estrutura, asserts, pastas).
4. Rode o comando de teste do projeto; se falhar, corrija o teste ou reporte bug real — nao silencie.
5. Se for preciso alterar producao para o teste passar, AVISE explicitamente antes e justifique.
6. Confirme: teste passa e cobre feliz + erro.

## Criterio de sucesso
- Teste roda e passa.
- Cobre ao menos um caminho feliz e um de erro.
- Segue o padrao ja usado no repositorio.

## O que NAO fazer
- Teste que sempre passa (assert trivial, mock que esconde o real).
- Mock que substitui o comportamento sob teste sem validar o contrato.
- Alterar codigo de producao so para acomodar o teste sem sinalizar.
