import { describe, it, expect } from 'vitest'
import path from 'path'
import fs from 'fs'
import { aplicarPropostaComCheckpoint, obterPendente, listarPendentes } from '../../agent/propostas'

// Prova FASE 2: aprovar a proposta gerada pela missao E2E e verificar o disco.
describe('FASE 2 — aplicar proposta da missao real', () => {
  it('aplica a proposta pendente e o arquivo muda no disco', async () => {
    const raiz = path.resolve(process.cwd(), '.dg-editor', 'qa', 'fase3')
    const alvo = path.join(raiz, 'soma.test.ts')
    const antes = fs.readFileSync(alvo, 'utf8')
    expect(antes).toContain('return a - b')

    const pend = listarPendentes().find((p) => p.path === alvo && p.status === 'pendente')
    expect(pend, 'proposta pendente nao encontrada').toBeTruthy()

    const r = await aplicarPropostaComCheckpoint(pend!.id, [raiz])
    expect(r.ok).toBe(true)

    const depois = fs.readFileSync(alvo, 'utf8')
    expect(depois).toContain('return a + b')
    expect(depois).not.toContain('return a - b')
    expect(obterPendente(pend!.id)?.status).not.toBe('pendente')
  })
})
