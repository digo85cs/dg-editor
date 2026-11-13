import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  lerPreferenciasProvisionamento,
  pastaProvisionamento,
  salvarPreferenciasProvisionamento,
  versaoApp
} from '../index'

describe('estado do provisionamento', () => {
  let pasta: string

  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'dg-prov-'))
    process.env.DG_FERRAMENTAS_DIR = pasta
  })

  afterEach(() => {
    delete process.env.DG_FERRAMENTAS_DIR
    rmSync(pasta, { recursive: true, force: true })
  })

  it('usa DG_FERRAMENTAS_DIR como pasta gravável e a cria', () => {
    expect(pastaProvisionamento()).toBe(pasta)
    expect(existsSync(pasta)).toBe(true)
  })

  it('começa com atualização automática ligada', () => {
    const p = lerPreferenciasProvisionamento()
    expect(p.auto).toBe(true)
    expect(p.atualizar).toBe(true)
  })

  it('grava e relê as preferências', () => {
    salvarPreferenciasProvisionamento({ auto: false })
    const arquivo = join(pasta, 'preferencias.json')
    expect(existsSync(arquivo)).toBe(true)
    const salvo = JSON.parse(readFileSync(arquivo, 'utf8')) as { auto: boolean }
    expect(salvo.auto).toBe(false)
    expect(lerPreferenciasProvisionamento().auto).toBe(false)
    salvarPreferenciasProvisionamento({ auto: true })
    expect(lerPreferenciasProvisionamento().auto).toBe(true)
  })

  it('lê a versão do DG Editor no package.json', () => {
    expect(versaoApp()).toMatch(/^\d+\.\d+\.\d+/)
  })
})
