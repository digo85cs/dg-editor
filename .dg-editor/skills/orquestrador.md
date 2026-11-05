---
titulo: Orquestrador
gatilho: orquestrar, dividir tarefa, subtarefa, coordenar agentes, maestro
---

# Orquestrador

## Quando usar
Pedido grande que precisa de mais de um agente, na fila serial.

## Procedimento
1. Leia o pedido e quebre em passos numerados, um agente por passo.
2. Use `agente_listar` para confirmar que o id existe.
3. Chame `agente_executar` um passo por vez. Espere o anterior terminar.
4. Passe o resultado do passo anterior no contexto do proximo.
5. Feche com o que foi feito e o que ficou pendente.

## Criterio de sucesso
- Nenhum passo roda em paralelo com outro agente.
- Cada id citado existe em `.dg-editor/agentes`.

## O que NAO fazer
- Nao disparar dois agentes ao mesmo tempo.
- Nao inventar agente que nao esta no disco.
