import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ESCALAS_VALIDAS,
  TAMANHOS_EDITOR,
  TAMANHOS_TERMINAL,
  ajustarEscalaInterface,
  ajustarTamanhoFonte,
  aplicarPreferenciasA11y,
  familiaFonteEditor,
  lerPreferenciasA11y,
  movimentoReduzidoAtivo,
  salvarPreferenciasA11y
} from '../acessibilidade.js'

const CHAVE = 'dg-a11y-prefs'

function instalarAmbiente({ reduzidoNoSistema = false } = {}) {
  const store = new Map()
  const classes = new Set()
  const invoke = vi.fn().mockResolvedValue({ ok: true })
  const dispatchEvent = vi.fn()
  const setVar = vi.fn()
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  }
  const document = {
    body: {
      classList: {
        toggle: (classe, ativo) => {
          if (ativo) classes.add(classe)
          else classes.delete(classe)
        }
      }
    },
    documentElement: { style: { setProperty: setVar } }
  }
  const window = {
    api: { invoke },
    matchMedia: () => ({ matches: reduzidoNoSistema }),
    dispatchEvent
  }
  vi.stubGlobal('localStorage', localStorage)
  vi.stubGlobal('document', document)
  vi.stubGlobal('window', window)
  return { store, classes, invoke, dispatchEvent, setVar }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const PADROES = {
  movimento: 'sistema',
  altoContraste: false,
  escalaInterface: 1,
  anuncioStreaming: 'frases',
  tamanhoEditor: 13,
  tamanhoTerminal: 13,
  fonteEditor: 'mono'
}

describe('lerPreferenciasA11y', () => {
  it('retorna padrões sem storage', () => {
    instalarAmbiente()
    expect(lerPreferenciasA11y()).toEqual(PADROES)
  })

  it('migra a chave booleana antiga para movimento', () => {
    instalarAmbiente()
    localStorage.setItem(CHAVE, JSON.stringify({ reduzirMovimento: true }))
    expect(lerPreferenciasA11y().movimento).toBe('reduzir')
    localStorage.setItem(CHAVE, JSON.stringify({ reduzirMovimento: false }))
    expect(lerPreferenciasA11y().movimento).toBe('sistema')
  })

  it('normaliza valores inválidos', () => {
    instalarAmbiente()
    localStorage.setItem(
      CHAVE,
      JSON.stringify({
        movimento: 'x',
        altoContraste: 1,
        escalaInterface: 2.5,
        anuncioStreaming: 'y',
        tamanhoEditor: 5,
        tamanhoTerminal: 99,
        fonteEditor: 'x'
      })
    )
    expect(lerPreferenciasA11y()).toEqual({ ...PADROES, altoContraste: false })
  })

  it('aceita tamanhos e fonte válidos', () => {
    instalarAmbiente()
    localStorage.setItem(
      CHAVE,
      JSON.stringify({ tamanhoEditor: 15, tamanhoTerminal: 11, fonteEditor: 'consolas' })
    )
    const p = lerPreferenciasA11y()
    expect(p.tamanhoEditor).toBe(15)
    expect(p.tamanhoTerminal).toBe(11)
    expect(p.fonteEditor).toBe('consolas')
  })

  it('tolera JSON corrompido', () => {
    instalarAmbiente()
    localStorage.setItem(CHAVE, '{oops')
    expect(lerPreferenciasA11y().escalaInterface).toBe(1)
  })
})

describe('salvarPreferenciasA11y', () => {
  it('persiste valores normalizados', () => {
    const { store } = instalarAmbiente()
    const p = salvarPreferenciasA11y({ movimento: 'reduzir', altoContraste: true, escalaInterface: 1.25 })
    expect(p).toEqual({
      movimento: 'reduzir',
      altoContraste: true,
      escalaInterface: 1.25,
      anuncioStreaming: 'frases',
      tamanhoEditor: 13,
      tamanhoTerminal: 13,
      fonteEditor: 'mono'
    })
    expect(JSON.parse(store.get(CHAVE))).toEqual(p)
  })

  it('cai para escala padrão quando inválida', () => {
    instalarAmbiente()
    expect(salvarPreferenciasA11y({ escalaInterface: 3 }).escalaInterface).toBe(1)
  })

  it('valida tamanhos e família de fonte', () => {
    instalarAmbiente()
    const p = salvarPreferenciasA11y({ tamanhoEditor: 99, tamanhoTerminal: 1, fonteEditor: 'x' })
    expect(TAMANHOS_EDITOR.includes(p.tamanhoEditor)).toBe(true)
    expect(p.tamanhoEditor).toBe(13)
    expect(p.tamanhoTerminal).toBe(13)
    expect(p.fonteEditor).toBe('mono')
  })
})

describe('familiaFonteEditor', () => {
  it('mapeia ids para famílias CSS', () => {
    expect(familiaFonteEditor({ fonteEditor: 'cascadia' })).toContain('Cascadia Code')
    expect(familiaFonteEditor({ fonteEditor: 'consolas' })).toContain('Consolas')
    expect(familiaFonteEditor({ fonteEditor: 'x' })).toContain('Cascadia Code')
  })
})

