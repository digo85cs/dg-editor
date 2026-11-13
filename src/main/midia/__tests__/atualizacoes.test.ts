import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { lerPreferenciasAtualizacao, salvarPreferenciasAtualizacao } from '../atualizacoes'

const dirTeste = mkdtempSync(join(tmpdir(), 'dg-atualizacoes-'))
let envAnterior: string | undefined

beforeAll(() => {
  envAnterior = process.env.DG_ATUALIZACOES_DIR
  process.env.DG_ATUALIZACOES_DIR = dirTeste
})

afterAll(() => {
  if (envAnterior === undefined) delete process.env.DG_ATUALIZACOES_DIR
  else process.env.DG_ATUALIZACOES_DIR = envAnterior
  rmSync(dirTeste, { recursive: true, force: true })
})

describe('preferências de atualização', () => {
  it('padrão verifica 1×/dia sem aplicar sozinho', () => {
    const p = lerPreferenciasAtualizacao()
    expect(p.automatico).toBe(true)
    expect(p.aplicarAutomatico).toBe(false)
  })

  it('salva e relê as preferências', () => {
    const p = salvarPreferenciasAtualizacao({ automatico: false, aplicarAutomatico: true })
    expect(p.automatico).toBe(false)
    expect(p.aplicarAutomatico).toBe(true)
    const lido = lerPreferenciasAtualizacao()
    expect(lido.automatico).toBe(false)
    expect(lido.aplicarAutomatico).toBe(true)
  })

  it('ignora arquivo corrompido e volta ao padrão', async () => {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(join(dirTeste, 'atualizacoes.json'), '{ nao é json', 'utf8')
    const p = lerPreferenciasAtualizacao()
    expect(p.automatico).toBe(true)
    expect(p.aplicarAutomatico).toBe(false)
  })
})
