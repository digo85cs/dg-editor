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

import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

function caminhoExternos(raiz: string): string {
  return join(raiz, '.dg-editor', 'mcp-externos.json')
}

export function lerExternosMcp(raiz: string): { servidores: Array<Record<string, unknown>> } {
  try {
    const cfg = JSON.parse(readFileSync(caminhoExternos(raiz), 'utf8'))
    return { servidores: Array.isArray(cfg?.servidores) ? cfg.servidores : [] }
  } catch {
    return { servidores: [] }
  }
}

export function idsExternosAtivos(raiz: string): Set<string> {
  const s = new Set<string>()
  for (const srv of lerExternosMcp(raiz).servidores) {
    const nome = String((srv as Record<string, unknown>).nome || '')
    if (nome) s.add(nome)
  }
  return s
}

export function instalarMcpCatalogo(
  raiz: string,
  id: string
): { ok: boolean; erro?: string; item?: McpServidorCatalogo } {
  const item = lerCatalogoMcp().find((s) => s.id === id)
  if (!item) return { ok: false, erro: 'MCP desconhecido: ' + id }
  const { servidores } = lerExternosMcp(raiz)
  if (servidores.some((s) => String(s.nome || '') === item.id)) {
    return { ok: false, erro: item.id + ' já está ativo em mcp-externos.json.' }
  }
  const c = item.config as { command?: string; args?: string[]; env?: Record<string, string> }
  servidores.push({
    nome: item.id,
    comando: c.command,
    args: c.args || [],
    env: c.env || {},
    habilitado: true
  })
  mkdirSync(join(raiz, '.dg-editor'), { recursive: true })
  writeFileSync(caminhoExternos(raiz), JSON.stringify({ servidores }, null, 2) + '\n', 'utf8')
  return { ok: true, item }
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
    },
    {
      id: 'context7',
      nome: 'Context7',
      descricao: 'Docs atualizadas de bibliotecas/frameworks direto no agente (Upstash, em alta no GitHub)',
      comando: 'npx -y @upstash/context7-mcp',
      config: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] }
    },
    {
      id: 'serena',
      nome: 'Serena',
      descricao: 'Toolkit semântico de código: símbolos, referências e edições seguras (oraios/serena)',
      comando: 'uvx --from git+https://github.com/oraios/serena serena start-mcp-server',
      config: { command: 'uvx', args: ['--from', 'git+https://github.com/oraios/serena', 'serena', 'start-mcp-server'] }
    },
    {
      id: 'chrome-devtools',
      nome: 'Chrome DevTools',
      descricao: 'Depuração e automação do Chrome real via CDP (performance, network, console)',
      comando: 'npx -y chrome-devtools-mcp@latest',
      config: { command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest'] }
    },
    {
      id: 'apify',
      nome: 'Apify',
      descricao: 'Web scraping e automação de atores prontos (requer APIFY_TOKEN)',
      comando: 'npx -y apify-mcp-server',
      config: { command: 'npx', args: ['-y', 'apify-mcp-server'], env: { APIFY_TOKEN: '<token>' } }
    },
    {
      id: 'gitlab',
      nome: 'GitLab',
      descricao: 'MRs, pipelines, issues e projetos GitLab (66 tools; requer GITLAB_TOKEN; Node >= 24)',
      comando: 'npx -y @structured-world/gitlab-mcp',
      config: {
        command: 'npx',
        args: ['-y', '@structured-world/gitlab-mcp'],
        env: { GITLAB_TOKEN: '<token>', GITLAB_API_URL: 'https://gitlab.com' }
      }
    },
    {
      id: 'bitbucket',
      nome: 'Bitbucket',
      descricao: 'PRs, repos e CI do Bitbucket Cloud (requer BITBUCKET_TOKEN/EMAIL/USERNAME)',
      comando: 'npx -y @nexus2520/bitbucket-mcp-server',
      config: {
        command: 'npx',
        args: ['-y', '@nexus2520/bitbucket-mcp-server'],
        env: { BITBUCKET_TOKEN: '<token>', BITBUCKET_EMAIL: '<email>', BITBUCKET_USERNAME: '<user>' }
      }
    },
    {
      id: 'azure-devops',
      nome: 'Azure DevOps',
      descricao: 'Repos, pipelines, work items e wikis do Azure DevOps (requer organization + PAT)',
      comando: 'npx -y @azure-devops/mcp <organizacao>',
      config: {
        command: 'npx',
        args: ['-y', '@azure-devops/mcp', '<organizacao>'],
        env: { AZURE_DEVOPS_EXT_PAT: '<pat>' }
      }
    },
    {
      id: 'forgejo-gitea',
      nome: 'Forgejo/Gitea/Codeberg',
      descricao: '457 tools para Forgejo, Gitea e Codeberg: repos, issues, PRs, Actions (requer FORGEJO_URL + token)',
      comando: 'npx -y @ric_/forgejo-mcp',
      config: {
        command: 'npx',
        args: ['-y', '@ric_/forgejo-mcp'],
        env: { FORGEJO_URL: 'https://codeberg.org', FORGEJO_TOKEN: '<token>' }
      }
    }
  ]
}
