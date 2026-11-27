import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: (n: string) => (n === 'userData' ? process.cwd() : process.env.TEMP || 'C:/Temp'),
    getAppPath: () => process.cwd(),
    getName: () => 'dg-editor',
    getVersion: () => '0.0.0',
    isPackaged: false
  }
}))

import { rodarAuditoriaConsolidada } from '../auto-auditoria'

// FASE 3 — prova real: os 3 checks nao podem gerar achado de erro.
describe('FASE 3 — checks escrita/missao na auto-auditoria', () => {
  it('escrita:gera-proposta, escrita:nao-grava e missao:veredito-honesto sem achado', async () => {
    const rel = await rodarAuditoriaConsolidada()
    const achados: Array<{ id?: string; status?: string; titulo?: string }> =
      (rel as { achados?: typeof achados }).achados || []
    for (const id of [
      'escrita:gera-proposta',
      'escrita:nao-grava',
      'missao:veredito-honesto',
      'hardware:vram-lida',
      'hardware:teto-modelo',
      'tools:rescue-valida',
    ]) {
      const a = achados.find((x) => x.id === id)
      console.log('[AUDIT]', id, '=>', a ? 'ACHADO: ' + a.status + ' ' + (a.titulo || '') : 'OK (sem achado)')
      expect(a, 'check ' + id + ' nao pode falhar').toBeUndefined()
    }
  }, 180_000)
})
