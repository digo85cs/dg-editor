import { describe, it, expect } from 'vitest'
import path from 'path'
import fs from 'fs'
import { executarAgente } from '../agent'
import { aplicarPropostaComCheckpoint } from '../../agent/propostas'

// FASE 5 — missao real SEM modelo forcado: a fila decide (perfil VRAM).
// Nesta maquina (VRAM 2GB) o esperado e qwen2.5-coder:3b, nao 7b.
// Uso: DG_MISSAO_E2E=1 npx vitest run src/main/brain/__tests__/missao-auto-e2e.test.ts
const RUN = !!process.env.DG_MISSAO_E2E
const ALVO = 'triplo.test.ts'

describe.skipIf(!RUN)('FASE 5 — missao real com modelo automatico', () => {
  it('perfil VRAM escolhe modelo; codigo_criar vira proposta; criterio exit 0', async () => {
    const raiz = path.resolve(process.cwd(), '.dg-editor', 'qa', 'fase3')
    const alvoAbs = path.join(raiz, ALVO)
    try { fs.rmSync(alvoAbs, { force: true }) } catch { /* */ }

    const t0 = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 560_000)
    let r
    try {
      r = await executarAgente(
        raiz,
        'Crie o arquivo ' + ALVO + ' com um teste vitest que verifica que triplo(3) === 9 (funcao triplo(x)=x*3 definida no proprio teste). Depois rode npx vitest run ' + ALVO + '.',
        {
          modo: 'agent',
          objetivo: 'criar ' + ALVO + ' com teste que passa',
          criterioDePronto: { comando: 'npx vitest run ' + ALVO, esperado: 0 },
          tetoIteracoes: 10,
          tetoTempoMs: 540_000,
          signal: controller.signal,
          agente: 'dg-engenheiro',
          // SEM modeloForcado — fila local decide pelo perfil de VRAM
          provider: 'ollama',
          inlineTools: true
        }
      )
    } finally {
      clearTimeout(timer)
    }
    const msTotal = Date.now() - t0

    console.log('[AUTOe2e] ok=' + r.ok + ' modelo=' + r.modelo + ' ms=' + msTotal)
    console.log('[AUTOe2e] propostas=' + JSON.stringify((r.propostas || []).map((p) => ({ id: p.id, path: p.path }))))
    for (const p of r.passos || []) {
      if (p.tipo === 'tool') {
        console.log('[AUTOe2e] tool=' + p.nome + ' args=' + JSON.stringify(p.args || {}).slice(0, 160) + ' exit=' + (p.codigoSaida ?? '-'))
      }
    }
    const veredito = (r as { artefato?: { veredito?: unknown } }).artefato?.veredito
    console.log('[AUTOe2e] veredito=' + JSON.stringify(veredito))

    // modelo automatico nao pode ser 7b/14b nesta maquina (VRAM 2GB -> teto 3b)
    expect(r.modelo).not.toMatch(/:(7b|14b)/)
    expect(r.modelo).toMatch(/3b|1\.5b/)

    const prop = (r.propostas || [])[0]
    expect(prop, 'missao deveria gerar proposta de criacao').toBeTruthy()
    expect(fs.existsSync(alvoAbs), 'arquivo nao pode existir antes da aprovacao').toBe(false)

    const aplicada = await aplicarPropostaComCheckpoint(prop!.id, [raiz])
    console.log('[AUTOe2e] aplicar=' + JSON.stringify(aplicada))
    expect(aplicada.ok).toBe(true)

    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const execFileP = promisify(execFile)
    let exitCode = -1
    let saida = ''
    try {
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
    console.log('[AUTOe2e] vitest exit=' + exitCode + ' msTotal=' + msTotal + '\n' + saida.slice(-400))
    expect(exitCode).toBe(0)
  }, 600_000)
})
