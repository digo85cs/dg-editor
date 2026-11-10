import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisReport, AnalysisRunResult, GuardianSnapshot } from '@shared/types'
import type { Regra } from '../../regras-gerais'

const runAnalysis = vi.fn()
const getCachedAnalysis = vi.fn()
const invalidarCacheAnalise = vi.fn()
const checkOllama = vi.fn()
const whereIs = vi.fn()
const formatWhereIs = vi.fn()
const readRules = vi.fn()
const rulesExist = vi.fn()
const createRulesTemplate = vi.fn()
const writeRules = vi.fn()
const ollamaAlive = vi.fn()
const ollamaInstalado = vi.fn()
const startOllama = vi.fn()
const listarRegrasGerais = vi.fn()
const salvarRegrasGerais = vi.fn()
const obterRegrasAtivas = vi.fn()

vi.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    ipcMain: {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      },
      removeHandler: (channel: string) => {
        handlers.delete(channel)
      },
      __handlers: handlers,
    },
    dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) },
    BrowserWindow: class {},
    app: { getPath: () => 'C:/tmp/dg-editor-test', getVersion: () => '0.0.0-test' },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (texto: string) => Buffer.from('enc:' + texto),
      decryptString: (buf: Buffer) => {
        const s = Buffer.isBuffer(buf) ? buf.toString() : String(buf)
        return s.startsWith('enc:') ? s.slice(4) : s
      },
    },
  }
})

vi.mock('../../analyzer', () => ({ runAnalysis, getCachedAnalysis, invalidarCacheAnalise }))
vi.mock('../../ollama-keeper', () => ({ checkOllama, ollamaAlive, ollamaInstalado, startOllama }))
vi.mock('../../whereis', () => ({ whereIs, formatWhereIs }))
vi.mock('../../dgrules', () => ({ readRules, rulesExist, createRulesTemplate, writeRules }))
vi.mock('../../regras-gerais', () => ({ listarRegrasGerais, salvarRegrasGerais, obterRegrasAtivas }))
vi.mock('../../dglog', () => ({ dglog: vi.fn() }))
vi.mock('../../brain/ollama', () => ({ OLLAMA_URL: 'http://127.0.0.1:11434' }))

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}
function hasStr(o: Record<string, unknown>, k: string) {
  expect(typeof o[k]).toBe('string')
}
function hasBool(o: Record<string, unknown>, k: string) {
  expect(typeof o[k]).toBe('boolean')
}
function hasNum(o: Record<string, unknown>, k: string) {
  expect(typeof o[k]).toBe('number')
  expect(Number.isFinite(o[k] as number)).toBe(true)
}

function sampleReport(): AnalysisReport {
  return {
    root: 'C:/proj',
    analyzedAt: Date.now(),
    provider: 'ollama',
    model: 'm',
    oQueE: 'projeto',
    stack: 'ts',
    estrutura: 'src/',
    pontosAtencao: [],
    sugestoes: [],
  }
}

async function handlersOf(modulePath: string): Promise<Map<string, (...args: unknown[]) => unknown>> {
  const mod = await import(modulePath)
  const electron = (await import('electron')) as unknown as { ipcMain: { __handlers: Map<string, (...a: unknown[]) => unknown> } }
  electron.ipcMain.__handlers.clear()
  if (typeof mod.registrarHandlersDeps === 'function') mod.registrarHandlersDeps()
  if (typeof mod.registrarHandlersRegrasGerais === 'function') mod.registrarHandlersRegrasGerais()
  return electron.ipcMain.__handlers
}

