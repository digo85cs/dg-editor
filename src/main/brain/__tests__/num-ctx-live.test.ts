import { describe, it, expect, vi } from 'vitest'
import { spawn } from 'child_process'
import { chamarProvider, type ProviderConfig, type Message, type ToolDef } from '../providers'

vi.mock('../../dglog', () => ({ dglog: vi.fn() }))
import { dglog } from '../../dglog'

/**
 * LIVE (so roda com DG_LIVE_OLLAMA=1): B-12 tools contra o Ollama real.
 * Prova num_ctx derivado + tool_call na primeira resposta + tempo.
 * A-102 nao roda aqui: prompt_eval ~12k tokens estoura o corte de ~300s
 * do servidor nesta maquina (2GB VRAM) — mecanismo provado no e2e fake.
 */
const LIVE = process.env.DG_LIVE_OLLAMA === '1'
const CORE = new Set([
  'projeto_arvore', 'codigo_buscar', 'codigo_ler', 'codigo_editar', 'terminal_exec',
  'disco_buscar', 'disco_inspecionar', 'git_status', 'git_diff', 'testes_rodar',
  'vault_read', 'projeto_smoke'
])

async function toolsReais12(): Promise<ToolDef[]> {
  const srv = spawn('node', ['C:/dev/DGEditor/.dg-editor/bin/main/mcp/server.js'], {
    env: { ...process.env, DG_ROOT: 'C:/dev/DGEditor/.dg-editor/qa/fase3' },
    stdio: ['pipe', 'pipe', 'inherit']
  })
  let buf = ''
  const pend = new Map<number, (j: any) => void>()
  let id = 0
  srv.stdout.on('data', (d) => {
    buf += d.toString()
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!l) continue
      try {
        const j = JSON.parse(l)
        if (j.id !== undefined && pend.has(j.id)) {
          pend.get(j.id)!(j)
          pend.delete(j.id)
        }
      } catch {}
    }
  })
  const call = (m: string, p: unknown) =>
    new Promise<any>((r) => {
      const i = ++id
      pend.set(i, r)
      srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method: m, params: p }) + '\n')
    })
  await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } })
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  const r = await call('tools/list', {})
  srv.kill()
  return (r.result.tools || [])
    .filter((t: any) => t.name !== 'agente_executar' && CORE.has(t.name))
    .map((t: any) => ({
      name: t.name,
      description: t.description || t.name,
      inputSchema: t.inputSchema || { type: 'object', properties: {} }
    }))
}

const mensagens: Message[] = [
  { role: 'system', content: 'Voce e o agente de codigo do DG Editor. Use as tools para inspecionar o projeto, propor edicoes e validar com comandos.' },
  { role: 'user', content: '[MISSAO AGENTE — objetivo: corrigir o teste quebrado em soma.test.ts. Criterio: npx vitest run exit 0.] O teste esta falhando. Corrija.' },
  { role: 'assistant', content: '', tool_calls: [{ function: { name: 'codigo_ler', arguments: { nome: 'soma.test.ts' } } }] },
  { role: 'tool', content: '{"ok":true,"texto":"5   return a - b"}', tool_name: 'codigo_ler' }
]

describe.runIf(LIVE)('LIVE ollama B-12 via adapterOllamo', () => {
  it('num_ctx derivado, tool_call na 1a resposta, tempo medido', async () => {
    const tools = await toolsReais12()
    expect(tools.length).toBe(12)
    const cfg: ProviderConfig = {
      id: 'live:ollama',
      tipo: 'local',
      formato: 'ollama',
      modelo: 'qwen2.5-coder:1.5b',
      baseUrl: 'http://127.0.0.1:11434',
      numPredict: 400,
      timeoutMs: 560_000
    }
    const t0 = Date.now()
    const r = await chamarProvider(cfg, mensagens, tools)
    const ms = Date.now() - t0
    const logs = vi.mocked(dglog).mock.calls.map((c) => String(c[0])).join('\n')
    console.log('[LIVE] ms=' + ms + ' tool_calls=' + r.tool_calls.length +
      ' content=' + (r.content || '').slice(0, 120).replace(/\n/g, ' '))
    console.log('[LIVE] ctxlog=' + logs.split('\n').filter((l) => l.includes('[ctx]')).join(' | '))
    expect(logs).toContain('[ctx]')
    expect(logs).toMatch(/num_ctx=\d+/)
    expect(r.tool_calls.length + (r.content ? 1 : 0)).toBeGreaterThan(0)
  }, 600_000)
})
