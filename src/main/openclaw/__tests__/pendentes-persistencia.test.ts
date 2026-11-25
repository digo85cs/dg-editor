import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const ROOT = mkdtempSync(join(tmpdir(), 'dg-pend-'))
process.env.DG_ROOT = ROOT

const ALVO = join(ROOT, 'alvo.txt')

async function mod() {
  return await import('../diffs')
}

describe('persistencia de propostas pendentes (B2)', () => {
  beforeAll(() => {
    writeFileSync(ALVO, 'linha um\nlinha dois\nlinha tres\n', 'utf8')
  })
  afterAll(() => {
    rmSync(ROOT, { recursive: true, force: true })
  })

  it('grava pendente em disco e recarrega em "novo processo"', async () => {
    const m1 = await mod()
    const r = m1.adicionarPendentes(
      [{ path: 'alvo.txt', unifiedDiff: '@@ -1,3 +1,3 @@\n linha um\n-linha dois\n+linha DOIS\n linha tres\n' }],
      [ROOT],
      'agent'
    )
    expect(r.pendentes).toHaveLength(1)
    const store = join(ROOT, '.dg-editor', 'openclaw', 'pendentes.json')
    expect(existsSync(store)).toBe(true)
    const j = JSON.parse(readFileSync(store, 'utf8'))
    expect(j.pendentes).toHaveLength(1)
    expect(j.pendentes[0].hashAlvo).toBeTruthy()

    // simula reinicio: reseta registry de modulos e reimporta
    const { vi } = await import('vitest')
    vi.resetModules()
    const m2 = await mod()
    const lista = m2.listarPendentes()
    expect(lista).toHaveLength(1)
    expect(lista[0].id).toBe(r.pendentes[0].id)
  })

  it('recusa aplicar quando o arquivo mudou depois da proposta', async () => {
    const m = await mod()
    const lista = m.listarPendentes()
    expect(lista.length).toBeGreaterThan(0)
    const id = lista[0].id
    writeFileSync(ALVO, 'linha um\nlinha dois ALTERADA\nlinha tres\n', 'utf8')
    const r = await m.aplicarPendenteAprovado(id, [ROOT])
    expect(r.ok).toBe(false)
    expect(r.erro).toMatch(/mudou depois da proposta/)
    expect(readFileSync(ALVO, 'utf8')).toContain('ALTERADA')
  })

  it('store corrompido nao derruba: renomeia e segue vazio', async () => {
    const store = join(ROOT, '.dg-editor', 'openclaw', 'pendentes.json')
    writeFileSync(store, '{lixo corrompido', 'utf8')
    const { vi } = await import('vitest')
    vi.resetModules()
    const m = await mod()
    expect(m.listarPendentes()).toEqual([])
    expect(existsSync(store + '.corrompido')).toBe(true)
  })
})
