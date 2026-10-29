/**
 * Orquestrador do agente de QA.
 * CLI: --suite=ipc|e2e|perf|all  --atualizar-baseline  --report-only  --no-e2e
 */
import { execSync } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { avaliarGeral, gravarRelatorio } from './relatorio'
import { aplicarBaseline } from './baseline'
import { executarSuiteIpc } from './runner-ipc'
import { executarSuitePerf } from './runner-perf'
import { executarSuiteE2e } from './runner-e2e'
import type { OpcoesQA, RelatorioQA, ResultadoCenario, MetricaPerf, SuiteNome } from './tipos'

export function parseArgs(argv: string[]): OpcoesQA {
  const opts: OpcoesQA = { suite: 'all' }
  for (const a of argv) {
    if (a.startsWith('--suite=')) opts.suite = a.slice(8) as SuiteNome
    if (a === '--atualizar-baseline') opts.atualizarBaseline = true
    if (a === '--report-only') opts.reportOnly = true
    if (a === '--no-e2e') opts.noE2e = true
  }
  return opts
}

function gitMeta(raiz: string): { commit: string; branch: string; treeSujo: boolean } {
  try {
    const commit = execSync('git rev-parse --short HEAD', { cwd: raiz, encoding: 'utf-8' }).trim()
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: raiz, encoding: 'utf-8' }).trim()
    const st = execSync('git status --porcelain', { cwd: raiz, encoding: 'utf-8' }).trim()
    return { commit, branch, treeSujo: st.length > 0 }
  } catch {
    return { commit: 'unknown', branch: 'unknown', treeSujo: false }
  }
}

export async function executarQA(raiz: string, opts: OpcoesQA): Promise<RelatorioQA> {
  const artifactsRoot = join(raiz, 'qa-artifacts')
  if (!existsSync(artifactsRoot)) mkdirSync(artifactsRoot, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const outDir = join(artifactsRoot, stamp)
  mkdirSync(outDir, { recursive: true })

  const meta = gitMeta(raiz)
  const resultados: ResultadoCenario[] = []
  let metricas: MetricaPerf[] = []

  const suite = opts.suite || 'all'
  const runIpc = suite === 'all' || suite === 'ipc'
  const runPerf = suite === 'all' || suite === 'perf' || opts.atualizarBaseline
  const runE2e = !opts.noE2e && (suite === 'all' || suite === 'e2e')

  if (opts.reportOnly) {
    // só gera relatório vazio/meta
  } else {
    if (runIpc) {
      const ipc = await executarSuiteIpc()
      resultados.push(...ipc.resultados)
    }
    if (runPerf) {
      const perf = await executarSuitePerf(raiz, !!opts.atualizarBaseline)
      resultados.push(...perf.resultados)
      metricas = perf.metricas
    }
    if (runE2e) {
      const e2e = await executarSuiteE2e(raiz, outDir)
      resultados.push(...e2e.resultados)
      if (e2e.metricasE2e.length) {
        const { metricas: m2 } = aplicarBaseline(raiz, e2e.metricasE2e, false)
        // mescla sem duplicar ids já medidos no perf headless
        for (const m of m2) {
          if (!metricas.find((x) => x.id === m.id)) metricas.push(m)
        }
      }
    }
  }

  const { avaliacaoGeral, avaliacaoDetalhe } = avaliarGeral(resultados, metricas)
  const porSeveridade = {
    ok: resultados.filter((r) => r.severidade === 'ok').length,
    warn: resultados.filter((r) => r.severidade === 'warn').length,
    erro: resultados.filter((r) => r.severidade === 'erro').length
  }

  const relatorio: RelatorioQA = {
    geradoEm: new Date().toISOString(),
    commit: meta.commit,
    branch: meta.branch,
    treeSujo: meta.treeSujo,
    totalCenarios: resultados.length,
    porSeveridade,
    metricas,
    resultados,
    correcoesAplicadas: [],
    pendentesManuais: resultados.filter((r) => r.corrigivel === false && r.severidade === 'erro'),
    avaliacaoGeral,
    avaliacaoDetalhe
  }

  const paths = gravarRelatorio(raiz, relatorio, outDir)
  console.log('')
  console.log('[qa] avaliacaoGeral=' + avaliacaoGeral)
  console.log('[qa] ok=' + porSeveridade.ok + ' warn=' + porSeveridade.warn + ' erro=' + porSeveridade.erro)
  console.log('[qa] relatorio: ' + paths.md)
  return relatorio
}

async function mainCli() {
  const raiz = process.cwd()
  const opts = parseArgs(process.argv.slice(2))
  const r = await executarQA(raiz, opts)
  process.exit(r.porSeveridade.erro > 0 ? 1 : 0)
}

if (require.main === module) {
  mainCli().catch((e) => {
    console.error('[qa] falha fatal:', e)
    process.exit(1)
  })
}
