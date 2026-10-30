import { lerConfigOpenClaw } from './config'
import { lerToken } from './secrets'
import { montarContextoTexto, type ContextoOpenClaw } from './contexto'

export const TOOL_PROPOSE_DIFFS = 'dg_propose_file_diffs'

export type EditProposta = {
  path: string
  unifiedDiff: string
}

const TOOL_DEF = {
  type: 'function' as const,
  function: {
    name: TOOL_PROPOSE_DIFFS,
    description:
      'Propose file edits as unified diffs for the DG Editor. Never execute shell. The user must approve each file.',
    parameters: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              unifiedDiff: { type: 'string' }
            },
            required: ['path', 'unifiedDiff']
          }
        }
      },
      required: ['edits']
    }
  }
}

export async function pedirOpenClaw(ctx: ContextoOpenClaw): Promise<{
  ok: boolean
  edits?: EditProposta[]
  mensagem?: string
  erro?: string
  rawFinish?: string
}> {
  const cfg = lerConfigOpenClaw()
  const token = lerToken()
  if (!token) return { ok: false, erro: 'token OpenClaw nao configurado' }

  const userContent = montarContextoTexto(ctx, cfg.maxContextBytes)
  const system =
    'Voce e um assistente de codigo para o DG Editor. ' +
    'Para qualquer edicao de arquivo, chame a tool dg_propose_file_diffs com unified diffs. ' +
    'Nao execute shell. Nao invente caminhos fora do projeto. ' +
    'Se nao houver edicao, responda em texto curto sem tool.'

  const body = {
    model: cfg.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent }
    ],
    tools: [TOOL_DEF],
    tool_choice: {
      type: 'function',
      function: { name: TOOL_PROPOSE_DIFFS }
    }
  }

  const url = cfg.endpoint.replace(/\/$/, '') + '/v1/chat/completions'
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), cfg.timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: ac.signal
    })
    const text = await res.text()
    if (!res.ok) {
      return { ok: false, erro: 'HTTP ' + res.status + ': ' + text.slice(0, 400) }
    }
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      return { ok: false, erro: 'resposta nao-JSON' }
    }
    return parseRespostaChat(json)
  } catch (e) {
    const msg = String((e as Error).message || e)
    if ((e as Error).name === 'AbortError') return { ok: false, erro: 'timeout OpenClaw' }
    return { ok: false, erro: msg }
  } finally {
    clearTimeout(timer)
  }
}

export function parseRespostaChat(json: unknown): {
  ok: boolean
  edits?: EditProposta[]
  mensagem?: string
  erro?: string
  rawFinish?: string
} {
  const root = json as {
    choices?: Array<{
      finish_reason?: string
      message?: {
        content?: string | null
        tool_calls?: Array<{
          function?: { name?: string; arguments?: string }
        }>
      }
    }>
  }
  const choice = root?.choices?.[0]
  if (!choice) return { ok: false, erro: 'sem choices na resposta' }
  const msg = choice.message
  const calls = msg?.tool_calls || []
  const edits: EditProposta[] = []
  for (const c of calls) {
    if (c.function?.name !== TOOL_PROPOSE_DIFFS) continue
    try {
      const args = JSON.parse(c.function.arguments || '{}') as {
        edits?: Array<{ path?: string; unifiedDiff?: string }>
      }
      for (const e of args.edits || []) {
        if (typeof e.path === 'string' && typeof e.unifiedDiff === 'string') {
          edits.push({ path: e.path, unifiedDiff: e.unifiedDiff })
        }
      }
    } catch {
      return { ok: false, erro: 'arguments da tool invalidos' }
    }
  }
  const content = typeof msg?.content === 'string' ? msg.content : ''
  if (edits.length) return { ok: true, edits, mensagem: content || undefined, rawFinish: choice.finish_reason }
  return {
    ok: true,
    edits: [],
    mensagem: content || '(sem diffs propostos)',
    rawFinish: choice.finish_reason
  }
}
