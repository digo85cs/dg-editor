import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { devinStatus, devinCriarSessao, devinStatusSessao } from '../devin-api'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  process.env.DEVIN_API_KEY = 'cog_teste123'
  process.env.DEVIN_ORG_ID = 'org_teste'
})

afterEach(() => {
  delete process.env.DEVIN_API_KEY
  delete process.env.DEVIN_ORG_ID
  vi.unstubAllGlobals()
})

function resposta(status: number, corpo: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(corpo) }
}

describe('devin-api', () => {
  it('status sem chave retorna nao autenticado', async () => {
    delete process.env.DEVIN_API_KEY
    const r = await devinStatus()
    expect(r.ok).toBe(false)
    expect(r.autenticado).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('status autenticado chama /self com Bearer', async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, { org_id: 'org_teste', principal_type: 'service_user' }))
    const r = await devinStatus()
    expect(r.ok).toBe(true)
    expect(r.autenticado).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/v3/self')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer cog_teste123')
  })

  it('status com HTTP 401 retorna erro', async () => {
    fetchMock.mockResolvedValueOnce(resposta(401, { detail: 'invalid token' }))
    const r = await devinStatus()
    expect(r.ok).toBe(false)
    expect(r.erro).toContain('401')
  })

  it('criar sessao exige DEVIN_ORG_ID', async () => {
    delete process.env.DEVIN_ORG_ID
    const r = await devinCriarSessao('corrija o bug')
    expect(r.ok).toBe(false)
    expect(r.erro).toContain('DEVIN_ORG_ID')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('criar sessao posta prompt e devolve url', async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, { session_id: 'sess_1', url: 'https://app.devin.ai/sessions/sess_1' }))
    const r = await devinCriarSessao('implemente X', { titulo: 'Tarefa X' })
    expect(r.ok).toBe(true)
    expect(r.sessionId).toBe('sess_1')
    expect(r.url).toContain('sess_1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/organizations/org_teste/sessions')
    const corpo = JSON.parse(String(init.body))
    expect(corpo.prompt).toBe('implemente X')
    expect(corpo.title).toBe('Tarefa X')
  })

  it('criar sessao rejeita prompt vazio', async () => {
    const r = await devinCriarSessao('   ')
    expect(r.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('status sessao agrega sessao e mensagens', async () => {
    fetchMock
      .mockResolvedValueOnce(resposta(200, { status: 'running' }))
      .mockResolvedValueOnce(resposta(200, [{ role: 'devin', text: 'oi' }]))
    const r = await devinStatusSessao('sess_1')
    expect(r.ok).toBe(true)
    expect(r.status).toBe('running')
    expect(r.mensagens).toHaveLength(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/sessions/sess_1')
  })

  it('falha de rede retorna erro amigavel', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const r = await devinStatus()
    expect(r.ok).toBe(false)
    expect(r.erro).toContain('ECONNREFUSED')
  })
})
