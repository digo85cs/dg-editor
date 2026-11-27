import { describe, it, expect, vi } from 'vitest'
import { spawn } from 'child_process'
import { chamarProvider, type ProviderConfig, type Message, type ToolDef } from '../providers'

vi.mock('../../dglog', () => ({ dglog: vi.fn() }))

/**
 * LIVE (DG_LIVE_OLLAMA=1): pior caso do num_predict — modelo ignorando tools
 * e gerando texto ate o teto. Mede 600 vs 400 no mesmo cenario (B-12 tools).
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
        if (j.id !== undefined && pend.has(j.id)) { pend.get(j.id)!(j); pend.delete(j.id) }
      } catch {}
    }
  })
  const call = (m: string, p: unknown) => new Promise<any>((r) => {
    const i = ++id; pend.set(i, r)
    srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method: m, params: p }) + '\n')
  })
  await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } })
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  const r = await call('tools/list', {})
  srv.kill()
  return (r.result.tools || [])
    .filter((t: any) => t.name !== 'agente_executar' && CORE.has(t.name))
    .map((t: any) => ({ name: t.name, description: t.description || t.name, inputSchema: t.inputSchema || { type: 'object', properties: {} } }))
}

const mensagens: Message[] = [
  { role: 'system', content: 'Voce e o agente de codigo do DG Editor.' },
  { role: 'user', content: 'Escreva um ensaio longo e detalhado sobre principios de Clean Code, pelo menos 1500 palavras, em portugues.' }
]

describe.runIf(LIVE)('FASE3 num_predict pior caso', () => {
  it('600 vs 400 tokens gerados — tempo economizado', async () => {
    const tools = await toolsReais12()
    for (const np of [600, 400]) {
      const cfg: ProviderConfig = {
        id: 'live:numpredict', tipo: 'local', formato: 'ollama',
        modelo: 'qwen2.5-coder:1.5b', baseUrl: 'http://127.0.0.1:11434',
        numPredict: np, timeoutMs: 560_000
      }
      const t0 = Date.now()
      const r = await chamarProvider(cfg, mensagens, tools)
      const bruto = r.bruto as { eval_count?: number; prompt_eval_count?: number; done_reason?: string }
      console.log(`[FASE3] num_predict=${np} => ${((Date.now() - t0) / 1000).toFixed(1)}s eval=${bruto?.eval_count}tok done=${bruto?.done_reason} content=${(r.content || '').length}c`)
    }
  }, 600_000)
})