describe('IPC contratos (shapes)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.LLM_API_KEY
    delete process.env.OPENAI_API_KEY
  })

  it('analysis:run retorna {ok,result{fromCache,changedFiles,report.oQueE}} no sucesso', async () => {
    checkOllama.mockResolvedValue({ ativo: true })
    const result: AnalysisRunResult = { fromCache: false, changedFiles: ['a.ts'], report: sampleReport() }
    runAnalysis.mockResolvedValue(result)
    const { handleAnaliseRun } = await import('../analise')
    const out = await handleAnaliseRun({} as never, 'C:/proj', false)
    expect(isObj(out)).toBe(true)
    expect(out.ok).toBe(true)
    expect(isObj(out.result)).toBe(true)
    hasBool(out.result as Record<string, unknown>, 'fromCache')
    expect(Array.isArray((out.result as AnalysisRunResult).changedFiles)).toBe(true)
    const report = (out.result as AnalysisRunResult).report
    expect(isObj(report)).toBe(true)
    hasStr(report as unknown as Record<string, unknown>, 'oQueE')
    hasStr(report as unknown as Record<string, unknown>, 'stack')
    hasStr(report as unknown as Record<string, unknown>, 'estrutura')
    expect(Array.isArray(report.pontosAtencao)).toBe(true)
    expect(Array.isArray(report.sugestoes)).toBe(true)
  })

  it('analysis:run retorna {ok:false,erro} com Ollama offline sem API key', async () => {
    checkOllama.mockResolvedValue({ ativo: false })
    const { handleAnaliseRun } = await import('../analise')
    const { isErroApp, CodigoErro } = await import('@shared/erros')
    const out = await handleAnaliseRun({} as never, 'C:/proj', false)
    expect(out.ok).toBe(false)
    const err = out as { erro?: unknown; erroTexto?: string }
    expect(isErroApp(err.erro)).toBe(true)
    if (isErroApp(err.erro)) {
      expect(err.erro.codigo).toBe(CodigoErro.ERR_OLLAMA_OFFLINE)
      expect(typeof err.erro.mensagem).toBe('string')
      expect(err.erro.mensagem.length).toBeGreaterThan(0)
    }
    expect(typeof err.erroTexto).toBe('string')
  })

  it('analysis:run mapeia timeout para ErroApp (ERR_LLM_TIMEOUT)', async () => {
    checkOllama.mockResolvedValue({ ativo: true })
    runAnalysis.mockRejectedValue(new Error('timeout after 60s'))
    const { handleAnaliseRun } = await import('../analise')
    const { isErroApp, CodigoErro } = await import('@shared/erros')
    const out = await handleAnaliseRun({} as never, 'C:/proj', false)
    expect(out.ok).toBe(false)
    expect(isErroApp((out as { erro?: unknown }).erro)).toBe(true)
    if (isErroApp((out as { erro?: unknown }).erro)) expect(((out as { erro: { codigo: string } }).erro.codigo)).toBe(CodigoErro.ERR_LLM_TIMEOUT)
  })

  it('analysis:run mapeia resposta vazia para ErroApp (ERR_LLM_EMPTY_RESPONSE) sem dica Ollama', async () => {
    checkOllama.mockResolvedValue({ ativo: true })
    runAnalysis.mockRejectedValue(new Error('modelo respondeu vazio ou invalido'))
    const { handleAnaliseRun } = await import('../analise')
    const { isErroApp, CodigoErro } = await import('@shared/erros')
    const out = await handleAnaliseRun({} as never, 'C:/proj', false)
    expect(out.ok).toBe(false)
    expect(isErroApp((out as { erro?: unknown }).erro)).toBe(true)
    if (isErroApp((out as { erro?: unknown }).erro)) {
      const e = (out as { erro: { codigo: string; mensagem: string } }).erro
      expect(e.codigo).toBe(CodigoErro.ERR_LLM_EMPTY_RESPONSE)
      expect(/ollama/i.test(e.mensagem)).toBe(false)
    }
  })

  it('guardian:snapshot retorna GuardianSnapshot com números finitos', async () => {
    const { handleGuardianSnapshot } = await import('../guardian')
    const out = handleGuardianSnapshot({} as never) as GuardianSnapshot
    expect(isObj(out)).toBe(true)
    hasNum(out as unknown as Record<string, unknown>, 'freeMemory')
    hasNum(out as unknown as Record<string, unknown>, 'totalMemory')
    hasNum(out as unknown as Record<string, unknown>, 'freePct')
    hasNum(out as unknown as Record<string, unknown>, 'cpuPercent')
    hasBool(out as unknown as Record<string, unknown>, 'ramOk')
    hasNum(out as unknown as Record<string, unknown>, 'at')
  })

  it('guardian:resumo retorna string', async () => {
    const { handleGuardianResumo } = await import('../guardian')
    expect(typeof handleGuardianResumo({} as never)).toBe('string')
  })

  it('deps:status retorna shape {ok,ollama,instalado,vivo,llmApiKey,modelo,ollamaUrl}', async () => {
    ollamaAlive.mockResolvedValue(true)
    ollamaInstalado.mockReturnValue(true)
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ models: [{ name: 'qwen2.5-coder:7b' }] }),
    })))
    const handlers = await handlersOf('../deps')
    const fn = handlers.get('deps:status')
    expect(typeof fn).toBe('function')
    const out = (await fn!({} as never)) as Record<string, unknown>
    expect(out.ok).toBe(true)
    hasStr(out, 'ollama')
    hasBool(out, 'instalado')
    hasBool(out, 'vivo')
    hasBool(out, 'llmApiKey')
    hasStr(out, 'modelo')
    hasStr(out, 'ollamaUrl')
    vi.unstubAllGlobals()
  })

  it('deps:diagnostico retorna shape completo com chaves presentes', async () => {
    ollamaAlive.mockResolvedValue(false)
    ollamaInstalado.mockReturnValue(false)
    const handlers = await handlersOf('../deps')
    const fn = handlers.get('deps:diagnostico')
    expect(typeof fn).toBe('function')
    const out = (await Promise.race([fn!({} as never, null), new Promise((r) => setTimeout(() => r({ timeout: true }), 12000))])) as Record<string, unknown>
    expect(out.timeout).not.toBe(true)
    hasBool(out, 'llmApiKey')
    for (const k of ['ollama', 'disco', 'permissaoPasta', 'encoding', 'build']) expect(isObj(out[k])).toBe(true)
    expect(Array.isArray(((out.ollama as Record<string, unknown>).modelos))).toBe(true)
    expect(typeof (out.ollama as Record<string, unknown>).modeloEscolhido).toBe('string')
    expect(typeof (out.disco as Record<string, unknown>).espacoLivreMB).toBe('number')
    expect(typeof (out.build as Record<string, unknown>).versao).toBe('string')
  })

  it('deps:ollama:start retorna {ok,...st}', async () => {
    startOllama.mockResolvedValue({ ativo: true, instalado: true })
    const handlers = await handlersOf('../deps')
    const fn = handlers.get('deps:ollama:start')
    const out = (await fn!({} as never)) as Record<string, unknown>
    expect(out.ok).toBe(true)
    hasBool(out, 'ativo')
  })

  it('whereis:ask retorna shape {ok,result,formatted} com matches', async () => {
    whereIs.mockReturnValue({ query: 'foo', matches: [{ file: 'C:/proj/a.ts', line: 3, snippet: 'foo()' }], scannedFiles: 2, durationMs: 5 })
    formatWhereIs.mockReturnValue('ok')
    const { handleWhereisAsk } = await import('../analise')
    const out = await handleWhereisAsk({} as never, 'C:/proj', 'foo')
    expect(out.ok).toBe(true)
    const r = out as { result?: { query?: string; matches?: unknown[] }; formatted?: string }
    expect(typeof r.formatted).toBe('string')
    expect(isObj(r.result)).toBe(true)
    expect(r.result?.query).toBe('foo')
    expect(Array.isArray(r.result?.matches)).toBe(true)
  })

  it('dg:regrasgerais listar/salvar/ativas/reordenar preservam shape', async () => {
    const regras: Regra[] = [
      { id: 'a', titulo: 'A', descricao: 'da', ativo: true, criadoEm: 't' },
      { id: 'b', titulo: 'B', descricao: 'db', ativo: true, criadoEm: 't' },
    ]
    listarRegrasGerais.mockReturnValue(regras)
    salvarRegrasGerais.mockReturnValue({ ok: true })
    obterRegrasAtivas.mockReturnValue('- A: da')
    const handlers = await handlersOf('../regras-gerais')
    for (const ch of ['dg:regrasgerais:listar', 'dg:regrasgerais:salvar', 'dg:regrasgerais:ativas', 'dg:regrasgerais:reordenar']) {
      expect(typeof handlers.get(ch)).toBe('function')
    }
    const listar = (await handlers.get('dg:regrasgerais:listar')!({} as never)) as Record<string, unknown>
    expect(listar.ok).toBe(true)
    expect(Array.isArray(listar.regras)).toBe(true)
    const item = (listar.regras as Regra[])[0] as unknown as Record<string, unknown>
    hasStr(item, 'id'); hasStr(item, 'titulo'); hasStr(item, 'descricao'); hasBool(item, 'ativo'); hasStr(item, 'criadoEm')
    const salvar = (await handlers.get('dg:regrasgerais:salvar')!({} as never, regras)) as Record<string, unknown>
    expect(salvar.ok).toBe(true)
    const ativas = (await handlers.get('dg:regrasgerais:ativas')!({} as never)) as Record<string, unknown>
    expect(ativas.ok).toBe(true)
    hasStr(ativas, 'texto')
    const reord = (await handlers.get('dg:regrasgerais:reordenar')!({} as never, ['b', 'a'])) as Record<string, unknown>
    expect(reord.ok).toBe(true)
    expect(Array.isArray(reord.regras)).toBe(true)
    expect((reord.regras as Regra[])[0].id).toBe('b')
  })
})

