import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import {
  verificarCriterio,
  gravarArtefatoMissao,
  type PassoAgente,
  type IteracaoMissao
} from '../agent'
import { executarToolCall } from '../../mcp/dispatch'

function passoExec(comando: string, argv: string[], codigoSaida?: number): PassoAgente {
  return {
    tipo: 'tool',
    nome: 'terminal_exec',
    args: { comando, args: argv },
    resultado: '{"ok":true}',
    codigoSaida
  }
}

const CRITERIO = { comando: 'npx vitest run', esperado: 0 }

describe('FASE 1 — verificarCriterio com comando exato e exitCode real', () => {
  it('a) passo com exitCode 0 -> sucesso', async () => {
    const passos = [passoExec('npx', ['vitest', 'run'], 0)]
    expect(await verificarCriterio('/tmp', CRITERIO, passos)).toBe('sucesso')
  })

  it('b) passo com exitCode 1 -> falha', async () => {
    const passos = [passoExec('npx', ['vitest', 'run'], 1)]
    expect(await verificarCriterio('/tmp', CRITERIO, passos)).toBe('falha')
  })

  it('c) passo sem exitCode -> nao-provado', async () => {
    const passos = [passoExec('npx', ['vitest', 'run'], undefined)]
    expect(await verificarCriterio('/tmp', CRITERIO, passos)).toBe('nao-provado')
  })

  it('d) nenhum passo com esse comando -> nao-provado', async () => {
    const passos = [passoExec('node', ['-v'], 0)]
    expect(await verificarCriterio('/tmp', CRITERIO, passos)).toBe('nao-provado')
  })

  it('e) exit 0 antigo + exit 1 no ultimo -> falha', async () => {
    const passos = [
      passoExec('npx', ['vitest', 'run'], 0),
      passoExec('npm', ['test'], 0),
      passoExec('npx', ['vitest', 'run'], 1)
    ]
    expect(await verificarCriterio('/tmp', CRITERIO, passos)).toBe('falha')
  })

  it('f) criterio string livre -> nao-provado', async () => {
    const passos = [passoExec('npx', ['vitest', 'run'], 0)]
    expect(await verificarCriterio('/tmp', 'npx vitest run sai com codigo 0', passos)).toBe('nao-provado')
  })

  it('g) string que e so o comando funciona como atalho', async () => {
    const passos = [passoExec('npx', ['vitest', 'run'], 0)]
    expect(await verificarCriterio('/tmp', 'npx vitest run', passos)).toBe('sucesso')
  })
})

describe('FASE 2 — exitCode real via dispatch MCP (executarToolCall)', () => {
  it('node -v retorna exitCode 0 e comando que falha retorna != 0', async () => {
    const raiz = mkdtempSync(path.join(tmpdir(), 'dg-crit-'))
    process.env.DG_ROOT = raiz

    const okRes = await executarToolCall('terminal_exec', { comando: 'node', args: ['-v'] })
    const okJson = JSON.parse((okRes.content as Array<{ text: string }>)[0].text)
    console.log('[FASE2] node -v =>', JSON.stringify(okJson).slice(0, 300))
    expect(okJson.exitCode).toBe(0)

    const falhaRes = await executarToolCall('terminal_exec', { comando: 'npm', args: ['test'] })
    const falhaJson = JSON.parse((falhaRes.content as Array<{ text: string }>)[0].text)
    console.log('[FASE2] npm test (sem package.json) =>', JSON.stringify(falhaJson).slice(0, 300))
    expect(typeof falhaJson.exitCode).toBe('number')
    expect(falhaJson.exitCode).not.toBe(0)

    delete process.env.DG_ROOT
  }, 30000)
})

describe('FASE 3 — artefato grava iteracoesMissao real', () => {
  it('iteracoes.json e veredito.json com exitCode real', () => {
    const raiz = mkdtempSync(path.join(tmpdir(), 'dg-artef-'))
    const passos: PassoAgente[] = [
      passoExec('npx', ['vitest', 'run'], 1),
      passoExec('npx', ['vitest', 'run'], 0)
    ]
    const iteracoes: IteracaoMissao[] = [
      { iteracao: 1, oQueTentou: 'terminal_exec npx vitest run', comando: 'npx vitest run', codigoSaida: 1, saidaReal: 'FAIL 1 test' },
      { iteracao: 2, oQueTentou: 'terminal_exec npx vitest run', comando: 'npx vitest run', codigoSaida: 0, saidaReal: 'PASS 1 test' }
    ]
    gravarArtefatoMissao(raiz, 'corrigir teste', CRITERIO, 'sucesso', passos, iteracoes)

    const missoesDir = path.join(raiz, '.dg-editor', 'missoes')
    const id = readdirSync(missoesDir)[0]
    const dir = path.join(missoesDir, id)
    const iterJson = JSON.parse(readFileSync(path.join(dir, 'iteracoes.json'), 'utf8'))
    const vereditoJson = JSON.parse(readFileSync(path.join(dir, 'veredito.json'), 'utf8'))
    console.log('[FASE3] iteracoes.json =>', JSON.stringify(iterJson, null, 2))
    console.log('[FASE3] veredito.json =>', JSON.stringify(vereditoJson, null, 2))

    expect(iterJson.iteracoes).toHaveLength(2)
    expect(iterJson.iteracoes[0].exitCode).toBe(1)
    expect(iterJson.iteracoes[1].exitCode).toBe(0)
    expect(iterJson.iteracoes[0].comando).toBe('npx vitest run')
    expect(vereditoJson.resultado).toBe('sucesso')
    expect(vereditoJson.obtido).toBe(0)
    expect(vereditoJson.executado).toBe(true)
  })

  it('criterio string gera veredito nao-provado com motivo', () => {
    const raiz = mkdtempSync(path.join(tmpdir(), 'dg-artef2-'))
    const passos: PassoAgente[] = [passoExec('npx', ['vitest', 'run'], 0)]
    gravarArtefatoMissao(raiz, 'missao', 'npx vitest run sai com codigo 0', 'nao-provado', passos, [])
    const missoesDir = path.join(raiz, '.dg-editor', 'missoes')
    const id = readdirSync(missoesDir)[0]
    const vereditoJson = JSON.parse(readFileSync(path.join(missoesDir, id, 'veredito.json'), 'utf8'))
    console.log('[FASE3b] veredito.json =>', JSON.stringify(vereditoJson, null, 2))
    expect(vereditoJson.resultado).toBe('nao-provado')
    expect(vereditoJson.motivo).toMatch(/formato de comando/)
  })
})
