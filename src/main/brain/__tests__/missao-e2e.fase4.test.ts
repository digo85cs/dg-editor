import { describe, it } from 'vitest'
import path from 'path'
import { executarAgente } from '../agent'

// Missao real E2E da FASE 4 — so roda com DG_MISSAO_E2E=1.
// Uso: DG_MISSAO_E2E=1 npx vitest run src/main/brain/__tests__/missao-e2e.fase4.test.ts
const RUN = !!process.env.DG_MISSAO_E2E

describe.skipIf(!RUN)('FASE 4 — missao real ponta a ponta', () => {
  it('agente tenta corrigir teste quebrado; veredito sai do exitCode real', async () => {
    const raiz = path.resolve(process.cwd(), '.dg-editor', 'qa', 'fase3')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 300_000)
    try {
      const r = await executarAgente(raiz, 'O teste em soma.test.ts esta falhando. Corrija o bug e faca o teste passar.', {
        modo: 'agent',
        objetivo: 'corrigir o teste quebrado em soma.test.ts',
        criterioDePronto: { comando: 'npx vitest run', esperado: 0 },
        tetoIteracoes: 8,
        tetoTempoMs: 280_000,
        signal: controller.signal,
        agente: 'dg-engenheiro',
        modeloForcado: process.env.DG_MISSAO_MODELO || 'qwen2.5-coder:7b',
        inlineTools: process.env.DG_MISSAO_INLINE === '1'
      })
      console.log('[E2E] ok=' + r.ok + ' modelo=' + r.modelo)
      console.log('[E2E] propostas=' + JSON.stringify((r.propostas || []).map((p) => ({ id: p.id, path: p.path }))))
      console.log('[E2E] texto final (cauda):\n' + String(r.texto || '').slice(-1200))
      for (const p of r.passos || []) {
        if (p.tipo === 'tool') {
          console.log('[E2E] tool=' + p.nome + ' args=' + JSON.stringify(p.args || {}).slice(0, 140) + ' exit=' + (p.codigoSaida ?? '-'))
        }
      }
    } finally {
      clearTimeout(timer)
    }
  }, 320_000)
})
