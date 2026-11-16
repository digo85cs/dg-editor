import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { lspAbrir, lspDiagnosticos, lspHover, lspDefinicao } from '../ts-servico'

const raiz = mkdtempSync(join(tmpdir(), 'dg-lsp-'))

afterAll(() => {
  try { rmSync(raiz, { recursive: true, force: true }) } catch { /* */ }
})

const arquivo = join(raiz, 'soma.ts')
writeFileSync(
  arquivo,
  [
    'export function soma(a: number, b: number): number {',
    '  return a + b',
    '}',
    '',
    'const total = soma(1, 2)',
    'console.log(total)'
  ].join('\n'),
  'utf8'
)

describe('lsp/ts-servico', () => {
  it('hover retorna tipo na posicao de soma', () => {
    lspAbrir(raiz, 'soma.ts')
    const r = lspHover(raiz, 'soma.ts', 5, 15)
    expect(r.ok).toBe(true)
    expect(r.texto).toContain('soma')
  })

  it('definicao aponta para a declaracao', () => {
    lspAbrir(raiz, 'soma.ts')
    const r = lspDefinicao(raiz, 'soma.ts', 5, 15)
    expect(r.ok).toBe(true)
    expect(r.local).toContain('soma.ts')
    expect(r.local).toContain(':1:')
  })

  it('diagnosticos reporta erro de tipo', () => {
    const ruim = join(raiz, 'ruim.ts')
    writeFileSync(ruim, 'const x: number = "texto"\n', 'utf8')
    lspAbrir(raiz, 'ruim.ts')
    const r = lspDiagnosticos(raiz, 'ruim.ts')
    expect(r.ok).toBe(true)
    expect(r.itens.some((d) => d.severidade === 'erro')).toBe(true)
  })

  it('arquivo limpo nao gera erros', () => {
    const r = lspDiagnosticos(raiz, 'soma.ts')
    expect(r.ok).toBe(true)
    expect(r.itens.filter((d) => d.severidade === 'erro')).toHaveLength(0)
  })
})
