import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  carregarIndiceCodigo,
  gerarIndice,
  lerSimbolo,
  salvarIndice
} from '../indice'
import { executarToolCall } from '../../mcp/dispatch'

const RAIZ_DG = path.resolve(process.cwd())
let RAIZ_QA = ''

beforeAll(() => {
  RAIZ_QA = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-medir-codigo-ler-'))
  fs.writeFileSync(
    path.join(RAIZ_QA, 'soma.test.ts'),
    'export function soma(a: number, b: number) { return a + b }\n',
    'utf8'
  )
})

afterAll(() => {
  delete process.env.DG_ROOT
  if (RAIZ_QA) fs.rmSync(RAIZ_QA, { recursive: true, force: true })
})

function t(label: string, fn: () => unknown) {
  const t0 = Date.now()
  const r = fn()
  console.log('[TEMPO] ' + label + ' => ' + (Date.now() - t0) + 'ms')
  return r
}

describe('FASE 1 — medir codigo_ler / lerSimbolo', () => {
  it('tempos do indice e do lerSimbolo nas duas raizes', () => {
    for (const [nome, raiz] of [['DGEditor', RAIZ_DG], ['qa/fase3', RAIZ_QA]] as const) {
      const idx = t('carregarIndiceCodigo ' + nome, () => carregarIndiceCodigo(raiz))
      console.log('  -> indice cacheado:', idx ? idx.simbolos.length + ' simbolos, geradoEm ' + idx.geradoEm : 'AUSENTE')
      if (!idx || !idx.simbolos?.length) {
        const t0 = Date.now()
        const gerado = gerarIndice(raiz)
        console.log('[TEMPO] gerarIndice ' + nome + ' => ' + (Date.now() - t0) + 'ms (' + gerado.simbolos.length + ' simbolos)')
        salvarIndice(raiz, gerado)
      }
      const hit = t('lerSimbolo arquivo ' + nome, () => lerSimbolo(raiz, 'soma.test.ts'))
      console.log('  -> arquivo:', hit ? hit.arquivo + ' (' + (hit.totalLinhas ?? '?') + ' linhas)' : 'null')
      const hit2 = t('lerSimbolo simbolo ' + nome, () => lerSimbolo(raiz, 'executarAgente'))
      console.log('  -> simbolo:', hit2 ? hit2.arquivo + ':' + hit2.linhaInicio : 'null')
    }
  }, 120000)

  it('executarToolCall codigo_ler direto (sem MCP stdio)', async () => {
    process.env.DG_ROOT = RAIZ_QA
    let r = await executarToolCall('codigo_ler', { nome: 'soma.test.ts' })
    let j = JSON.parse((r.content as Array<{ text: string }>)[0].text)
    expect(j.arquivo).toContain('soma.test.ts')
    console.log('[TEMPO] dispatch codigo_ler qa/fase3 soma.test.ts => modo=' + j.modo + ' arquivo=' + j.arquivo)

    process.env.DG_ROOT = RAIZ_DG
    const t0 = Date.now()
    r = await executarToolCall('codigo_ler', { nome: 'agent.ts' })
    const ms = Date.now() - t0
    const txt = (r.content as Array<{ text: string }>)[0].text
    let j2: Record<string, unknown> = {}
    try { j2 = JSON.parse(txt) } catch { j2 = { bruto: txt.slice(0, 120) } }
    console.log('[TEMPO] dispatch codigo_ler DGEditor agent.ts => ' + ms + 'ms isError=' + r.isError + ' texto=' + JSON.stringify(j2).slice(0, 160))
    delete process.env.DG_ROOT
  }, 120000)
})
