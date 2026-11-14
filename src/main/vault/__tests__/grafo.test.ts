import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { fecharIndice, grafoVault, indexarVaultCompleto } from '../indice'

const temporarios: string[] = []

function criarVault(arquivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), 'dg-vault-grafo-'))
  temporarios.push(raiz)
  for (const [nome, texto] of Object.entries(arquivos)) {
    writeFileSync(join(raiz, nome), texto, 'utf8')
  }
  return raiz
}

afterEach(() => {
  fecharIndice()
  for (const dir of temporarios.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('grafoVault', () => {
  it('monta nós e arestas deduplicadas, ignora self-link e alvo inexistente', async () => {
    const raiz = criarVault({
      'A.md': 'Liga [[B]] duas vezes [[B]] e [[C]] e a si [[A]].',
      'B.md': 'Liga [[C]] e [[Inexistente]].',
      'C.md': 'Sem links.',
      'D.md': 'Órfã.'
    })
    const idx = await indexarVaultCompleto(raiz)
    expect(idx.ok).toBe(true)

    const g = grafoVault()
    expect(g.totalNotas).toBe(4)
    expect(g.truncado).toBe(false)
    expect(g.nos).toHaveLength(4)
    expect(g.arestas).toHaveLength(3)
    const porTitulo = new Map(g.nos.map((n) => [n.titulo, n]))
    expect(porTitulo.get('A')?.grau).toBe(2)
    expect(porTitulo.get('B')?.grau).toBe(2)
    expect(porTitulo.get('C')?.grau).toBe(2)
    expect(porTitulo.get('D')?.grau).toBe(0)
    const chaves = g.arestas.map((a) => a.origem + '>' + a.destino)
    expect(chaves).toHaveLength(new Set(chaves).size)
    expect(g.arestas.some((a) => a.origem === a.destino)).toBe(false)
  })

  it('trunca mantendo os nós de maior grau', async () => {
    const raiz = criarVault({
      'A.md': '[[B]] [[C]]',
      'B.md': '[[C]]',
      'C.md': 'fim',
      'D.md': 'órfã'
    })
    await indexarVaultCompleto(raiz)
    const g = grafoVault(2)
    expect(g.truncado).toBe(true)
    expect(g.totalNotas).toBe(4)
    expect(g.nos).toHaveLength(2)
    expect(g.nos.map((n) => n.rel).sort()).toEqual(['A.md', 'B.md'])
    for (const a of g.arestas) {
      for (const n of g.nos) expect([a.origem, a.destino]).toContain(n.path)
    }
  })

  it('vault vazio devolve grafo vazio', async () => {
    const raiz = criarVault({})
    await indexarVaultCompleto(raiz)
    expect(grafoVault()).toEqual({
      nos: [],
      arestas: [],
      totalNotas: 0,
      truncado: false
    })
  })
})
