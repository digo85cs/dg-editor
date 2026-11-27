/**
 * num_ctx derivado do prompt real (mensagens + tools).
 *
 * Defeito historico: num_ctx fixo em 8192 enquanto o prompt do agente com
 * ~100 tools MCP passa de 11k tokens — o Ollama truncava os schemas em
 * silencio e o modelo nunca emitia tool_call, gerando texto ate
 * num_predict (~200-400s nesta maquina).
 *
 * Politica:
 *  - tokensEstimados = bytes(JSON mensagens+tools) / 4
 *  - num_ctx = clamp(ceil(tokensEstimados * 1.3), 4096, contextoMaxDoModelo)
 *  - se mesmo no teto o prompt nao couber, remove tools do pacote
 *    (menos relevantes por categoria, deterministico) ate caber —
 *    nunca deixa o Ollama truncar por conta propria.
 */
import { dglog } from '../dglog'

const OLLAMA_DEFAULT = 'http://127.0.0.1:11434'
const PISO_CTX = 4096
const MARGEM = 1.3

interface MsgMin {
  role: string
  content?: unknown
  tool_calls?: unknown
  tool_name?: string
}
interface ToolMin {
  name: string
  description?: string
  inputSchema?: unknown
}

/** Tools essenciais de missao de codigo — as ultimas a sair do pacote. */
const TOOLS_INTOCAVEIS = new Set([
  'codigo_ler',
  'codigo_editar',
  'codigo_criar',
  'codigo_buscar',
  'terminal_exec',
  'projeto_arvore',
  'projeto_smoke',
  'disco_buscar',
  'disco_inspecionar',
  'git_status',
  'git_diff',
  'testes_rodar',
  'vault_read',
  'vault_write',
  'dossie_read',
  'dossie_write'
])

/**
 * Ordem de corte das tools descartaveis: midia/social/deploy/provisionamento
 * primeiro (nunca sao necessarias para ler/editar codigo), depois o resto na
 * ordem inversa de relevancia. Deterministico: empate mantem ordem original.
 */
function prioridadeCorte(name: string): number {
  const n = name.toLowerCase()
  if (/midia_|midia$|video|audio|legenda|thumbnail|meme|social|publica|deploy|provisiona|app_|apps_/.test(n)) return 0
  if (/vault_|dossie_|memoria_|lembrete|notificacao/.test(n)) return 1
  if (/nuvem|cloud|externo|mcp_|browser|screenshot|playwright/.test(n)) return 2
  return 3
}

function bytesDe(valor: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(valor) ?? '', 'utf8')
  } catch {
    return 0
  }
}

/** tokens estimados (regra bytes/4) do conjunto mensagens+tools. */
export function estimarTokensPrompt(
  mensagens: MsgMin[],
  tools?: ToolMin[] | null
): number {
  const bytes =
    bytesDe(mensagens) +
    (tools && tools.length ? bytesDe(tools.map((t) => ({ type: 'function', function: t }))) : 0)
  return Math.ceil(bytes / 4)
}

const cacheContexto = new Map<string, number>()

/** Contexto real do modelo via /api/show (*.context_length). Fallback: 8192. */
export async function contextoMaxModelo(
  modelo: string,
  baseUrl: string = OLLAMA_DEFAULT
): Promise<number> {
  const hit = cacheContexto.get(modelo)
  if (hit) return hit
  let ctx = 0
  try {
    const r = await fetch(baseUrl.replace(/\/$/, '') + '/api/show', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelo }),
      signal: AbortSignal.timeout(8000)
    })
    if (r.ok) {
      const j = (await r.json()) as { model_info?: Record<string, unknown> }
      const info = j.model_info || {}
      for (const [k, v] of Object.entries(info)) {
        if (/context_length$/.test(k) && typeof v === 'number' && v > 0) {
          ctx = v
          break
        }
      }
    }
  } catch {
    /* offline → fallback */
  }
  if (!ctx) ctx = 8192
  cacheContexto.set(modelo, ctx)
  return ctx
}

export interface AjusteCtx {
  numCtx: number
  tokensEstimados: number
  contextoMax: number
  /** tools removidas para caber (vazio = nada removido) */
  removidas: string[]
  /** prompt estimado passou de 80% do num_ctx */
  pertoDoLimite: boolean
}

/**
 * Calcula num_ctx e, se preciso, devolve o pacote de tools reduzido.
 * `tools` NAO e mutado — o retorno traz a lista efetiva em `toolsEfetivas`.
 */
export async function ajustarCtxOllama(opts: {
  modelo: string
  mensagens: MsgMin[]
  tools?: ToolMin[] | null
  baseUrl?: string
  /** testes: forca o teto de contexto sem consultar /api/show */
  contextoMaxOverride?: number
}): Promise<AjusteCtx & { toolsEfetivas: ToolMin[] }> {
  const { modelo, mensagens } = opts
  const tools = opts.tools || []
  const baseUrl = opts.baseUrl || OLLAMA_DEFAULT
  const contextoMax =
    opts.contextoMaxOverride ?? (await contextoMaxModelo(modelo, baseUrl))

  // Orçamento: o prompt (com margem 1.3) precisa caber no contextoMax.
  // tokensDisponiveis para mensagens+tools = contextoMax / 1.3
  const tokensDisponiveis = Math.floor(contextoMax / MARGEM)

  const removiveis = tools
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !TOOLS_INTOCAVEIS.has(t.name))
    .sort((a, b) => prioridadeCorte(a.t.name) - prioridadeCorte(b.t.name) || a.i - b.i)
    .map(({ t }) => t.name)

  let efetivas = tools.slice()
  const removidas: string[] = []
  let tokens = estimarTokensPrompt(mensagens, efetivas)

  // Remove uma por vez (ordem de corte) ate o prompt estimado caber.
  while (tokens > tokensDisponiveis && removiveis.length) {
    const proxima = removiveis.find((n) => efetivas.some((t) => t.name === n))
    if (!proxima) break
    efetivas = efetivas.filter((t) => t.name !== proxima)
    removidas.push(proxima)
    removiveis.splice(removiveis.indexOf(proxima), 1)
    tokens = estimarTokensPrompt(mensagens, efetivas)
  }

  // num_ctx cobre o prompt real com margem, piso 4096, teto contextoMax.
  const numCtx = Math.max(
    PISO_CTX,
    Math.min(contextoMax, Math.ceil((tokens * MARGEM) / 512) * 512)
  )

  if (removidas.length) {
    dglog(
      '[ctx] prompt nao cabia no contexto de ' + modelo + ' (' + contextoMax +
        '): removidas ' + removidas.length + ' tools -> ' + removidas.slice(0, 12).join(',') +
        (removidas.length > 12 ? '…' : '')
    )
  }
  if (tokens > numCtx * 0.8) {
    dglog('[ctx] WARN prompt=' + tokens + 'tok perto do num_ctx=' + numCtx + ' (' + Math.round((tokens / numCtx) * 100) + '%)')
  }
  dglog(
    '[ctx] modelo=' + modelo + ' tokens=' + tokens + ' num_ctx=' + numCtx +
    ' ctxMax=' + contextoMax + ' tools=' + efetivas.length + '/' + tools.length +
    (removidas.length ? ' removidas=' + removidas.length : '')
  )

  return { numCtx, tokensEstimados: tokens, contextoMax, removidas, pertoDoLimite: tokens > numCtx * 0.8, toolsEfetivas: efetivas }
}
