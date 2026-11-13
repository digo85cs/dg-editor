import { describe, expect, it } from 'vitest'
import {
  CHAVE_SEM_PROJETO,
  LIMITE_PROJETOS,
  normalizarMapaAbas,
  podarMapaAbas,
  podarProjetosInexistentes
} from '../abas-mapa.js'

describe('abas-mapa: normalizacao', () => {
  it('adota o formato antigo (global) para o projeto atual', () => {
    const mapa = normalizarMapaAbas({ abas: ['a.js', 42, 'b.js'], ativa: 'a.js' }, 'c:/proj')
    expect(mapa).toEqual({ 'c:/proj': { abas: ['a.js', 'b.js'], ativa: 'a.js' } })
  })

  it('descarta entradas invalidas sem quebrar', () => {
    const mapa = normalizarMapaAbas(
      {
        'c:/ok': { abas: ['x'], ativa: 7, raiz: 'C:/Ok', em: 10 },
        'c:/sem-abas': { ativa: 'x' },
        'c:/lista': ['x'],
        'c:/nulo': null,
        'c:/so-strings': { abas: [1, 'y', null], ativa: 'y' }
      },
      'c:/ok'
    )
    expect(Object.keys(mapa).sort()).toEqual(['c:/ok', 'c:/so-strings'])
    expect(mapa['c:/ok']).toEqual({ abas: ['x'], ativa: null, raiz: 'C:/Ok', em: 10 })
    expect(mapa['c:/so-strings']).toEqual({ abas: ['y'], ativa: 'y' })
  })

  it('tolera valores nao-objeto', () => {
    expect(normalizarMapaAbas(null, 'x')).toEqual({})
    expect(normalizarMapaAbas([], 'x')).toEqual({})
    expect(normalizarMapaAbas('texto', 'x')).toEqual({})
  })
})

describe('abas-mapa: poda por limite', () => {
  it('mantem os projetos mais recentes', () => {
    const mapa = {}
    for (let i = 0; i < 5; i++) {
      mapa['p' + i] = { abas: ['f' + i], ativa: 'f' + i, em: i * 100 }
    }
    const podado = podarMapaAbas(mapa, 3)
    expect(Object.keys(podado).sort()).toEqual(['p2', 'p3', 'p4'])
  })

  it('trata `em` ausente como mais antigo', () => {
    const mapa = {
      antigo: { abas: ['a'], ativa: 'a' },
      novo: { abas: ['b'], ativa: 'b', em: 50 }
    }
    const podado = podarMapaAbas(mapa, 1)
    expect(Object.keys(podado)).toEqual(['novo'])
  })

  it('nao altera mapas dentro do limite e suporta entrada vazia', () => {
    const mapa = { a: { abas: [], ativa: null }, b: { abas: [], ativa: null } }
    expect(podarMapaAbas(mapa, LIMITE_PROJETOS)).toBe(mapa)
    expect(podarMapaAbas(null, 5)).toEqual({})
  })
})

describe('abas-mapa: poda de projetos inexistentes', () => {
  const mapa = {
    [CHAVE_SEM_PROJETO]: { abas: ['solto.js'], ativa: 'solto.js' },
    'c:/vivo': { abas: ['a.js'], ativa: 'a.js', raiz: 'C:/Vivo' },
    'c:/morto': { abas: ['b.js'], ativa: 'b.js', raiz: 'C:/Morto' },
    'c:/instavel': { abas: ['c.js'], ativa: 'c.js', raiz: 'C:/Instavel' },
    'c:/legado': { abas: ['d.js'], ativa: 'd.js' }
  }

  it('remove projetos cuja raiz sumiu e preserva sem-projeto/legado', async () => {
    const vistos = []
    const out = await podarProjetosInexistentes(mapa, async (raiz) => {
      vistos.push(raiz)
      if (raiz === 'C:/Instavel') throw new Error('disco offline')
      return raiz === 'C:/Vivo'
    })
    expect(vistos.sort()).toEqual(['C:/Instavel', 'C:/Morto', 'C:/Vivo'])
    expect(Object.keys(out).sort()).toEqual(
      ['c:/instavel', 'c:/legado', 'c:/vivo', CHAVE_SEM_PROJETO].sort()
    )
  })

  it('nao muta o mapa original', async () => {
    const copia = JSON.parse(JSON.stringify(mapa))
    await podarProjetosInexistentes(mapa, async () => false)
    expect(mapa).toEqual(copia)
  })
})
