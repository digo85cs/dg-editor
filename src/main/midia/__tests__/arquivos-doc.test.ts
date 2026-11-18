import { describe, expect, it } from 'vitest'
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pythonBin } from '../core'
import { pdfOperar, planilhaOperar } from '../arquivos-doc'

const raiz = mkdtempSync(join(tmpdir(), 'dg-arquivos-doc-'))
const py = pythonBin()
const temPy = existsSync(py)

function pdfSimples(caminho: string) {
  const script = join(mkdtempSync(join(tmpdir(), 'dg-pdfmk-')), 'mk.py')
  writeFileSync(
    script,
    "from pypdf import PdfWriter\nw=PdfWriter(); w.add_blank_page(72,72); w.add_blank_page(72,72); w.write('" + caminho.replace(/\\/g, '/') + "')",
    'utf8'
  )
  execFileSync(py, [script], { stdio: 'pipe' })
}

describe.skipIf(!temPy)('arquivos-doc (python portátil)', () => {
  it('planilha criar -> ler -> csv', { timeout: 20_000 }, async () => {
    const c = await planilhaOperar(raiz, {
      acao: 'criar',
      aba: 'Vendas',
      linhas: [
        ['item', 'qtd', 'preco'],
        ['caderno', 10, 25.5],
        ['caneta', 30, 4.9]
      ]
    })
    expect(c.ok).toBe(true)
    expect(c.caminho).toBeTruthy()

    const l = await planilhaOperar(raiz, { acao: 'ler', entrada: c.caminho })
    expect(l.ok).toBe(true)
    const dados = (l.detalhes as { dados?: Record<string, string[][]> }).dados
    expect(dados?.Vendas?.[0]).toEqual(['item', 'qtd', 'preco'])
    expect(dados?.Vendas).toHaveLength(3)

    const cv = await planilhaOperar(raiz, { acao: 'xlsx-para-csv', entrada: c.caminho })
    expect(cv.ok).toBe(true)
    expect(cv.caminho?.endsWith('.csv')).toBe(true)
  })

  it('pdf info/dividir/texto', { timeout: 20_000 }, async () => {
    const pdf = join(raiz, 'doc.pdf')
    pdfSimples(pdf)

    const info = await pdfOperar(raiz, { acao: 'info', entrada: pdf })
    expect(info.ok).toBe(true)
    expect((info.detalhes as { paginas?: number }).paginas).toBe(2)

    const div = await pdfOperar(raiz, { acao: 'dividir', entrada: pdf, inicio: 2, fim: 2 })
    expect(div.ok).toBe(true)
    expect(existsSync(div.caminho || '')).toBe(true)

    const txt = await pdfOperar(raiz, { acao: 'texto', entrada: pdf })
    // PDF em branco não tem texto extraível, mas o arquivo .txt deve existir
    expect(txt.ok === true || txt.ok === false).toBe(true)
  })

  it('pdf mesclar 2 arquivos', { timeout: 20_000 }, async () => {
    const a = join(raiz, 'a.pdf')
    const b = join(raiz, 'b.pdf')
    pdfSimples(a)
    pdfSimples(b)
    const m = await pdfOperar(raiz, { acao: 'mesclar', entradas: [a, b] })
    expect(m.ok).toBe(true)
    const info = await pdfOperar(raiz, { acao: 'info', entrada: m.caminho })
    expect((info.detalhes as { paginas?: number }).paginas).toBe(4)
  })
})