describe('movimentoReduzidoAtivo', () => {
  it('respeita reduzir/normal e, em sistema, o SO', () => {
    const { } = instalarAmbiente({ reduzidoNoSistema: true })
    expect(movimentoReduzidoAtivo({ movimento: 'reduzir' })).toBe(true)
    expect(movimentoReduzidoAtivo({ movimento: 'normal' })).toBe(false)
    expect(movimentoReduzidoAtivo({ movimento: 'sistema' })).toBe(true)
  })
})

describe('aplicarPreferenciasA11y', () => {
  it('alterna classes, envia zoom e notifica fonte por painel', () => {
    const { classes, invoke, dispatchEvent, setVar } = instalarAmbiente()
    aplicarPreferenciasA11y({
      movimento: 'reduzir',
      altoContraste: true,
      escalaInterface: 1.1,
      anuncioStreaming: 'frases',
      tamanhoEditor: 15,
      tamanhoTerminal: 12,
      fonteEditor: 'cascadia'
    })
    expect(classes.has('dg-reduzir-movimento')).toBe(true)
    expect(classes.has('dg-alto-contraste')).toBe(true)
    expect(invoke).toHaveBeenCalledWith('janela:zoom-fator', 1.1)
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({ escala: 1.1 })
    expect(dispatchEvent.mock.calls[1][0].type).toBe('dg:fonte-painel')
    expect(dispatchEvent.mock.calls[1][0].detail).toEqual({ editor: 15, terminal: 12 })
    expect(setVar).toHaveBeenCalledWith('--dg-editor-fs', '15px')
    expect(setVar.mock.calls.some((c) => c[0] === '--dg-editor-fonte' && c[1].includes('Cascadia Code'))).toBe(
      true
    )
  })
})

describe('ajustarEscalaInterface', () => {
  it('sobe, desce e volta ao padrão', () => {
    instalarAmbiente()
    expect(ajustarEscalaInterface(1, { escalaInterface: 1 }).escalaInterface).toBe(1.1)
    expect(ajustarEscalaInterface(-1, { escalaInterface: 1 }).escalaInterface).toBe(0.9)
    expect(ajustarEscalaInterface(0, { escalaInterface: 1.25 }).escalaInterface).toBe(1)
  })

  it('não passa dos limites da escala', () => {
    instalarAmbiente()
    const max = ESCALAS_VALIDAS[ESCALAS_VALIDAS.length - 1]
    const min = ESCALAS_VALIDAS[0]
    expect(ajustarEscalaInterface(5, { escalaInterface: max }).escalaInterface).toBe(max)
    expect(ajustarEscalaInterface(-5, { escalaInterface: min }).escalaInterface).toBe(min)
  })
})

describe('ajustarTamanhoFonte', () => {
  const PADRAO = {
    movimento: 'sistema',
    altoContraste: false,
    escalaInterface: 1,
    anuncioStreaming: 'frases',
    tamanhoEditor: 13,
    tamanhoTerminal: 13,
    fonteEditor: 'mono'
  }

  it('sobe, desce e volta ao padrão por painel', () => {
    instalarAmbiente()
    expect(ajustarTamanhoFonte('editor', 1, { ...PADRAO }).tamanhoEditor).toBe(14)
    expect(ajustarTamanhoFonte('editor', -1, { ...PADRAO }).tamanhoEditor).toBe(12)
    expect(ajustarTamanhoFonte('editor', 0, { ...PADRAO, tamanhoEditor: 16 }).tamanhoEditor).toBe(13)
    expect(ajustarTamanhoFonte('terminal', 1, { ...PADRAO }).tamanhoTerminal).toBe(14)
    expect(ajustarTamanhoFonte('terminal', -1, { ...PADRAO }).tamanhoTerminal).toBe(12)
    expect(ajustarTamanhoFonte('terminal', 0, { ...PADRAO, tamanhoTerminal: 17 }).tamanhoTerminal).toBe(13)
  })

  it('não passa dos limites de cada painel', () => {
    instalarAmbiente()
    const maxE = TAMANHOS_EDITOR[TAMANHOS_EDITOR.length - 1]
    const minE = TAMANHOS_EDITOR[0]
    const maxT = TAMANHOS_TERMINAL[TAMANHOS_TERMINAL.length - 1]
    const minT = TAMANHOS_TERMINAL[0]
    expect(ajustarTamanhoFonte('editor', 9, { ...PADRAO, tamanhoEditor: maxE }).tamanhoEditor).toBe(maxE)
    expect(ajustarTamanhoFonte('editor', -9, { ...PADRAO, tamanhoEditor: minE }).tamanhoEditor).toBe(minE)
    expect(ajustarTamanhoFonte('terminal', 9, { ...PADRAO, tamanhoTerminal: maxT }).tamanhoTerminal).toBe(maxT)
    expect(ajustarTamanhoFonte('terminal', -9, { ...PADRAO, tamanhoTerminal: minT }).tamanhoTerminal).toBe(minT)
  })

  it('persiste e aplica a fonte do painel escolhido', () => {
    const { invoke, dispatchEvent } = instalarAmbiente()
    ajustarTamanhoFonte('terminal', 2, { ...PADRAO })
    const p = JSON.parse(localStorage.getItem(CHAVE))
    expect(p.tamanhoTerminal).toBe(15)
    expect(p.tamanhoEditor).toBe(13)
    expect(dispatchEvent.mock.calls.some((c) => c[0].type === 'dg:fonte-painel' && c[0].detail.terminal === 15)).toBe(
      true
    )
    expect(invoke).toHaveBeenCalledWith('janela:zoom-fator', 1)
  })
})
