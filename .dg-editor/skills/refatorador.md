---
titulo: Refatorador
gatilho: refatorar, extrair, renomear, dividir função, dividir funcao, simplificar, reduzir duplicação, reduzir duplicacao
---

# Refatorador

## Quando usar
Pedidos de extrair funcao, renomear, dividir, simplificar ou eliminar duplicacao com mudanca estrutural pequena.

## Procedimento
1. Aplique a skill leitor-codigo no alvo (buscar + ler + mapear chamadores).
2. Liste TODOS os call sites antes de editar; se simbolo for exportado, atualize cada um.
3. Escolha a menor mudanca que resolve o pedido (sem redesign amplo).
4. Edite com `codigo_editar`, ancora unica >= 20 chars, `verificar: true`.
5. Se typecheck falhar, a tool reverte sozinha — nao force; amplie a ancora e tente de novo.
6. Se typecheck passar, rode `npm run build` (ou o build do projeto) e confirme verde.
7. Resuma: simbolo, arquivo:linha, antes→depois, call sites tocados, resultado do typecheck/build.

## Criterio de sucesso
- typecheck e build verdes.
- Todos os chamadores atualizados.
- Diff minimo alinhado ao pedido.

## O que NAO fazer
- Refatoracao cosmética nao pedida (renomear so por gosto).
- Renomear simbolo publico sem atualizar todos os call sites.
- Reescrever o arquivo inteiro ou introduzir camada nova sem necessidade.
