import { describe, it } from 'vitest'

// FASE 1 — medicao manual: so roda com DG_FASE1=1 (demora minutos no Ollama).
const RUN = !!process.env.DG_FASE1
import path from 'path'
import { chamarProvider, type ProviderConfig, type Message, type ToolDef } from '../providers'
import { listarTools, garantirMcpNaRaiz } from '../../mcp/client'
import { ferramentasInlineDefs } from '../tools-inline'

// FASE 1 — isola o efeito do TAMANHO DAS TOOLS no provider:
// mesma mensagem, mesmo modelo, 102 tools vs 12 tools, timed.
const RAIZ = path.resolve(process.cwd(), '.dg-editor', 'qa', 'fase3')
const cfg: ProviderConfig = {
  id: 'medicao',
  tipo: 'local',
  formato: 'ollama',
  modelo: 'qwen2.5-coder:7b',
  baseUrl: 'http://127.0.0.1:11434',
  numPredict: 1024,
  timeoutMs: 240_000
}

const MSGS: Message[] = [
  { role: 'system', content: 'Voce e um agente de codigo. Use as tools para corrigir o teste quebrado em soma.test.ts.' },
  { role: 'user', content: 'O teste em soma.test.ts esta falhando. Corrija o bug e faca o teste passar. Criterio: npx vitest run exit 0.' },
  { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'codigo_ler', arguments: { nome: 'soma.test.ts' } } }] },
  { role: 'tool', tool_name: 'codigo_ler', tool_call_id: 'c1', name: 'codigo_ler', content: '{"ok":true,"texto":"1 import { describe, expect, it } from \'vitest\'\\n5 return a - b"}' }
]

async function medir(nome: string, tools: ToolDef[]) {
  const t0 = Date.now()
  try {
    const r = await chamarProvider(cfg, MSGS, tools)
    const ms = Date.now() - t0
    console.log('[FASE1] ' + nome + ' tools=' + tools.length + ' => ' + ms + 'ms tool_calls=' + (r.tool_calls || []).length + ' content=' + (r.content || '').length + 'c')
    return ms
  } catch (e) {
    const ms = Date.now() - t0
    console.log('[FASE1] ' + nome + ' tools=' + tools.length + ' => ' + ms + 'ms ERRO=' + String((e as Error)?.message || e).slice(0, 120))
    return ms
  }
}

describe.skipIf(!RUN)('FASE 1 — efeito do numero de tools no tempo do provider', () => {
  it('102 tools vs 12 tools, mesmo modelo e mensagens', async () => {
    process.env.DG_ROOT = RAIZ
    await garantirMcpNaRaiz(RAIZ)
    const todas = (await listarTools()).filter((t) => t.name !== 'agente_executar')
    const defs: ToolDef[] = todas.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
    console.log('[FASE1] total tools MCP=' + defs.length + ' bytes=' + JSON.stringify(defs).length)

    const CORE = new Set([
      'projeto_arvore', 'codigo_buscar', 'codigo_ler', 'codigo_editar', 'codigo_criar',
      'terminal_exec', 'disco_buscar', 'disco_inspecionar', 'git_status', 'git_diff',
      'testes_rodar', 'vault_read'
    ])
    const reduzido = defs.filter((t) => CORE.has(t.name))
    console.log('[FASE1] conjunto reduzido=' + reduzido.length + ' bytes=' + JSON.stringify(reduzido).length)

    await medir('A-102tools', defs)
    await medir('B-12tools', reduzido)
    delete process.env.DG_ROOT
  }, 600_000)
})
