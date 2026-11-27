import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { proporCodigoCriar, ehToolEscrita, aplicarPropostaComCheckpoint } from '../propostas'

// FASE 5 — codigo_criar: arquivo novo vira PROPOSTA; recusa existente,
// caminho fora da raiz e .env/segredo/certificado.
describe('codigo_criar — proposta com protecoes', () => {
  let raiz = ''
  beforeAll(() => {
    raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-criar-'))
    fs.writeFileSync(path.join(raiz, 'existente.ts'), 'export const x = 1\n', 'utf8')
  })
  afterAll(() => {
    try { fs.rmSync(raiz, { recursive: true, force: true }) } catch { /* */ }
  })

  it('ehToolEscrita reconhece codigo_criar', () => {
    expect(ehToolEscrita('codigo_criar')).toBe(true)
  })

  it('recusa arquivo que ja existe (usar codigo_editar)', () => {
    const r = proporCodigoCriar(raiz, { caminho: 'existente.ts', conteudo: 'x' }, [raiz])
    expect(r.ok).toBe(false)
    expect(r.texto).toMatch(/ja existe/)
    expect(r.texto).toMatch(/codigo_editar/)
  })

  it('recusa caminho fora da raiz', () => {
    const r = proporCodigoCriar(raiz, { caminho: '../fora.ts', conteudo: 'x' }, [raiz])
    expect(r.ok).toBe(false)
    expect(r.texto).toMatch(/fora da raiz/)
  })

  it('recusa .env e certificado', () => {
    for (const c of ['.env', 'config/.env.local', 'certs/server.pem', 'chaves/id_rsa']) {
      const r = proporCodigoCriar(raiz, { caminho: c, conteudo: 'x' }, [raiz])
      expect(r.ok, c).toBe(false)
      expect(r.texto, c).toMatch(/protegido|fora da raiz/)
    }
  })

  it('arquivo novo: proposta com diff completo; disco intacto ate aprovar', async () => {
    const r = proporCodigoCriar(
      raiz,
      { caminho: 'novo/modulo.ts', conteudo: 'export function oi() {\n  return 42\n}\n' },
      [raiz]
    )
    expect(r.ok).toBe(true)
    expect(r.pendente?.unifiedDiff).toContain('export function oi')
    expect(r.pendente?.unifiedDiff).toContain('novo/modulo.ts')
    // sem aprovacao: arquivo NAO existe no disco
    expect(fs.existsSync(path.join(raiz, 'novo', 'modulo.ts'))).toBe(false)
    // aprovacao cria o arquivo
    const a = await aplicarPropostaComCheckpoint(r.pendente!.id, [raiz])
    expect(a.ok).toBe(true)
    expect(fs.readFileSync(path.join(raiz, 'novo', 'modulo.ts'), 'utf8')).toContain('return 42')
  })
})
