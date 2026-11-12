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
  ollamaAlive: vi.fn((): Promise<boolean> => Promise.resolve(false)),
  ensureOllama: vi.fn(async (): Promise<boolean> => false)
}))

vi.mock('../../brain/segredos-providers', () => ({
  lerChave: vi.fn(() => '')
}))

vi.mock('../../brain/registry', () => ({
  filaPronta: vi.fn((): any => []),
  limitesPorTarefa: vi.fn((): any => ({ num_predict: 128, timeoutMs: 30000 }))
}))

vi.mock('../../dossie', () => ({
  gravarDossie: vi.fn((): Promise<string> => Promise.resolve('/fake/dossie.txt'))
}))

vi.mock('../../brain/agent', () => ({
  executarAgente: vi.fn((): Promise<any> => Promise.resolve({ ok: true, texto: 'resposta do agente', modelo: 'test-model', propostas: [] }))
}))

vi.mock('../../brain/hibrido', () => ({
  executarHibrido: vi.fn((): Promise<any> => Promise.resolve({ ok: true, texto: 'resposta hibrido', modelo: 'hibrido-core', briefing: '' }))
}))

vi.mock('../../dglog', () => ({ dglog: vi.fn() }))

vi.mock('../../agent/fila', () => ({
  enfileirarAgente: vi.fn(async (fn: any) => fn())
}))

vi.mock('../../agent/orquestrador', () => ({
  orquestrarAgentes: vi.fn(async (): Promise<any> => ({
    textoFinal: 'resposta orquestrador',
    passos: [{ texto: 'passo 1', modelo: 'test-model' }],
    modeloUsado: 'test-model'
  }))
}))

vi.mock('../../brain/agentes', () => ({
  listarAgentes: vi.fn((): any => [{ id: 'test-agent' }])
}))

vi.mock('../../mapa-projeto', () => ({
  mapaCompacto: vi.fn((): string => 'mapa do projeto')
}))

vi.mock('../../autonomia-tools', () => ({
  blocoMemoriaProjeto: vi.fn((): string => '')
}))

vi.mock('../../memorias', () => ({
  proporMemoria: vi.fn(),
  textoMemoriasAceitas: vi.fn((): string | null => null)
}))

vi.mock('../../brain/stream-chat', () => ({
  streamOpenAIChat: vi.fn(async (): Promise<string> => 'resposta stream'),
  streamOllamaChat: vi.fn(async (): Promise<string> => 'resposta stream ollama')
}))

vi.mock('../../brain/ollama', () => ({
  askOllama: vi.fn(async (): Promise<any> => ({ text: 'resposta ollama', provider: 'ollama', model: 'qwen2.5-coder:7b' }))
}))

vi.mock('../../agent-router', () => ({
  resolverRotaChat: vi.fn((): any => ({ kind: 'chat', dica: 'chat', agente: undefined })),
  decidirAutoAprovacao: vi.fn((): any => ({ ok: false, motivo: 'desligado' }))
}))

vi.mock('../../agent/plano', () => ({
  salvarPlano: vi.fn(),
  lerPlano: vi.fn((): any => null)
}))

vi.mock('../../agent/propostas', () => ({
  aplicarPropostaComCheckpoint: vi.fn(async () => {})
}))

vi.mock('../../guardian', () => ({
  guardianPodeOperar: vi.fn((): boolean => true)
}))

vi.mock('../../brain/modelos-catalogo', () => ({
  modeloParaTarefa: vi.fn((): string => 'qwen2.5-coder:7b'),
  detectarModelosLocais: vi.fn(async (): Promise<any> => [])
}))

vi.mock('../../mcp/client', () => ({
  garantirMcpNaRaiz: vi.fn(async (): Promise<void> => {})
}))

vi.mock('../../anexos-chat', () => ({
  blocoAnexos: vi.fn((): string => '')
}))

vi.mock('../../regras-escopo', () => ({
  regrasParaContexto: vi.fn((): string => '')
}))

