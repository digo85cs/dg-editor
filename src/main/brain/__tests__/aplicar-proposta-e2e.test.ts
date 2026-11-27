import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { proporCodigoEditar, aplicarPropostaComCheckpoint, obterPendente } from '../../agent/propostas'

// FASE 2 — fluxo completo: missao gera PROPOSTA (disco intacto),
// aprovacao aplica via checkpoint e o arquivo muda.
describe('FASE 2 — escrita em missao vira proposta, nao gravacao direta', () => {
  let raiz = '';
  let alvo = ''
  const CONTEUDO_ANTES = 'function soma(a: number, b: number): number {\n  return a - b\n}\n'
  const CONTEUDO_DEPOIS = 'function soma(a: number, b: number): number {\n  return a + b\n}\n'

  beforeAll(() => {
    raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-prop-'))
    alvo = path.join(raiz, 'soma.ts')
    fs.writeFileSync(alvo, CONTEUDO_ANTES, 'utf8')
  })

  afterAll(() => {
    try { fs.rmSync(raiz, { recursive: true, force: true }) } catch { /* */ }
  })

  it('proposta nao grava no disco; aprovar aplica o diff', async () => {
    const p = proporCodigoEditar(raiz, { arquivo: 'soma.ts', ancora: 'return a - b', novo: 'return a + b' }, [raiz])
    expect(p.ok).toBe(true)
    expect(p.pendente?.id).toBeTruthy()
    expect(p.pendente?.unifiedDiff).toContain('return a + b')

    // sem aprovacao: disco NAO mudou
    expect(fs.readFileSync(alvo, 'utf8')).toBe(CONTEUDO_ANTES)

    const r = await aplicarPropostaComCheckpoint(p.pendente!.id, [raiz])
    expect(r.ok).toBe(true)
    expect(r.checkpointId).toBeTruthy()

    expect(fs.readFileSync(alvo, 'utf8')).toBe(CONTEUDO_DEPOIS)
    expect(obterPendente(p.pendente!.id)?.status).not.toBe('pendente')
  })
})
