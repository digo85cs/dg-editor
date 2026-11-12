import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../scanner', () => ({ scanFolder: vi.fn((): any => ({ topFiles: [] })) }))
vi.mock('../dgrules', () => ({ readRules: vi.fn((): any => '') }))
vi.mock('../dglog', () => ({ dglog: vi.fn() }))
vi.mock('../brain/module', () => ({ getBrain: vi.fn((): any => ({ ask: vi.fn((): any => ({ text: 'O QUE E: analise\nSTACK: node\nESTRUTURA: projeto', provider: 'mock' })) })) }))
vi.mock('@shared/schemas/relatorio', () => ({ normalizarRelatorio: vi.fn((x: any) => x) }))
vi.mock('fs', () => ({
  watch: vi.fn((): any => ({ close: vi.fn() })),
  existsSync: vi.fn((): boolean => true),
  mkdirSync: vi.fn((): void => undefined),
  readFileSync: vi.fn((): string => ''),
  writeFileSync: vi.fn((): void => undefined)
}))

import { inicializarWatchAnalise, pararWatchAnalise, computeFileHashes, runAnalysis } from '../analyzer'

import * as scanner from '../scanner'
import * as dgrules from '../dgrules'

describe('analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('inicializarWatchAnalise nao lança exceção', () => {
    expect(() => inicializarWatchAnalise('/tmp/projeto')).not.toThrow()
  })

  it('pararWatchAnalise nao lança exceção', () => {
    expect(() => pararWatchAnalise('/tmp/projeto')).not.toThrow()
  })

  it('computeFileHashes retorna objeto vazio sem arquivos', () => {
    const hashes = computeFileHashes('/tmp/projeto', { topFiles: [] } as any, 'rapida')
    expect(hashes).toBeDefined()
    expect(typeof hashes).toBe('object')
  })

  it('runAnalysis retorna resultado', async () => {
    vi.mocked(scanner.scanFolder).mockReturnValue({ topFiles: [] })
    vi.mocked(dgrules.readRules).mockReturnValue('')

    const resultado = await runAnalysis('/tmp/projeto', 'rapida', false)
    expect(resultado.fromCache).toBeDefined()
    expect(resultado.report).toBeDefined()
  })
})
