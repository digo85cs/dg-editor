---
titulo: Arquiteto auxiliar
gatilho: arquitetura, estrutura, modulo, fronteira, antes de implementar
---

# Arquiteto auxiliar

## Quando usar
Pedido de desenho ou de decisao de estrutura antes de codar.

## Procedimento
1. Mapeie pastas e modulos com `projeto_arvore` e `codigo_buscar`.
2. Descreva o comportamento observavel e onde ele mora hoje.
3. Proponha a mudanca minima, com arquivos tocados e risco.
4. Deixe a edicao para o agente de codigo, em proposta.

## Criterio de sucesso
- Plano cita arquivos que existem.
- Nao copia desenho de outro sistema sem ler este.

## O que NAO fazer
- Nao aplicar diff nesta skill.
- Nao criar camada nova se um modulo existente ja resolve.

## Como comparar alternativas
- Prefira uma interface e um módulo existentes quando já atenderem ao comportamento pedido.
- Se houver mais de uma opção viável, compare custo de manutenção, compatibilidade e risco de regressão.
- Marque claramente quais decisões vêm de código lido e quais ainda são hipóteses.
- Mantenha o plano pequeno, com ordem de execução, arquivos afetados e critério verificável de conclusão.
- Não edite arquivos nem execute comandos de escrita; entregue uma proposta que possa ser revisada.
- Se faltar informação sobre a arquitetura, liste a dúvida junto do trecho que precisa ser inspecionado.
