import { describe, it, expect } from 'vitest'
import path from 'path'
import fs from 'fs'
import { executarAgente } from '../agent'
import { aplicarPropostaComCheckpoint, listarPendentes } from '../../agent/propostas'

// FASE 5 — missao real que CRIA arquivo via codigo_criar.
// Fluxo: missao gera PROPOSTA (disco intacto) -> aprovacao aplica ->
// npx vitest run dobro.test.ts sai 0 de verdade.
// Uso: DG_MISSAO_E2E=1 npx vitest run src/main/brain/__tests__/missao-criar-e2e.test.ts
const RUN = !!process.env.DG_MISSAO_E2E
const ALVO = 'dobro.test.ts'

describe.skipIf(!RUN)('FASE 5 — missao real criando arquivo', () => {
  it('codigo_criar vira proposta; apos aprovar, criterio passa com exit 0', async () => {
    const raiz = path.resolve(process.cwd(), '.dg-editor', 'qa', 'fase3')
    const alvoAbs = path.join(raiz, ALVO)
    try { fs.rmSync(alvoAbs, { force: true }) } catch { /* */ }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 560_000)
    let r
    try {
      r = await executarAgente(
        raiz,
        'Crie o arquivo ' + ALVO + ' com um teste vitest que verifica que dobro(4) === 8 (funcao dobro(x)=x*2 definida no proprio teste). Depois rode npx vitest run ' + ALVO + '.',
        {
          modo: 'agent',
          objetivo: 'criar ' + ALVO + ' com teste que passa',
          criterioDePronto: { comando: 'npx vitest run ' + ALVO, esperado: 0 },
          tetoIteracoes: 10,
          tetoTempoMs: 540_000,
          signal: controller.signal,
          agente: 'dg-engenheiro',
          modeloForcado: process.env.DG_MISSAO_MODELO || 'qwen2.5-coder:3b',
          inlineTools: true
        }
      )
    } finally {
      clearTimeout(timer)
    }

    console.log('[CRIARe2e] ok=' + r.ok + ' modelo=' + r.modelo)
    console.log('[CRIARe2e] propostas=' + JSON.stringify((r.propostas || []).map((p) => ({ id: p.id, path: p.path }))))
    for (const p of r.passos || []) {
      if (p.tipo === 'tool') {
        console.log('[CRIARe2e] tool=' + p.nome + ' args=' + JSON.stringify(p.args || {}).slice(0, 160) + ' exit=' + (p.codigoSaida ?? '-'))
      }
    }

    // 1) proposta gerada e disco intacto antes da aprovacao
    const prop = (r.propostas || [])[0]
    expect(prop, 'missao deveria gerar proposta de criacao').toBeTruthy()
    expect(fs.existsSync(alvoAbs), 'arquivo nao pode existir antes da aprovacao').toBe(false)

    // 2) aprovacao humana aplica com checkpoint
    const aplicada = await aplicarPropostaComCheckpoint(prop!.id, [raiz])
    console.log('[CRIARe2e] aplicar=' + JSON.stringify(aplicada))
    expect(aplicada.ok).toBe(true)
    expect(fs.existsSync(alvoAbs)).toBe(true)

    // 3) criterio real: vitest so no arquivo novo — exit 0 de verdade
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const execFileP = promisify(execFile)
    let exitCode = -1
    let saida = ''
    try {
      // npx e shim .cmd no Windows — via cmd /c (mesmo motivo do AGENTS.md)
      const out = await execFileP('cmd.exe', ['/c', 'npx', 'vitest', 'run', ALVO], {
        cwd: raiz,
        timeout: 120_000,
        windowsHide: true,
        encoding: 'utf8'
      })
      saida = String(out.stdout) + String(out.stderr)
      exitCode = 0
    } catch (e: any) {
      saida = String(e.stdout || '') + String(e.stderr || '') + String(e.message || '')
      exitCode = typeof e.code === 'number' ? e.code : 1
    }
    console.log('[CRIARe2e] vitest exit=' + exitCode + '\n' + saida.slice(-600))
    expect(exitCode).toBe(0)
  }, 600_000)
})
