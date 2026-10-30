import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { RelatorioQA, ResultadoCenario, MetricaPerf } from './tipos'

export function avaliarGeral(resultados: ResultadoCenario[], metricas: MetricaPerf[]): {
  avaliacaoGeral: RelatorioQA['avaliacaoGeral']
  avaliacaoDetalhe: string
} {
  const erros = resultados.filter((r) => r.severidade === 'erro').length
  const warns = resultados.filter((r) => r.severidade === 'warn').length
  const perfFora = metricas.filter((m) => !m.dentroDoLimite).length
  if (erros > 0) {
    return {
      avaliacaoGeral: 'instavel',
      avaliacaoDetalhe:
        erros +
        ' cenario(s) com erro' +
        (perfFora ? '; ' + perfFora + ' metrica(s) fora do limite' : '') +
        '.'
    }
  }
  if (warns > 0 || perfFora > 0) {
    return {
      avaliacaoGeral: 'atencao',
      avaliacaoDetalhe:
        (warns ? warns + ' aviso(s)' : 'sem avisos') +
        (perfFora ? '; ' + perfFora + ' metrica(s) acima da baseline (+30%)' : '') +
        '.'
    }
  }
  return {
    avaliacaoGeral: 'estavel',
    avaliacaoDetalhe: 'Todos os cenarios ok e metricas dentro do limite (folga 30%).'
  }
}

export function montarMarkdown(r: RelatorioQA): string {
  const linhas: string[] = []
  linhas.push('# Relatorio QA — DG Editor')
  linhas.push('')
  linhas.push('- Gerado: `' + r.geradoEm + '`')
  linhas.push('- Branch: `' + r.branch + '` @ `' + r.commit + '`')
  linhas.push('- Tree sujo: ' + (r.treeSujo ? 'sim' : 'nao'))
  linhas.push('- Avaliacao: **' + r.avaliacaoGeral + '** — ' + r.avaliacaoDetalhe)
  linhas.push(
    '- Totais: ok=' +
      r.porSeveridade.ok +
      ' warn=' +
      r.porSeveridade.warn +
      ' erro=' +
      r.porSeveridade.erro +
      ' / ' +
      r.totalCenarios
  )
  linhas.push('')
  linhas.push('## Metricas')
  linhas.push('')
  if (!r.metricas.length) linhas.push('_Nenhuma metrica nesta execucao._')
  for (const m of r.metricas) {
    linhas.push(
      `- \`${m.id}\`: ${m.valor}${m.unidade} (limite ${m.limite}${m.unidade}) — ` +
        (m.dentroDoLimite ? 'OK' : 'FORA')
    )
  }
  linhas.push('')
  linhas.push('## Cenarios')
  linhas.push('')
  for (const c of r.resultados) {
    const marca = c.severidade === 'ok' ? 'OK' : c.severidade === 'warn' ? 'WARN' : 'ERRO'
    linhas.push(
      `- [${marca}] \`${c.id}\` (${c.duracaoMs}ms) — ${c.titulo}` +
        (c.detalhe ? ' — ' + c.detalhe : '') +
        (c.erro ? ' — erro: ' + c.erro : '') +
        (c.screenshot ? ' — shot: ' + c.screenshot : '')
    )
  }
  if (r.pendentesManuais.length) {
    linhas.push('')
    linhas.push('## Pendentes manuais')
    for (const p of r.pendentesManuais) {
      linhas.push('- `' + p.id + '`: ' + (p.erro || p.detalhe || p.titulo))
    }
  }
  if (r.correcoesAplicadas.length) {
    linhas.push('')
    linhas.push('## Correcoes aplicadas')
    for (const c of r.correcoesAplicadas) {
      linhas.push('- `' + c.cenarioId + '` → ' + c.commit + ' (' + c.testeRegressao + ')')
    }
  }
  linhas.push('')
  return linhas.join('\n')
}

export function gravarRelatorio(
  raiz: string,
  r: RelatorioQA,
  dirPreferido?: string
): { dir: string; md: string; json: string } {
  const stamp = r.geradoEm.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const dir = dirPreferido || join(raiz, 'qa-artifacts', stamp)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'relatorio.md')
  const jsonPath = join(dir, 'relatorio.json')
  writeFileSync(mdPath, montarMarkdown(r), 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(r, null, 2), 'utf-8')
  // copia "latest"
  const latest = join(raiz, 'qa-artifacts', 'latest')
  if (!existsSync(latest)) mkdirSync(latest, { recursive: true })
  writeFileSync(join(latest, 'relatorio.md'), montarMarkdown(r), 'utf-8')
  writeFileSync(join(latest, 'relatorio.json'), JSON.stringify(r, null, 2), 'utf-8')
  return { dir, md: mdPath, json: jsonPath }
}
