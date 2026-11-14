import { describe, expect, it } from 'vitest'
import { htmlParaMarkdown, lerClipboardMarkdown } from '../markdown'

describe('htmlParaMarkdown', () => {
  it('converte títulos, parágrafos e ênfases', () => {
    const md = htmlParaMarkdown(
      '<h2>Plano</h2><p><strong>Forte</strong>, <em>itálico</em>, <code>x=1</code> e <a href="https://x.dev">link</a>.</p>'
    )
    expect(md).toBe('## Plano\n\n**Forte**, _itálico_, `x=1` e [link](https://x.dev).')
  })

  it('converte listas aninhadas com marcador limpo', () => {
    const md = htmlParaMarkdown(
      '<ul><li>Pesquisa<ul><li>Fontes</li><li>Entrevistas</li></ul></li><li>Build</li></ul>'
    )
    expect(md).toBe('- Pesquisa\n    - Fontes\n    - Entrevistas\n- Build')
    expect(md).not.toContain('-   ')
  })

  it('converte listas ordenadas e task lists', () => {
    const md = htmlParaMarkdown(
      '<ol><li>Um</li><li>Dois</li></ol><ul><li><input type="checkbox" checked> Feito</li><li><input type="checkbox"> Pendente</li></ul>'
    )
    expect(md).toContain('1. Um')
    expect(md).toContain('2. Dois')
    expect(md).toContain('- [x] Feito')
    expect(md).toContain('- [ ] Pendente')
  })

  it('converte tabelas GFM', () => {
    const md = htmlParaMarkdown(
      '<table><thead><tr><th>Item</th><th>Qtd</th></tr></thead><tbody><tr><td>A</td><td>2</td></tr></tbody></table>'
    )
    expect(md).toBe('| Item | Qtd |\n| --- | --- |\n| A | 2 |')
  })

  it('remove scripts, estilos e imagens embutidas em base64', () => {
    const md = htmlParaMarkdown(
      '<style>.x{color:red}</style><script>alert(1)</script><p>Texto</p><img src="data:image/png;base64,AAAA"><img src="https://x.dev/a.png" alt="A">'
    )
    expect(md).toContain('Texto')
    expect(md).not.toContain('alert')
    expect(md).not.toContain('color:red')
    expect(md).not.toContain('base64')
    expect(md).toContain('![A](https://x.dev/a.png)')
  })

  it('normaliza espaços não separáveis e excesso de linhas', () => {
    const md = htmlParaMarkdown('<div>Um</div><div>&nbsp;</div><div>Dois</div><div><br></div><div>Três</div>')
    expect(md).toBe('Um\n\nDois\n\nTrês')
  })

  it('devolve vazio para HTML vazio', () => {
    expect(htmlParaMarkdown('')).toBe('')
    expect(htmlParaMarkdown('   ')).toBe('')
  })
})

describe('lerClipboardMarkdown', () => {
  it('prefere HTML e converte', () => {
    const r = lerClipboardMarkdown(
      () => '<p><strong>Ola</strong></p>',
      () => 'Ola'
    )
    expect(r).toEqual({ ok: true, markdown: '**Ola**', origem: 'html', caracteres: 7 })
  })

  it('usa texto puro quando não há HTML', () => {
    const r = lerClipboardMarkdown(
      () => '',
      () => '  texto simples  '
    )
    expect(r).toEqual({ ok: true, markdown: 'texto simples', origem: 'texto', caracteres: 13 })
  })

  it('erra quando o clipboard está vazio', () => {
    const r = lerClipboardMarkdown(
      () => '<!-- vazio -->',
      () => '   '
    )
    expect(r.ok).toBe(false)
  })
})
