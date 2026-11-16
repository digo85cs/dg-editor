/**
 * Catálogo curado de MCP servers externos (estilo marketplace).
 * Ativação: copiar o bloco do servidor para .dg-editor/mcp-externos.json.
 */

export interface McpServidorCatalogo {
  id: string
  nome: string
  descricao: string
  comando: string
  config: Record<string, unknown>
}

export function lerCatalogoMcp(): McpServidorCatalogo[] {
  return [
    {
      id: 'filesystem',
      nome: 'Filesystem',
      descricao: 'Acesso a arquivos fora do workspace (leitura/escrita controlada)',
      comando: 'npx -y @modelcontextprotocol/server-filesystem <diretorio>',
      config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '<diretorio>'] }
    },
    {
      id: 'github',
      nome: 'GitHub',
      descricao: 'Issues, PRs, repos e código via API do GitHub',
      comando: 'npx -y @modelcontextprotocol/server-github',
      config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: '<token>' } }
    },
    {
      id: 'playwright',
      nome: 'Playwright',
      descricao: 'Automação de browser: navegação, cliques, screenshots, testes',
      comando: 'npx -y @playwright/mcp@latest',
      config: { command: 'npx', args: ['-y', '@playwright/mcp@latest'] }
    },
    {
      id: 'fetch',
      nome: 'Fetch',
      descricao: 'Busca e leitura de páginas web (HTML→texto)',
      comando: 'uvx mcp-server-fetch',
      config: { command: 'uvx', args: ['mcp-server-fetch'] }
    },
    {
      id: 'sqlite',
      nome: 'SQLite',
      descricao: 'Consulta e manipulação de bancos SQLite',
      comando: 'uvx mcp-server-sqlite --db-path <arquivo.db>',
      config: { command: 'uvx', args: ['mcp-server-sqlite', '--db-path', '<arquivo.db>'] }
    },
    {
      id: 'memory',
      nome: 'Memory',
      descricao: 'Grafo de conhecimento persistente entre sessões',
      comando: 'npx -y @modelcontextprotocol/server-memory',
      config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] }
    },
    {
      id: 'sequential-thinking',
      nome: 'Sequential Thinking',
      descricao: 'Raciocínio passo a passo estruturado para problemas complexos',
      comando: 'npx -y @modelcontextprotocol/server-sequential-thinking',
      config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] }
    }
  ]
}
