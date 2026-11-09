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
    const out = await handleAnaliseRun({} as never, 'C:/proj', false)
    expect(out.ok).toBe(false)
    const err = out as { erro?: string }
    expect(typeof err.erro).toBe('string')
    expect(String(err.erro)).toMatch(/Ollama/)
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

  it('deps:ollama:start retorna {ok,...st}', async () => {
    startOllama.mockResolvedValue({ ativo: true, instalado: true })
    const handlers = await handlersOf('../deps')
    const fn = handlers.get('deps:ollama:start')
    const out = (await fn!({} as never)) as Record<string, unknown>
    expect(out.ok).toBe(true)
    hasBool(out, 'ativo')
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
