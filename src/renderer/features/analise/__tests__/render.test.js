import { describe, expect, it } from 'vitest'
import { secao, renderizarAnaliseHtml, renderizarErroHtml } from '../render.js'

describe('analise render', () => {
  it('secao monta HTML com escape', () => {
    const h = secao('Título', '<x>')
    expect(h).toContain('Título')
    expect(h).toContain('&lt;x&gt;')
  })

  it('renderizarAnaliseHtml com report completo', () => {
    const h = renderizarAnaliseHtml({ oQueE: 'App', stack: 'TS', estrutura: 'src', pontosAtencao: ['a'], sugestoes: ['b'], provider: 'p' })
    expect(h).toContain('O que é')
    expect(h).toContain('App')
    expect(h).toContain('<li>a</li>')
  })

  it('renderizarAnaliseHtml com report vazio', () => {
    const h = renderizarAnaliseHtml({ oQueE: '' })
    expect(h).toContain('O que é')
    expect(h).toContain('—')
  })

  it('renderizarAnaliseHtml não quebra com payload vazio', () => {
    expect(() => renderizarAnaliseHtml({}, false)).not.toThrow()
  })

  it('renderizarAnaliseHtml não quebra com payload null', () => {
    expect(() => renderizarAnaliseHtml(null, false)).not.toThrow()
  })

  it('renderizarAnaliseHtml usa fallback quando oQueE ausente', () => {
    const h = renderizarAnaliseHtml({}, false)
    expect(h).toContain('—')
    expect(h).not.toContain('undefined')
  })

  it('renderizarErroHtml com ErroApp', () => {
    const h = renderizarErroHtml({ codigo: 'ERR_LLM_TIMEOUT', mensagem: 'Timeout', acao: 'Tente' })
    expect(h).toContain('[ERR_LLM_TIMEOUT]')
    expect(h).toContain('Tente')
  })

  it('ERR_ANALYSIS_EMPTY não menciona Ollama', () => {
    const h = renderizarErroHtml({ codigo: 'ERR_ANALYSIS_EMPTY', mensagem: 'A análise não retornou dados suficientes.' })
    expect(h).toContain('ERR_ANALYSIS_EMPTY')
    expect(h.toLowerCase()).not.toContain('ollama')
  })
})
