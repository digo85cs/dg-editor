import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// Mock do roteador-cota — proximoDisponivel pode ser controlado por teste
vi.mock('../brain/roteador-cota', () => ({
  proximoDisponivel: vi.fn((): any => null)
}))

import { proximoDisponivel } from '../brain/roteador-cota'
import { deveRodarRadar, executarRadar, selecionarProviderRadar, type RadarTema } from '../radar/radar'

const MOCK_PROVIDER: any = {
  id: 'mock-provider',
  tipo: 'online',
  formato: 'openai',
  modelo: 'mock-modelo',
  baseUrl: 'https://exemplo.com',
  numPredict: 1024,
  timeoutMs: 30000
}

const TEMAS: RadarTema[] = [
  {
    nome: 'editores de codigo com IA',
    queries: ['query 1', 'query 2'],
    observar: ['observar 1', 'observar 2']
  },
  {
    nome: 'agentes de codigo autonomos',
    queries: ['query 3'],
    observar: ['observar 3']
  }
]

function estadoPath(tmpDir: string): string {
  return path.join(tmpDir, 'radar-state.json')
}

describe('radar', () => {
  let tmpDir: string

  beforeEach(() => {
    vi.clearAllMocks()
    tmpDir = path.join(process.cwd(), '.dg-editor', 'tests-radar-tmp')
    fs.mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
    vi.restoreAllMocks()
  })

  describe('deveRodarRadar', () => {
    it('retorna true quando o arquivo de estado nao existe', () => {
      const resultado = deveRodarRadar(path.join(tmpDir, 'nao-existe'))
      expect(resultado).toBe(true)
    })

    it('retorna false quando a ultima execucao foi ha menos de 24h', () => {
      const p = estadoPath(tmpDir)
      const agora = new Date().toISOString()
      fs.writeFileSync(p, JSON.stringify({ ultimaExecucao: agora }), 'utf-8')
      const resultado = deveRodarRadar(tmpDir)
      expect(resultado).toBe(false)
    })

    it('retorna true quando passou mais de 24h', () => {
      const p = estadoPath(tmpDir)
      const ontem = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
      fs.writeFileSync(p, JSON.stringify({ ultimaExecucao: ontem }), 'utf-8')
      const resultado = deveRodarRadar(tmpDir)
      expect(resultado).toBe(true)
    })
  })

  describe('executarRadar', () => {
    it('grave o relatorio e retorne sucesso com provider mockado', async () => {
      vi.mocked(proximoDisponivel).mockReturnValue(MOCK_PROVIDER)

      const buscaMock = vi.fn(async (_q: string) => [
        { titulo: 'Resultado A', url: 'https://exemplo.com/a', resumo: 'resumo A' }
      ])
      const chamarProviderMock = vi.fn(async (_prompt: string, _tema: string) => ({
        resposta: 'Analise do tema.',
        providerUsado: 'mock-provider',
        custoEstimadoUSD: 0.001234
      }))

      const resultado = await executarRadar({
        userDataPath: tmpDir,
        busca: buscaMock,
        chamarProvider: chamarProviderMock,
        caminhoSaida: tmpDir,
        temas: TEMAS
      })

      expect(resultado.ok).toBe(true)
      expect(resultado.relatorioGravado).toBe(true)
      expect(resultado.providerUsado).toBe('mock-provider')
      expect(resultado.custoTotalEstimadoUSD).toBeGreaterThan(0)
      expect(fs.existsSync(path.join(tmpDir, 'RADAR.md'))).toBe(true)
    })

    it('captura erro de busca e continua sem lancar', async () => {
      vi.mocked(proximoDisponivel).mockReturnValue(MOCK_PROVIDER)

      const buscaMock = vi.fn(async () => {
        throw new Error('rede fora do ar')
      })
      const chamarProviderMock = vi.fn(async (_prompt: string, _tema: string) => ({
        resposta: null,
        providerUsado: null,
        custoEstimadoUSD: 0,
        erro: 'erro de rede'
      }))

      const resultado = await executarRadar({
        userDataPath: tmpDir,
        busca: buscaMock,
        chamarProvider: chamarProviderMock,
        caminhoSaida: tmpDir,
        temas: TEMAS
      })

      // Nao deve lancar: erros de busca sao capturados por busca
      expect(resultado.ok).toBe(true)
      // Pelo menos uma busca deve ter erro registrado
      const buscaComErro = resultado.buscas.find((b) => b.erro)
      expect(buscaComErro).toBeDefined()
      expect(buscaComErro!.erro).toContain('rede fora do ar')
    })

    it('retorna erro quando nenhum provider disponivel', async () => {
      vi.mocked(proximoDisponivel).mockReturnValue(null)

      const buscaMock = vi.fn(async (_q: string) => [])
      const chamarProviderMock = vi.fn(async () => ({
        resposta: null,
        providerUsado: null,
        custoEstimadoUSD: 0
      }))

      const resultado = await executarRadar({
        userDataPath: tmpDir,
        busca: buscaMock,
        chamarProvider: chamarProviderMock,
        caminhoSaida: tmpDir,
        temas: TEMAS
      })

      expect(resultado.ok).toBe(false)
      expect(resultado.erro).toContain('Nenhum provider disponivel')
      expect(resultado.providerUsado).toBeNull()
    })
  })

  describe('selecionarProviderRadar', () => {
    it('retorna null quando proximoDisponivel retorna null', () => {
      vi.mocked(proximoDisponivel).mockReturnValue(null)
      const resultado = selecionarProviderRadar()
      expect(resultado).toBeNull()
    })
  })
})
