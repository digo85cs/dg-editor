/**
 * Temas de pesquisa do Radar Diário do DG Editor.
 *
 * Cada tema contem:
 * - nome: identificador do tema
 * - queries: termos de busca para encontrar informacoes atualizadas
 * - observar: o que observar em cada resultado (features, UX, preco, diferencial)
 */
export const TEMAS_RADAR: { nome: string; queries: string[]; observar: string[] }[] = [
  {
    nome: 'editores de codigo com IA',
    queries: [
      'melhores editores de codigo com IA 2024 2025',
      'IDE com inteligencia artificial para programacao comparativa'
    ],
    observar: ['features de IA integradas, UX do editor, preco por usuario, diferencial competitivo']
  },
  {
    nome: 'agentes de codigo autonomos',
    queries: [
      'agentes de codigo autonomos tipo Devin 2024 2025',
      'agente de programacao que executa tarefas sozinho'
    ],
    observar: ['nivel de autonomia, tarefas que executa sem intervencao humana, custo por tarefa']
  },
  {
    nome: 'memoria persistente para agentes',
    queries: [
      'memoria persistente para agentes de IA longa duracao',
      'agente com memoria de longo prazo contexto persistente'
    ],
    observar: ['como armazena memoria, quanto contexto retem, custo de armazenamento']
  },
  {
    nome: 'compressao de contexto',
    queries: [
      'compressao de contexto LLM janela de contexto grande',
      'tecnicas de resumo e compressao para modelos de linguagem'
    ],
    observar: ['taxa de compressao, qualidade apos compressao, impacto em custo']
  },
  {
    nome: 'MCP servers',
    queries: [
      'MCP servers Model Context Protocol lista servidores',
      'servidores MCP para ferramentas de desenvolvimento'
    ],
    observar: ['quantidade de servidores disponiveis, facilidade de integracao, casos de uso']
  },
  {
    nome: 'IDEs com IA integrada',
    queries: [
      'IDEs com inteligencia artificial integrada 2024 2025',
      'editor de codigo com copilot integrado alternativas'
    ],
    observar: ['ferramentas de IA nativas na IDE, preco, modelos suportados, diferencial']
  }
]
