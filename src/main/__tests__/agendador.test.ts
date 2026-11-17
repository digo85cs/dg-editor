import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { adicionarJob, alternarJob, listarJobs, removerJob } from '../agendador'

beforeAll(() => {
  process.env.DG_USERDATA = mkdtempSync(join(tmpdir(), 'dg-agendador-'))
})

describe('agendador', () => {
  it('adiciona e lista job', () => {
    const j = adicionarJob({ prompt: 'revisar docs', cadaMin: 30, raiz: 'C:/tmp' })
    expect(j.id).toBeTruthy()
    expect(j.cadaMin).toBe(30)
    expect(j.ativo).toBe(true)
    expect(listarJobs().some((x) => x.id === j.id)).toBe(true)
  })

  it('cadaMin tem piso de 5', () => {
    const j = adicionarJob({ prompt: 'x', cadaMin: 1, raiz: 'C:/tmp' })
    expect(j.cadaMin).toBe(5)
  })

  it('alternar pausa e remove', () => {
    const j = adicionarJob({ prompt: 'y', cadaMin: 60, raiz: 'C:/tmp' })
    const off = alternarJob(j.id)
    expect(off?.ativo).toBe(false)
    const on = alternarJob(j.id)
    expect(on?.ativo).toBe(true)
    expect(removerJob(j.id)).toBe(true)
    expect(listarJobs().some((x) => x.id === j.id)).toBe(false)
  })
})
