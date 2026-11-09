import { describe, expect, it } from 'vitest'
import type { AnalysisCache, AnalysisReport, AnalysisRunResult, GuardianSnapshot } from '../types'
import type { Regra } from '../../main/regras-gerais'

type Assert<T extends true> = T
type Extends<A, B> = A extends B ? true : false

type _r1 = Assert<Extends<AnalysisReport, { oQueE: string; stack: string; estrutura: string; pontosAtencao: string[]; sugestoes: string[] }>>
type _r2 = Assert<Extends<AnalysisRunResult, { fromCache: boolean; changedFiles: string[]; report: AnalysisReport }>>
type _r3 = Assert<Extends<AnalysisCache, { report: AnalysisReport; fileHashes: Record<string, string> }>>
type _g1 = Assert<Extends<GuardianSnapshot, { freeMemory: number; totalMemory: number; freePct: number; cpuPercent: number; ramOk: boolean; at: number }>>
type _rg1 = Assert<Extends<Regra, { id: string; titulo: string; descricao: string; ativo: boolean; criadoEm: string }>>

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

describe('shared types: compatibilidade de shape', () => {
  it('AnalysisReport mantém campos consumidos pelo renderer', () => {
    const r: AnalysisReport = {
      root: 'C:/p', analyzedAt: 1, provider: 'ollama', oQueE: 'x', stack: 's', estrutura: 'e', pontosAtencao: [], sugestoes: [],
    }
    expect(isObj(r)).toBe(true)
    expect(typeof r.oQueE).toBe('string')
    expect(typeof r.stack).toBe('string')
    expect(typeof r.estrutura).toBe('string')
    expect(Array.isArray(r.pontosAtencao)).toBe(true)
    expect(Array.isArray(r.sugestoes)).toBe(true)
  })

  it('AnalysisRunResult embala report com fromCache/changedFiles', () => {
    const r: AnalysisRunResult = {
      fromCache: true, changedFiles: [],
      report: { root: '', analyzedAt: 0, provider: '', oQueE: '', stack: '', estrutura: '', pontosAtencao: [], sugestoes: [] },
    }
    expect(typeof r.fromCache).toBe('boolean')
    expect(Array.isArray(r.changedFiles)).toBe(true)
    expect(typeof r.report.oQueE).toBe('string')
  })

  it('GuardianSnapshot expõe métricas finitas esperadas pela UI', () => {
    const s: GuardianSnapshot = { freeMemory: 1, totalMemory: 2, freePct: 50, cpuPercent: 10, ramOk: true, at: 3 }
    for (const k of ['freeMemory', 'totalMemory', 'freePct', 'cpuPercent', 'at'] as const) {
      expect(typeof s[k]).toBe('number')
      expect(Number.isFinite(s[k])).toBe(true)
    }
    expect(typeof s.ramOk).toBe('boolean')
  })

  it('Regra preserva schema de persistência/Regras Gerais', () => {
    const r: Regra = { id: 'i', titulo: 't', descricao: 'd', ativo: true, criadoEm: 'c' }
    expect(typeof r.id).toBe('string')
    expect(typeof r.titulo).toBe('string')
    expect(typeof r.descricao).toBe('string')
    expect(typeof r.ativo).toBe('boolean')
    expect(typeof r.criadoEm).toBe('string')
  })
})
