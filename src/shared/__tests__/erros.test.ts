import { describe, expect, it } from 'vitest'
import { CodigoErro, criarErro, isErroApp } from '../erros'

describe('erros tipados', () => {
  it('criarErro retorna shape completo (com e sem acao/detalhe)', () => {
    const a = criarErro(CodigoErro.ERR_UNKNOWN, 'Falha')
    expect(a.codigo).toBe(CodigoErro.ERR_UNKNOWN)
    expect(a.mensagem).toBe('Falha')
    expect(a.acao).toBeUndefined()
    expect(a.detalhe).toBeUndefined()
    const b = criarErro(CodigoErro.ERR_OLLAMA_OFFLINE, 'Ollama offline', 'Inicie o Ollama.', 'ECONNREFUSED')
    expect(b.acao).toBe('Inicie o Ollama.')
    expect(b.detalhe).toBe('ECONNREFUSED')
  })

  it('isErroApp aceita 5 casos válidos, rejeita 5 inválidos', () => {
    const validos = [
      criarErro(CodigoErro.ERR_LLM_TIMEOUT, 'Timeout'),
      criarErro(CodigoErro.ERR_FOLDER_NOT_FOUND, 'Pasta ausente', 'Escolha outra.'),
      criarErro(CodigoErro.ERR_ANALYSIS_EMPTY, 'Vazio', undefined, 'raw'),
      { codigo: CodigoErro.ERR_UNKNOWN, mensagem: 'x' },
      { codigo: 'ERR_FILE_READ', mensagem: 'leitura', acao: 'tente', detalhe: 'd' },
    ]
    validos.forEach((v) => expect(isErroApp(v)).toBe(true))

    const invalidos = [null, {}, { codigo: 'ERR_NAO_EXISTE', mensagem: 'x' }, { codigo: CodigoErro.ERR_UNKNOWN, mensagem: '' }, 'ERR_UNKNOWN']
    invalidos.forEach((v) => expect(isErroApp(v)).toBe(false))
  })

  it('CodigoErro não tem valores duplicados', () => {
    const vals = Object.values(CodigoErro)
    expect(new Set(vals).size).toBe(vals.length)
  })
})
