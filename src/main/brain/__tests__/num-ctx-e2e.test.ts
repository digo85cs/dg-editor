import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'

vi.mock('../../dglog', () => ({ dglog: vi.fn() }))
import { dglog } from '../../dglog'
import { chamarProvider, type ProviderConfig, type Message, type ToolDef } from '../providers'

/**
 * Prova FASE 2: num_ctx derivado do prompt + reducao de tools quando o
 * prompt nao cabe no contexto do modelo — sem truncamento silencioso.
 * Ollama falso: /api/show devolve context_length=8192; /api/chat captura
 * o corpo e responde um tool_call.
 */

let server: Server
let baseUrl = ''
let ultimoCorpo: Record<string, unknown> | null = null

function toolsFake(n: number, bytesCada = 450): ToolDef[] {
  // ~450 bytes/tool ~= payload real das 102 tools MCP (~46KB)
  return Array.from({ length: n }, (_, i) => ({
    name: i < 16 ? CORE[i] : 'midia_tool_' + i,
    description: 'desc tool ' + i + ' ' + 'x'.repeat(bytesCada),
    inputSchema: {
      type: 'object',
      properties: { arg: { type: 'string', description: 'y'.repeat(120) } }
    }
  }))
}
const CORE = [
  'codigo_ler', 'codigo_editar', 'codigo_criar', 'codigo_buscar', 'terminal_exec',
  'projeto_arvore', 'projeto_smoke', 'disco_buscar', 'disco_inspecionar',
  'git_status', 'git_diff', 'testes_rodar', 'vault_read', 'vault_write',
  'dossie_read', 'dossie_write'
]

const mensagens: Message[] = [
  { role: 'system', content: 'Voce e o agente de codigo do DG Editor.' },
  { role: 'user', content: '[MISSAO AGENTE — corrigir soma.test.ts. Criterio: npx vitest run exit 0.]' },
  {
    role: 'assistant',
    content: '',
    tool_calls: [{ function: { name: 'codigo_ler', arguments: { nome: 'soma.test.ts' } } }]
  },
  { role: 'tool', content: '{"ok":true,"texto":"return a - b"}', tool_name: 'codigo_ler' }
]

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json')
      if (req.url === '/api/show') {
        res.end(JSON.stringify({ model_info: { 'qwen2.context_length': 8192 } }))
        return
      }
      if (req.url === '/api/chat') {
        ultimoCorpo = JSON.parse(body)
        res.end(
          JSON.stringify({
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [{ function: { name: 'codigo_ler', arguments: '{}' } }]
            },
            done: true,
            prompt_eval_count: 5000,
            eval_count: 20
          })
        )
        return
      }
      res.statusCode = 404
      res.end('{}')
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  baseUrl = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
})

afterAll(() => server.close())

function cfg(): ProviderConfig {
  return {
    id: 'teste:ollama',
    tipo: 'local',
    formato: 'ollama',
    modelo: 'fake-qwen:7b',
    baseUrl,
    numPredict: 400,
    timeoutMs: 10_000
  }
}

describe('FASE2 num_ctx derivado + tools reduzidas', () => {
  it('A) 102 tools com ctx 8192: reduce tools, num_ctx<=8192, tool_call volta', async () => {
    ultimoCorpo = null
    const r = await chamarProvider(cfg(), mensagens, toolsFake(102))
    const corpo = ultimoCorpo as {
      options: { num_ctx: number; num_predict: number }
      tools: Array<{ function: { name: string } }>
    }
    expect(corpo).toBeTruthy()
    // num_ctx nunca passa do contexto do modelo
    expect(corpo.options.num_ctx).toBeLessThanOrEqual(8192)
    expect(corpo.options.num_ctx).toBeGreaterThanOrEqual(4096)
    // tools reduzidas — nao couberam todas
    expect(corpo.tools.length).toBeLessThan(102)
    expect(corpo.tools.length).toBeGreaterThan(0)
    // intocaveis prioritarios permanecem
    const nomes = corpo.tools.map((t) => t.function.name)
    expect(nomes).toContain('terminal_exec')
    // resposta: tool_call parseado
    expect(r.tool_calls).toHaveLength(1)
    expect(r.tool_calls[0].function.name).toBe('codigo_ler')
    // log registrou a reducao
    const logs = vi.mocked(dglog).mock.calls.map((c) => String(c[0])).join('\n')
    expect(logs).toContain('[ctx]')
    expect(logs).toMatch(/removidas=\d+/)
  })

  it('B) 12 tools: nada removido, num_ctx derivado do prompt', async () => {
    ultimoCorpo = null
    vi.mocked(dglog).mockClear()
    const r = await chamarProvider(cfg(), mensagens, toolsFake(12, 200))
    const corpo = ultimoCorpo as {
      options: { num_ctx: number }
      tools: unknown[]
    }
    expect(corpo.tools).toHaveLength(12)
    expect(corpo.options.num_ctx).toBeGreaterThanOrEqual(4096)
    expect(corpo.options.num_ctx).toBeLessThanOrEqual(8192)
    expect(r.tool_calls).toHaveLength(1)
    const logs = vi.mocked(dglog).mock.calls.map((c) => String(c[0])).join('\n')
    expect(logs).toContain('[ctx]')
    expect(logs).not.toMatch(/removidas=[1-9]/)
  })
})
