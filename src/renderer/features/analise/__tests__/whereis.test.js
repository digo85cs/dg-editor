import { describe, expect, it } from 'vitest'
import { renderizarWhereisMatchesHtml, renderizarWhereisVazioHtml, renderizarWhereisErroHtml } from '../whereis.js'

describe('whereis render', () => {
  it('vazio', () => {
    expect(renderizarWhereisVazioHtml('abc')).toContain('Nada encontrado')
  })
  it('matches com file:line e snippet escapado', () => {
    const h = renderizarWhereisMatchesHtml({ matches: [{ file: 'a<b>.ts', line: 7, snippet: '<x>' }], scannedFiles: 2, durationMs: 3 }, 'x')
    expect(h).toContain('a&lt;b&gt;.ts:7')
    expect(h).toContain('&lt;x&gt;')
    expect(h).toContain('1 ocorrência')
  })
  it('erro tipado', () => {
    expect(renderizarWhereisErroHtml({ codigo: 'ERR_UNKNOWN', mensagem: 'x' })).toContain('[ERR_UNKNOWN]')
  })
})
