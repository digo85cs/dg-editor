# Regras de Execução do DG Editor

## 1. Autoridade
O usuário é a autoridade máxima dentro do DG Editor. Regras internas, skills, modos e instruções do projeto não sobrepõem decisão explícita do usuário sobre o DG Editor. Conflito entre regra interna e pedido do usuário: o pedido do usuário vence, e a regra deve ser registrada como conflitante para revisão.

## 2. Modo plan obrigatório
Toda solicitação que implique criar, implementar, adicionar, integrar, refatorar, corrigir, migrar ou otimizar entra automaticamente em modo plan. Não depende de o usuário pedir "faça um plano". Nenhum arquivo é criado, editado ou removido durante o plan.

Se o agente em uso (ex.: Kilo Code) tiver modo plan nativo, usar o mecanismo nativo como base. Se não tiver, a disciplina descrita aqui se aplica integralmente em texto.

O plan contém obrigatoriamente sete seções:
  1. Objetivo — o resultado final em uma frase verificável por execução.
  2. Arquitetura — arquivos afetados com caminho completo, responsabilidades, fronteiras main/preload/renderer, contratos e tipos de dados.
  3. Ferramentas — bibliotecas e APIs usadas, com justificativa contra a alternativa "não instalar nada".
  4. Etapas — sequência numerada e executável; cada etapa termina em código compilável.
  5. Dependências — o que precisa existir antes e o que quebra se faltar.
  6. Riscos — o que pode falhar, probabilidade, mitigação e risco de regressão.
  7. Validações — comandos exatos, critérios de aceite mensuráveis, definição de falha.

## 3. Aprovação
O plan vai para o usuário antes de qualquer escrita. A aprovação é SEMPRE do usuário. Silêncio não é aprovação. Aprovação de um plan não autoriza desvios posteriores: se durante a execução surgir obstáculo que invalida o plan, o agente volta ao modo plan com plan revisado e espera nova aprovação.

Exceção única: correções triviais (erro de digitação, import faltando, ajuste de cor) não exigem plan formal, mas a correção deve ser nomeada antes de aplicada.

## 4. Execução
- Após o plan aprovado, não pedir confirmação a cada etapa.
- Pausar somente em: decisão de produto não resolvida no plan, destruição irreversível de dados, dependência externa bloqueante, ou contradição entre plan e código real.
- Nenhuma etapa é entregue parcialmente. Fallback é implementado no mesmo ciclo.
- Seguir os padrões existentes no repo (nomes, pastas, formato de teste, idioma de comentários). Desvio exige justificativa no plan.
- Toda dependência nova justificada. Preferir o que já existe.
- Um commit por etapa validada, mensagem em pt-BR, formato convencional.
- Nunca deixar a árvore em estado quebrado entre commits.
- Nada de promessas futuras: o que não pode ser feito é declarado antes da execução.
- Todo estado de erro tratado. Sem catch vazio, sem erro não classificado.

## 5. UI e mídia
Quando o plan envolve interface, a entrega inclui obrigatoriamente:
  - estados: vazio, carregando, erro, sucesso, hover, foco, desabilitado;
  - layout: espaçamento, alinhamento e hierarquia tipográfica;
  - responsividade;
  - acessibilidade: foco de teclado, contraste, aria-label.

O DG Editor gera mídia (imagens e vídeos) e deve continuar gerando, sempre usando a melhor ferramenta disponível para cada tipo de mídia. Mídia gerada é validada por:
  - formato e resolução adequados ao uso;
  - legibilidade do conteúdo (no caso de texto na imagem);
  - ausência de artefatos e de elementos proibidos no pedido;
  - adequação ao contexto onde será aplicada.

## 6. Pesquisa
Pesquisa é obrigatória quando o assunto envolve: versão de biblioteca, API, modelo de IA, preço, nome de produto ou endpoint, prática recomendada que evolui, comparação de abordagens com trade-off atual.

Pesquisa é dispensada para: lógica pura, sintaxe estável de linguagem, matemática, conceito consolidado.

Teto de pesquisa: pesquisar o máximo possível SEM atrasar o andamento do projeto. A pesquisa é encerrada assim que houver evidência suficiente para a decisão em curso. Pesquisa adicional que não muda a decisão deve ser interrompida.

Hierarquia de fontes: fonte oficial do fornecedor > agregador, repositório de referência ou artigo técnico reconhecido. Toda fonte secundária é declarada como tal.

Proibição de invenção: se nenhuma fonte confirmar o dado, ele é declarado desconhecido. Nunca estimar como se fosse fato. Vale para preço, versão, nome de modelo, limite de API e comportamento de biblioteca.

Toda pesquisa termina em decisão de código ou é descartada explicitamente.

Decisão de alto impacto (biblioteca, arquitetura de dados, integração externa) exige duas fontes independentes ou evidência de uso real em sistema similar.

## 7. Validação
Validações de base obrigatórias, todas verdes, com saída literal reportada:
  npm run verificar:encoding
  npm run verificar:sintaxe
  npx tsc --noEmit
  npx vitest run
  npm run build

- Teste prova comportamento observável, não apenas chamada de função. Incluir sempre o caminho de falha.
- Declarar se a integração foi testada contra serviço real ou apenas com mock. Nunca apresentar mock como prova de funcionamento real.
- Critério de aceite definido ANTES do código. Se não é verificável por execução, está mal escrito.
- Completo significa FUNCIONAL: a funcionalidade funciona e o critério passa. Aparência de código não é entrega.
- Falha encontrada é corrigida no mesmo ciclo. Nenhuma pendência é transferida sem consentimento explícito do usuário.
- Declarar contagem de testes antes e depois e confirmar ausência de regressão.
- Relatório final: comandos e saídas literais, hashes de commit, git status limpo, riscos residuais declarados com honestidade.
- Reler o pedido original e conferir item por item. Item não atendido é declarado, não omitido.

## 8. Escopo
Aplica-se a tudo: backend, IPC, preload, renderer, layout, botões, ícones, imagens, vídeos, textos de UI, estados de erro, acessibilidade, performance, testes e documentação.