vi.mock('../../analyzer', () => ({
  getCachedAnalysis: vi.fn((): any => null)
}))

vi.mock('../../dgrules', () => ({
  readRules: vi.fn((): string => '')
}))

vi.mock('../../workspace-raiz', () => ({
  resolverRaizChat: vi.fn((root: string) => ({ ok: true, abs: root, rel: '.' })),
  definirRaizWorkspace: vi.fn()
}))

import { handleChatSend } from '../chat'
import * as chatstore from '../../chatstore'
import * as ollamaKeeper from '../../ollama-keeper'
import * as segredosProviders from '../../brain/segredos-providers'
import * as registry from '../../brain/registry'
import * as brainAgent from '../../brain/agent'
import * as hibrido from '../../brain/hibrido'

import * as orquestrador from '../../agent/orquestrador'

const mockAppendChat = vi.mocked(chatstore.appendChat)
const mockOllamaAlive = vi.mocked(ollamaKeeper.ollamaAlive)
const mockLerChave = vi.mocked(segredosProviders.lerChave)
const mockFilaPronta = vi.mocked(registry.filaPronta)
const mockExecutarAgente = vi.mocked(brainAgent.executarAgente)
const mockExecutarHibrido = vi.mocked(hibrido.executarHibrido)
const mockOrquestrarAgentes = vi.mocked(orquestrador.orquestrarAgentes)

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
    mockOrquestrarAgentes.mockReset()
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
    mockOrquestrarAgentes.mockResolvedValue({
      textoFinal: 'resposta do agente',
      passos: [{ texto: 'passo 1', modelo: 'test-model' }],
      modeloUsado: 'test-model'
    })

    const resultado = await handleChatSend(eventoFalso, 'C:/dev/DGEditor', 'refatorar codigo', {})

    expect(resultado.ok).toBe(true)
    expect(mockOrquestrarAgentes).toHaveBeenCalled()
  })

  it('segue fluxo normal quando ha chave API online configurada', async () => {
    mockOllamaAlive.mockResolvedValue(false)
    mockFilaPronta.mockReturnValue([{ id: 'openrouter', tipo: 'online', formato: 'openai', apiKeyRef: 'openrouter' }])
    mockLerChave.mockReturnValue('sk-or-v1-teste-com-mais-de-quarenta-caracteres-aqui')
    mockOrquestrarAgentes.mockResolvedValue({
      textoFinal: 'resposta com chave',
      passos: [{ texto: 'passo 1', modelo: 'openrouter' }],
      modeloUsado: 'openrouter'
    })

    const resultado = await handleChatSend(eventoFalso, 'C:/dev/DGEditor', 'ola mundo', {})

    expect(resultado.ok).toBe(true)
    expect(mockOrquestrarAgentes).toHaveBeenCalled()
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

  it('chama orquestrador quando Ollama esta disponível e agente auto', async () => {
    mockOllamaAlive.mockResolvedValue(true)
    mockOrquestrarAgentes.mockResolvedValue({
      textoFinal: 'resposta do agente',
      passos: [{ texto: 'passo 1', modelo: 'test-model' }],
      modeloUsado: 'test-model'
    })

    const resultado = await handleChatSend(eventoFalso, 'C:/dev/DGEditor', 'fazer algo', { agente: 'auto', modo: 'agent' })

    expect(resultado.ok).toBe(true)
    expect(mockOrquestrarAgentes).toHaveBeenCalled()
  })

  it('chama executarAgente quando agente especifico eh informado', async () => {
    mockOllamaAlive.mockResolvedValue(true)
    mockExecutarAgente.mockResolvedValue({
      ok: true,
      texto: 'resposta do agente',
      modelo: 'test-model',
      propostas: []
    })

    const resultado = await handleChatSend(eventoFalso, 'C:/dev/DGEditor', 'fazer algo', { agente: 'dg-engenheiro', modo: 'agent' })

    expect(resultado.ok).toBe(true)
    expect(mockExecutarAgente).toHaveBeenCalled()
  })
})
