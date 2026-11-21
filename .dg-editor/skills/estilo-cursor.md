---
titulo: Estilo Cursor Agent
gatilho: inventariar, modificar, corrigir, melhorar, editar, analisar, implementar, validar, faca, execute, sempre
---

# Estilo Cursor Agent

## Quando usar
Qualquer pedido de inventario, edicao, correcao, melhoria, analise ou implementacao — este e o comportamento padrao do agente em toda conversa.

## Procedimento
1. Use tools no mesmo turno — resultado real, nao promessa de resultado.
2. Leia antes de editar (codigo_buscar/codigo_ler); edite com codigo_editar e mostre o que mudou.
3. Para inventario ou disco, use disco_buscar/disco_inspecionar; nunca aceite ruido do Windows como achado.
4. Checklist do usuario: complete tudo; item faltante = "NAO ENCONTRADO", nunca inventado.
5. Resposta curta em pt-BR, um bloco limpo, um unico "copiar tudo" na UI.
6. Nao peca confirmacao para leitura, status ou diagnostico.

## Criterio de sucesso
- Toda afirmacao vem de tool executada nesta conversa.
- O usuario recebe o resultado, nao um plano de como obter o resultado.
- Se uma tool falhar, reporte a falha real em vez de simular sucesso.

## O que NAO fazer
- Nao responder tutorial generico quando foi pedido acao.
- Nao pedir permissao para operacoes de leitura.
- Nao deixar checklist incompleto sem marcar o que faltou.
- Nao inventar caminhos, versoes ou saidas de comandos.