describe('IPC providers (shapes)', () => {
  async function providersHandlers() {
    const mod = await import('../providers')
    const electron = (await import('electron')) as unknown as { ipcMain: { __handlers: Map<string, (...a: unknown[]) => unknown> } }
    electron.ipcMain.__handlers.clear()
    if (typeof mod.registrarHandlersProviders === 'function') mod.registrarHandlersProviders()
    return electron.ipcMain.__handlers
  }

  it('providers:listar retorna shape e NAO expoe valor da chave', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-test-123'
    const handlers = await providersHandlers()
    const fn = handlers.get('providers:listar')
    expect(typeof fn).toBe('function')
    const out = (await fn!({} as never)) as Record<string, unknown>
    expect(out.ok).toBe(true)
    expect(Array.isArray(out.providers)).toBe(true)
    const serializado = JSON.stringify(out)
    expect(serializado).not.toContain('sk-test-123')
    const provs = out.providers as unknown[]
    expect(provs.length).toBeGreaterThan(0)
    const ink = provs.find((p: unknown) => (p as { id?: string }).id === 'openrouter-inkling')
    expect(ink).toBeDefined()
    const item = ink as Record<string, unknown>
    hasStr(item, 'id'); hasStr(item, 'label'); hasNum(item, 'tier'); hasStr(item, 'formato')
    hasStr(item, 'baseUrl'); hasBool(item, 'ativo'); hasBool(item, 'chaveConfigurada')
    expect(Array.isArray((item as { modelos?: unknown }).modelos)).toBe(true)
    expect(item.esgotadoAte).toBe(null)
    delete process.env.OPENROUTER_API_KEY
  })

  it('providers:configurar retorna ok ao salvar chave', async () => {
    const handlers = await providersHandlers()
    const fn = handlers.get('providers:configurar')
    expect(typeof fn).toBe('function')
    const out = (await fn!({} as never, { id: 'openrouter-inkling', chave: 'sk-nova-abc' })) as Record<string, unknown>
    expect(out.ok).toBe(true)
  })

  it('providers:testar retorna shape sem chave configurada', async () => {
    const handlers = await providersHandlers()
    const fn = handlers.get('providers:testar')
    expect(typeof fn).toBe('function')
    const out = (await fn!({} as never, { id: 'openrouter-inkling' })) as Record<string, unknown>
    expect(typeof out.ok).toBe('boolean')
    if (!out.ok) expect(typeof out.erro).toBe('string')
  })

  it('providers:cotas retorna {ok, cotas: array}', async () => {
    const handlers = await providersHandlers()
    const fn = handlers.get('providers:cotas')
    const out = (await fn!({} as never)) as Record<string, unknown>
    expect(out.ok).toBe(true)
    expect(Array.isArray(out.cotas)).toBe(true)
  })

  it('providers:resetar retorna ok', async () => {
    const handlers = await providersHandlers()
    const fn = handlers.get('providers:resetar')
    const out = (await fn!({} as never, { id: 'openrouter-inkling' })) as Record<string, unknown>
    expect(out.ok).toBe(true)
  })

  it('providers:fila retorna {ok, fila: array com ordem,id,tier,modelo,disponivel}', async () => {
    const handlers = await providersHandlers()
    const fn = handlers.get('providers:fila')
    const out = (await fn!({} as never)) as Record<string, unknown>
    expect(out.ok).toBe(true)
    expect(Array.isArray(out.fila)).toBe(true)
    const fila = out.fila as unknown[]
    if (fila.length > 0) {
      const item = fila[0] as Record<string, unknown>
      hasNum(item, 'ordem'); hasStr(item, 'id'); hasNum(item, 'tier'); hasStr(item, 'modelo'); hasBool(item, 'disponivel')
    }
  })
})
