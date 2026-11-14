import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  contarNos,
  limparTextoMapa,
  parseOutline,
  profundidadeMax,
  serializarOutline
} from '../outline'
import { svgMapa } from '../svg'
import { carregarMapa, excluirMapa, listarMapas, salvarMapa } from '../arquivo'

const temporarios: string[] = []
function temp(): string {
  const d = mkdtempSync(join(tmpdir(), 'dg-mapas-'))
  temporarios.push(d)
  return d
}
afterEach(() => {
  for (const d of temporarios.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('outline do mapa mental', () => {
  it('converte outline indentado em árvore com 2 ou 4 espaços e tabs', () => {
    const arvore = parseOutline(
      ['- Projeto', '  - Pesquisa', '    - Fontes', '  - Execução', '- Extra'].join('\n')
    )!
    expect(arvore.texto).toBe('Mapa mental')
    expect(arvore.filhos.map((f) => f.texto)).toEqual(['Projeto', 'Extra'])
    expect(arvore.filhos[0].filhos.map((f) => f.texto)).toEqual(['Pesquisa', 'Execução'])
    expect(arvore.filhos[0].filhos[0].filhos[0].texto).toBe('Fontes')
  })

  it('aceita títulos, listas numeradas e limpa markdown', () => {
    const numerada = parseOutline(['1. Um', '2. Dois'].join('\n'))!
    expect(numerada.texto).toBe('Mapa mental')
    expect(numerada.filhos.map((f) => f.texto)).toEqual(['Um', 'Dois'])
    const arvore = parseOutline(
      ['# Ideia central', '  - **Forte**', '  - `código`', '    - [link](http://x) e [[Alvo|apelido]]'].join(
        '\n'
      )
    )!
    expect(arvore.texto).toBe('Ideia central')
    expect(arvore.filhos[0].texto).toBe('Forte')
    expect(arvore.filhos[1].texto).toBe('código')
    expect(arvore.filhos[1].filhos[0].texto).toBe('link e apelido')
    expect(limparTextoMapa('  __negrito__ _itálico_  ')).toBe('negrito itálico')
  })

  it('serializa e reconstrói a mesma árvore', () => {
    const original = ['- Raiz', '  - A', '  - B', '    - B1', '    - B2'].join('\n')
    const arvore = parseOutline(original)!
    const texto = serializarOutline(arvore)
    expect(texto).toBe(['- Raiz', '  - A', '  - B', '    - B1', '    - B2', ''].join('\n'))
    const outra = parseOutline(texto)!
    expect(outra).toEqual(arvore)
    expect(contarNos(arvore)).toBe(5)
    expect(profundidadeMax(arvore)).toBe(3)
  })

  it('devolve null para outline vazio', () => {
    expect(parseOutline('')).toBeNull()
    expect(parseOutline('   \n\n')).toBeNull()
  })
})

describe('svgMapa', () => {
  const arvore = parseOutline(
    ['- Produto', '  - Pesquisa com usuários e entrevistas', '  - Design', '    - Protótipo', '  - Build'].join(
      '\n'
    )
  )!

  it('gera svg com nós, arestas e dimensões coerentes', () => {
    const r = svgMapa(arvore, { titulo: 'Plano <2026>' })
    expect(r.svg.startsWith('<svg')).toBe(true)
    expect(r.svg.endsWith('</svg>')).toBe(true)
    expect(r.nos).toBe(5)
    expect(r.profundidade).toBe(3)
    expect(r.largura).toBeGreaterThan(300)
    expect(r.altura).toBeGreaterThan(100)
    expect(r.svg).toContain('data-camada="arestas"')
    expect((r.svg.match(/<path /g) || []).length).toBe(4)
    expect(r.svg).toContain('Produto')
    expect(r.svg).toContain('Plano &lt;2026&gt;')
    expect(r.svg).not.toContain('Plano <2026>')
  })

  it('quebra textos longos em até 3 linhas com reticências', () => {
    const longo = parseOutline('- ' + 'palavra '.repeat(40))!
    const r = svgMapa(longo)
    expect((r.svg.match(/<tspan /g) || []).length).toBe(3)
    expect(r.svg).toContain('…')
  })

  it('escapa texto com caracteres XML', () => {
    const r = svgMapa(parseOutline('- A & B < C > D " E')!)
    expect(r.svg).toContain('A &amp; B &lt; C &gt; D &quot; E')
  })
})

describe('arquivo de mapas', () => {
  it('salva, lista, carrega e exclui em .dg-editor/mapas', async () => {
    const raiz = temp()
    const salvo = await salvarMapa(raiz, 'Plano de Ação', '- Raiz\n  - Filho\n')
    expect(salvo.ok).toBe(true)
    if (salvo.ok) {
      expect(salvo.nos).toBe(2)
      expect(salvo.caminho.replace(/\\/g, '/')).toContain('.dg-editor/mapas/Plano de Ação.md')
    }
    const lista = listarMapas(raiz)
    expect(lista).toHaveLength(1)
    expect(lista[0].nome).toBe('Plano de Ação')
    expect(lista[0].nos).toBe(2)

    const lido = await carregarMapa(raiz, 'Plano de Ação')
    expect(lido.ok).toBe(true)
    if (lido.ok) expect(lido.outline).toBe('- Raiz\n  - Filho\n')

    expect(excluirMapa(raiz, 'Plano de Ação')).toEqual({ ok: true })
    expect(listarMapas(raiz)).toHaveLength(0)
  })

  it('rejeita nome inválido e outline vazio', async () => {
    const raiz = temp()
    expect((await salvarMapa(raiz, '../fora', '- x')).ok).toBe(false)
    expect((await salvarMapa(raiz, '   ', '- x')).ok).toBe(false)
    expect((await salvarMapa(raiz, 'vazio', '  \n')).ok).toBe(false)
    expect((await carregarMapa(raiz, 'inexistente')).ok).toBe(false)
  })
})
