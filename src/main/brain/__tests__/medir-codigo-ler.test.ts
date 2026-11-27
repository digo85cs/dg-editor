import { describe, it } from 'vitest'
import path from 'path'
import {
  carregarIndiceCodigo,
  gerarIndice,
  lerSimbolo,
  salvarIndice
} from '../indice'
import { executarToolCall } from '../../mcp/dispatch'

const RAIZ_DG = path.resolve(process.cwd())
const RAIZ_QA = path.resolve(process.cwd(), '.dg-editor', 'qa', 'fase3')

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
    console.log('[TEMPO] dispatch codigo_ler qa/fase3 soma.test.ts => modo=' + j.modo + ' arquivo=' + j.arquivo)

    process.env.DG_ROOT = RAIZ_DG
    const t0 = Date.now()
    r = await executarToolCall('codigo_ler', { nome: 'soma.test.ts' })
    const ms = Date.now() - t0
    j = JSON.parse((r.content as Array<{ text: string }>)[0].text)
    console.log('[TEMPO] dispatch codigo_ler DGEditor soma.test.ts => ' + ms + 'ms isError=' + r.isError + ' texto=' + JSON.stringify(j).slice(0, 160))
    delete process.env.DG_ROOT
  }, 120000)
})
