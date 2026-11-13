import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  CATEGORIAS,
  VOZ_PADRAO,
  acharVoz,
  lerPreferencias,
  listarVozesRapido,
  salvarPreferencias,
  todasVozes
} from '../vozes'

const dirTeste = mkdtempSync(join(tmpdir(), 'dg-vozes-'))
const envAnterior = process.env.DG_TTS_DIR

beforeEach(() => {
  process.env.DG_TTS_DIR = dirTeste
})

afterAll(() => {
  if (envAnterior === undefined) delete process.env.DG_TTS_DIR
  else process.env.DG_TTS_DIR = envAnterior
  rmSync(dirTeste, { recursive: true, force: true })
})

describe('biblioteca de vozes — catálogo', () => {
  it('tem ids únicos no formato motor:nome', () => {
    const ids = todasVozes().map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z]+:[a-z0-9]+$/)
  })

  it('cobre as categorias pedidas (homem, mulher, menino, menina) e paródias', () => {
    const vozes = todasVozes()
    for (const c of CATEGORIAS) {
      expect(vozes.filter((v) => v.categoria === c.id).length).toBeGreaterThan(0)
    }
    expect(CATEGORIAS.map((c) => c.id).sort()).toEqual(['homem', 'menina', 'menino', 'mulher', 'parodia'])
  })

  it('paródias são arquétipos derivados, sem clonar pessoas reais', () => {
    const parodias = todasVozes().filter((v) => v.categoria === 'parodia')
    expect(parodias.length).toBeGreaterThanOrEqual(6)
    for (const v of parodias) {
      expect(v.descricao.toLowerCase()).toContain('arquétipo')
      expect(v.tom === undefined || (v.tom > 0.8 && v.tom < 1.15)).toBe(true)
      if (v.taxaPadrao) expect(v.taxaPadrao).toMatch(/^[+-]\d+%$/)
    }
  })

  it('inclui vozes locais e a nuvem como alternativa', () => {
    const vozes = todasVozes()
    for (const motor of ['supertonic', 'kokoro', 'piper'] as const) {
      expect(vozes.some((v) => v.motor === motor && !v.internet)).toBe(true)
    }
    expect(vozes.some((v) => v.motor === 'edge' && v.internet)).toBe(true)
    for (const v of vozes) {
      if (v.motor === 'edge') expect(v.internet).toBe(true)
      else expect(v.internet).not.toBe(true)
    }
  })

  it('vozes infantis são derivadas com fator de tom maior que 1', () => {
    const infantis = todasVozes().filter((v) => v.categoria === 'menina' || v.categoria === 'menino')
    expect(infantis.length).toBeGreaterThanOrEqual(4)
    for (const v of infantis) {
      expect(v.derivada).toBe(true)
      expect(v.tom).toBeGreaterThan(1)
      expect(v.tom).toBeLessThanOrEqual(1.8)
    }
    for (const v of todasVozes().filter((x) => x.categoria === 'mulher' || x.categoria === 'homem')) {
      expect(v.derivada).not.toBe(true)
      expect(v.tom).toBeUndefined()
    }
  })

  it('a voz padrão existe e é local', () => {
    const padrao = todasVozes().find((v) => v.id === VOZ_PADRAO)
    expect(padrao).toBeTruthy()
    expect(padrao?.motor).not.toBe('edge')
  })
})

describe('acharVoz', () => {
  it('aceita id, estilo e rótulo sem diferenciar maiúsculas', () => {
    expect(acharVoz('st:f1')?.rotulo).toBe('Ana Clara')
    expect(acharVoz('ST:F1')?.id).toBe('st:f1')
    expect(acharVoz('F1')?.id).toBe('st:f1')
    expect(acharVoz('ana clara')?.id).toBe('st:f1')
    expect(acharVoz('pf_dora')?.id).toBe('kokoro:dora')
    expect(acharVoz('Cadu')?.id).toBe('piper:cadu')
  })

  it('converte nomes legados do edge-tts', () => {
    expect(acharVoz('pt-BR-FranciscaNeural')?.id).toBe('edge:francisca')
    expect(acharVoz('pt-BR-AntonioNeural')?.id).toBe('edge:antonio')
    expect(acharVoz('pt-BR-ThalitaMultilingualNeural')?.id).toBe('edge:thalita')
  })

  it('usa a preferência salva quando o id vem vazio', () => {
    salvarPreferencias({ vozPadrao: 'infantil:bia' })
    expect(acharVoz()?.id).toBe('infantil:bia')
    expect(acharVoz('')?.id).toBe('infantil:bia')
  })

  it('retorna undefined para voz desconhecida', () => {
    expect(acharVoz('voz-inexistente')).toBeUndefined()
    expect(acharVoz('st:x9')).toBeUndefined()
  })
})

describe('preferências', () => {
  it('grava e relê a voz padrão em JSON', () => {
    const salvo = salvarPreferencias({ vozPadrao: 'kokoro:alex' })
    expect(salvo.vozPadrao).toBe('kokoro:alex')
    expect(lerPreferencias().vozPadrao).toBe('kokoro:alex')
    const json = JSON.parse(readFileSync(join(dirTeste, 'preferencias.json'), 'utf8')) as { vozPadrao: string }
    expect(json.vozPadrao).toBe('kokoro:alex')
  })

  it('ignora voz inválida e mantém a última válida', () => {
    salvarPreferencias({ vozPadrao: 'piper:faber' })
    salvarPreferencias({ vozPadrao: 'nao-existe' })
    expect(lerPreferencias().vozPadrao).toBe('piper:faber')
  })
})

describe('listagem rápida', () => {
  it('devolve todas as vozes com estado de disponibilidade', () => {
    const lista = listarVozesRapido()
    expect(lista.length).toBe(todasVozes().length)
    for (const v of lista) {
      expect(typeof v.disponivel).toBe('boolean')
      if (v.motor === 'edge') expect(v.disponivel).toBe(true)
    }
    // Pasta temporária vazia: motores locais aparecem indisponíveis.
    expect(lista.find((v) => v.id === 'st:f1')?.disponivel).toBe(false)
    expect(lista.find((v) => v.id === 'st:f1')?.motivo).toMatch(/baixe/i)
  })
})
