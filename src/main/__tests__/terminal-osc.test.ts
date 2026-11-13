import { describe, expect, it } from 'vitest'
import { extrairCwdDeOsc, normalizarCwdOsc } from '../terminal-osc'

const ESC = '\x1b'
const BEL = '\x07'
const ST = '\x1b\\'

describe('terminal: OSC de diretorio', () => {
  it('normaliza OSC 7 file:// com escape e drive do Windows', () => {
    expect(normalizarCwdOsc('file://host/C:/Users/digo8/Documentos')).toBe('C:/Users/digo8/Documentos')
    expect(normalizarCwdOsc('file:///home/digo/projetos')).toBe('/home/digo/projetos')
    expect(normalizarCwdOsc('file:///C:/a%20b')).toBe('C:/a b')
    expect(normalizarCwdOsc('/home/digo/')).toBe('/home/digo')
  })

  it('aceita OSC 9;9 (ConEmu/Windows Terminal) e rejeita payload invalido', () => {
    expect(normalizarCwdOsc('C:\\Users\\digo8')).toBe('C:/Users/digo8')
    expect(normalizarCwdOsc('relativo/path')).toBeNull()
    expect(normalizarCwdOsc('')).toBeNull()
  })

  it('extrai o ultimo cwd do fluxo, com BEL ou ST', () => {
    const fluxo =
      'texto' + ESC + ']7;file://host/C:/Um' + BEL + 'meio' + ESC + ']9;9;C:\\Dois' + ST + 'fim'
    expect(extrairCwdDeOsc(fluxo)).toBe('C:/Dois')
    expect(extrairCwdDeOsc(ESC + ']7;file://host/C:/So' + ST)).toBe('C:/So')
    expect(extrairCwdDeOsc('sem osc')).toBeNull()
  })

  it('lida com sequencia cortada entre chunks (tail acumulado)', () => {
    const parte1 = 'x' + ESC + ']9;9;C:\\Prog'
    const parte2 = 'rama Files' + ST
    expect(extrairCwdDeOsc(parte1)).toBeNull()
    expect(extrairCwdDeOsc((parte1 + parte2).slice(-512))).toBe('C:/Programa Files')
  })
})
