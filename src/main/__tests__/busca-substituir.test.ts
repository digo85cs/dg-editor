import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { buscaConteudo, substituirConteudo } from '../busca'

describe('busca: substituir', () => {
  it('previa conta e aplica substituindo em disco', async () => {
    const base = mkdtempSync(join(tmpdir(), 'dg-busca-subst-'))
    mkdirSync(join(base, 'sub'))
    writeFileSync(join(base, 'a.txt'), 'alfa\nTOKEN\nbeta\nTOKEN extra\n', 'utf8')
    writeFileSync(join(base, 'sub', 'b.md'), '# t\nTOKEN\n', 'utf8')
    try {
      const previa = substituirConteudo(base, 'TOKEN', 'SUBST', { previa: true })
      expect(previa.ok).toBe(true)
      expect(previa.arquivos).toBe(2)
      expect(previa.ocorrencias).toBe(3)

      const aplicar = substituirConteudo(base, 'TOKEN', 'SUBST', { previa: false })
      expect(aplicar.ok).toBe(true)
      expect(aplicar.alterados).toBe(2)

      expect(readFileSync(join(base, 'a.txt'), 'utf8')).toContain('SUBST extra')
      const resto = await buscaConteudo(base, 'TOKEN', {})
      expect(resto.itens).toHaveLength(0)
      const novos = await buscaConteudo(base, 'SUBST', {})
      expect(novos.itens).toHaveLength(3)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('regex invalida retorna erro sem gravar', () => {
    const base = mkdtempSync(join(tmpdir(), 'dg-busca-subst-'))
    try {
      const r = substituirConteudo(base, '([', 'x', { regex: true, previa: false })
      expect(r.ok).toBe(false)
      expect(String(r.erro)).toContain('regex')
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
})
