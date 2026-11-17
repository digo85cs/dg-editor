/**
 * Devin API v3 — delegação de tarefas para sessões cloud do Devin.
 * Auth: DEVIN_API_KEY (cog_...) + DEVIN_ORG_ID (ou token pessoal cog_).
 * Docs: https://docs.devin.ai/api-reference/overview
 */

const BASE = 'https://api.devin.ai/v3'

function cfg(): { key: string; org: string | null } | null {
  let key = process.env.DEVIN_API_KEY || ''
  if (!key) {
    try {
      // vault safeStorage — credencial definida via /credenciais ou IPC
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { lerChave } = require('./brain/segredos-providers') as typeof import('./brain/segredos-providers')
      key = lerChave('devin') || ''
    } catch {
      /* vault indisponível */
    }
  }
  if (!key) return null
  let org = process.env.DEVIN_ORG_ID || ''
  if (!org) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { lerChave } = require('./brain/segredos-providers') as typeof import('./brain/segredos-providers')
      org = lerChave('devin-org') || ''
    } catch {
      /* */
    }
  }
  return { key, org: org || null }
}

async function api<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; dados?: T; erro?: string; status?: number }> {
  const c = cfg()
  if (!c) return { ok: false, erro: 'DEVIN_API_KEY não configurada' }
  try {
    const r = await fetch(BASE + path, {
      ...init,
      headers: {
        Authorization: 'Bearer ' + c.key,
        'Content-Type': 'application/json',
        ...(init?.headers || {})
      },
      signal: AbortSignal.timeout(20000)
    })
    const texto = await r.text()
    let dados: unknown = null
    try { dados = texto ? JSON.parse(texto) : null } catch { dados = texto }
    if (!r.ok) return { ok: false, erro: 'HTTP ' + r.status + ': ' + String(texto).slice(0, 200), status: r.status }
    return { ok: true, dados: dados as T }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

export async function devinStatus(): Promise<{ ok: boolean; autenticado?: boolean; org?: string | null; erro?: string }> {
  const r = await api<Record<string, unknown>>('/self')
  if (!r.ok) return { ok: false, autenticado: false, erro: r.erro }
  const d = r.dados as Record<string, unknown> | null
  return { ok: true, autenticado: true, org: (d?.org_id as string) || cfg()?.org || null }
}

export async function devinCriarSessao(
  prompt: string,
  opts: { titulo?: string; createAsUserId?: string } = {}
): Promise<{ ok: boolean; sessionId?: string; url?: string; erro?: string }> {
  const c = cfg()
  if (!c?.org) return { ok: false, erro: 'DEVIN_ORG_ID não configurada (necessária para sessões)' }
  if (!prompt.trim()) return { ok: false, erro: 'prompt vazio' }
  const corpo: Record<string, unknown> = { prompt: prompt.slice(0, 8000) }
  if (opts.titulo) corpo.title = opts.titulo.slice(0, 120)
  if (opts.createAsUserId) corpo.create_as_user_id = opts.createAsUserId
  const r = await api<Record<string, unknown>>('/organizations/' + c.org + '/sessions', {
    method: 'POST',
    body: JSON.stringify(corpo)
  })
  if (!r.ok) return { ok: false, erro: r.erro }
  const d = r.dados as Record<string, unknown>
  return {
    ok: true,
    sessionId: (d?.session_id || d?.id) as string | undefined,
    url: (d?.url || (d?.session_id ? 'https://app.devin.ai/sessions/' + d.session_id : undefined)) as string | undefined
  }
}

export async function devinListarSessoes(
  limite = 20
): Promise<{ ok: boolean; sessoes?: Array<Record<string, unknown>>; erro?: string }> {
  const c = cfg()
  if (!c?.org) return { ok: false, erro: 'DEVIN_ORG_ID não configurada' }
  const r = await api<Record<string, unknown> | unknown[]>(
    '/organizations/' + c.org + '/sessions?limit=' + Math.min(50, Math.max(1, limite))
  )
  if (!r.ok) return { ok: false, erro: r.erro }
  const d = r.dados
  const lista = Array.isArray(d) ? d : Array.isArray((d as Record<string, unknown>)?.sessions) ? ((d as Record<string, unknown>).sessions as unknown[]) : []
  return { ok: true, sessoes: lista as Array<Record<string, unknown>> }
}

export async function devinStatusSessao(
  sessionId: string
): Promise<{ ok: boolean; status?: string; mensagens?: unknown[]; erro?: string }> {
  const c = cfg()
  if (!c?.org) return { ok: false, erro: 'DEVIN_ORG_ID não configurada' }
  const id = encodeURIComponent(sessionId)
  const [sessao, msgs] = await Promise.all([
    api<Record<string, unknown>>('/organizations/' + c.org + '/sessions/' + id),
    api<unknown[]>('/organizations/' + c.org + '/sessions/' + id + '/messages')
  ])
  if (!sessao.ok) return { ok: false, erro: sessao.erro }
  const d = sessao.dados as Record<string, unknown> | null
  return {
    ok: true,
    status: (d?.status || d?.state) as string | undefined,
    mensagens: Array.isArray(msgs.dados) ? msgs.dados : undefined
  }
}
