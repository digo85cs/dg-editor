import { describe, expect, it } from 'vitest'
import { chamarProvider, type ProviderConfig, type ToolDef } from '../providers'

// Prova live: DG_LIVE_RESCUE=1 npx vitest run rescue-live
// Mesmo prompt de tool_call nos 3 modelos locais; mostra nativo vs resgatado.
const LIVE = process.env.DG_LIVE_RESCUE === '1'

const TOOLS: ToolDef[] = [
  {
    name: 'codigo_ler',
    description: 'Le um arquivo do projeto e devolve o conteudo.',
    inputSchema: {
      type: 'object',
      properties: { caminho: { type: 'string' } },
      required: ['caminho']
    }
  },
  {
    name: 'codigo_criar',
    description: 'Cria um arquivo novo no projeto.',
    inputSchema: {
      type: 'object',
      properties: { caminho: { type: 'string' }, conteudo: { type: 'string' } },
      required: ['caminho', 'conteudo']
    }
  },
  {
    name: 'terminal_exec',
    description: 'Executa um comando no terminal.',
    inputSchema: {
      type: 'object',
      properties: { comando: { type: 'string' } },
      required: ['comando']
    }
  }
]

const MSGS = [
  {
    role: 'system' as const,
    content:
      'Voce e um agente. Para ler um arquivo use a tool codigo_ler. Responda SOMENTE com a tool call.'
  },
  { role: 'user' as const, content: 'Leia o arquivo soma.ts usando a tool codigo_ler.' }
]

describe.skipIf(!LIVE)('rescue live nos modelos locais', () => {
  for (const modelo of ['qwen2.5-coder:1.5b', 'qwen2.5-coder:3b', 'qwen2.5-coder:7b']) {
    it(modelo + ' — nativo ou resgatado', async () => {
      const cfg: ProviderConfig = {
        id: 'ollama-local',
        tipo: 'local',
        formato: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        modelo,
        timeoutMs: 300_000,
        numPredict: 400
      }
      const t0 = Date.now()
      const r = await chamarProvider(cfg, MSGS as never, TOOLS)
      const ms = Date.now() - t0
      const nativo =
        (r.bruto as { message?: { tool_calls?: unknown[] } })?.message?.tool_calls?.length ?? 0
      console.log(
        '[live] modelo=' + modelo + ' ms=' + ms +
        ' nativo=' + nativo +
        ' resgatado=' + r.tool_calls.length +
        ' tool=' + (r.tool_calls[0]?.function?.name || '-') +
        ' content=' + JSON.stringify((r.content || '').slice(0, 160))
      )
      expect(r.tool_calls.length + nativo).toBeGreaterThan(0)
    }, 320_000)
  }
})
