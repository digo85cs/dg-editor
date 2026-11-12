import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../chatstore', () => ({
  loadChat: vi.fn((): any => []),
  appendChat: vi.fn(),
  clearChat: vi.fn()
}))

vi.mock('../../ipc-seguro', () => ({
  caminhoSeguro: vi.fn((p: string, raizes: string | string[]) => ({ ok: true, abs: p, rel: '.' })),
  exigirString: vi.fn((v: unknown) => {
    if (typeof v !== 'string') return { ok: false, erro: 'payload invalido' }
    return v
  }),
  isErroPayload: vi.fn((p: unknown) => !!(p && typeof p === 'object' && 'ok' in p && (p as any).ok === false))
}))

vi.mock('../../ollama-keeper', () => ({
  ollamaAlive: vi.fn((): Promise<boolean> => Promise.resolve(false))
}))

vi.mock('../../brain/segredos-providers', () => ({
  lerChave: vi.fn(() => '')
}))

vi.mock('../../brain/registry', () => ({
  filaPronta: vi.fn((): any => [])
}))

vi.mock('../../dossie', () => ({
  gravarDossie: vi.fn((): Promise<string> => Promise.resolve('/fake/dossie.txt'))
}))

vi.mock('../../brain/agent', () => ({
  executarAgente: vi.fn((): Promise<any> => Promise.resolve({ ok: true, texto: 'resposta do agente', modelo: 'test-model', propostas: [] }))
}))

vi.mock('../../brain/hibrido', () => ({
  executarHibrido: vi.fn((): Promise<any> => Promise.resolve({ ok: true, texto: 'resposta hibrido', modelo: 'hibrido-core' }))
}))

vi.mock('../../dglog', () => ({ dglog: vi.fn() }))

import { handleChatSend } from '../chat'
import * as chatstore from '../../chatstore'
import * as ollamaKeeper from '../../ollama-keeper'
import * as segredosProviders from '../../brain/segredos-providers'
import * as registry from '../../brain/registry'
import * as brainAgent from '../../brain/agent'
import * as hibrido from '../../brain/hibrido'

const mockAppendChat = vi.mocked(chatstore.appendChat)
const mockOllamaAlive = vi.mocked(ollamaKeeper.ollamaAlive)
const mockLerChave = vi.mocked(segredosProviders.lerChave)
const mockFilaPronta = vi.mocked(registry.filaPronta)
const mockExecutarAgente = vi.mocked(brainAgent.executarAgente)
const mockExecutarHibrido = vi.mocked(hibrido.executarHibrido)

const eventoFalso: any = {
  sender: { isDestroyed: () => false, send: vi.fn() }
}

describe('handleChatSend - degradacao graciosa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAppendChat.mockReset()
    mockOllamaAlive.mockReset()
    mockLerChave.mockReset()
    mockFilaPronta.mockReset()
    mockExecutarAgente.mockReset()
    mockExecutarHibrido.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna erro quando nenhum provedor disponivel (ollama offline + sem chave)', async () => {
    mockOllamaAlive.mockResolvedValue(false)
    mockFilaPronta.mockReturnValue([])
    mockLerChave.mockReturnValue('')

    const resultado = await handleChatSend(eventoFalso, 'C:/dev/DGEditor', 'oi, tudo bem?', {})

    expect(resultado.ok).toBe(false)
    expect(resultado.message?.content).toContain('Nenhum provedor de IA disponível')
    expect(resultado.diagnostico?.provedores).toBe('indisponiveis')
    expect(mockAppendChat).toHaveBeenCalled()
    expect(mockExecutarAgente).not.toHaveBeenCalled()
  })

  it('segue fluxo normal quando Ollama esta vivo', async () => {
    mockOllamaAlive.mockResolvedValue(true)
    mockExecutarAgente.mockResolvedValue({
      ok: true,
      texto: 'resposta do agente',
      modelo: 'test-model',
      propostas: []
    })

    const resultado = await handleChatSend(eventoFalso, 'C:/dev/DGEditor', 'refatorar codigo', {})

    expect(resultado.ok).toBe(true)
    expect(mockExecutarAgente).toHaveBeenCalled()
  })

  it('segue fluxo normal quando ha chave API online configurada', async () => {
    mockOllamaAlive.mockResolvedValue(false)
    mockFilaPronta.mockReturnValue([{ id: 'openrouter', tipo: 'online', formato: 'openai', apiKeyRef: 'openrouter' }])
    mockLerChave.mockReturnValue('sk-or-v1-teste-com-mais-de-quarenta-caracteres-aqui')
    mockExecutarAgente.mockResolvedValue({
      ok: true,
      texto: 'resposta com chave',
      modelo: 'openrouter',
      propostas: []
    })

    const resultado = await handleChatSend(eventoFalso, 'C:/dev/DGEditor', 'ola mundo', {})

    expect(resultado.ok).toBe(true)
    expect(mockExecutarAgente).toHaveBeenCalled()
  })

  it('rejeita vazio de texto', async () => {
    const resultado = await handleChatSend(eventoFalso, 'C:/dev/DGEditor', '   ', {})

    expect(resultado.ok).toBe(false)
    expect(mockExecutarAgente).not.toHaveBeenCalled()
  })

  it('rejeita raiz invalida', async () => {
    const resultado = await handleChatSend(eventoFalso, null as unknown as string, 'ola', {})

    expect(resultado.ok).toBe(false)
    expect(mockExecutarAgente).not.toHaveBeenCalled()
  })
})

describe('handleChatSend - fallback orquestrador', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('chama executarAgente quando Ollama esta disponível', async () => {
    mockOllamaAlive.mockResolvedValue(true)
    mockExecutarAgente.mockResolvedValue({
      ok: true,
      texto: 'resposta do agente',
      modelo: 'test-model',
      propostas: []
    })

    const resultado = await handleChatSend(eventoFalso, 'C:/dev/DGEditor', 'fazer algo', { agente: 'auto', modo: 'agent' })

    expect(resultado.ok).toBe(true)
    expect(mockExecutarAgente).toHaveBeenCalled()
  })
})
