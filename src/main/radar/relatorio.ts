/**
 * Geracao do relatorio Markdown do Radar Diario.
 *
 * Produz docs/RADAR.md com, para cada tema:
 * - achados da busca
 * - fonte (URL)
 * - gap: o que a ferramenta faz que o DG Editor nao faz
 * - proposta de superacao (nao copia)
 *
 * Inclui: data, provider usado, custo estimado, prioridades sugeridas.
 */
import type { RadarTema, RadarResultadoBusca, RadarChamadaProvider } from './radar'

export interface RelatorioEntrada {
  data: string
  providerUsado: string
  custoTotalEstimadoUSD: number
  temas: RadarTema[]
  buscas: RadarResultadoBusca[]
  chamadas: RadarChamadaProvider[]
}

export function gerarMarkdown(entrada: RelatorioEntrada): string {
  const { data, providerUsado, custoTotalEstimadoUSD, temas, buscas, chamadas } = entrada

  const linhas: string[] = []

  linhas.push('# Radar Diario — DG Editor')
  linhas.push('')
  linhas.push('Data: ' + data)
  linhas.push('Provider usado: ' + providerUsado)
  linhas.push('Custo estimado total: $' + custoTotalEstimadoUSD.toFixed(6) + ' USD')
  linhas.push('')
  linhas.push('> **Aviso:** Este relatorio e gerado automaticamente pelo radar diario do DG Editor.')
  linhas.push('> Ele nunca escreve codigo-fonte e nunca instala dependencias.')
  linhas.push('> Toda proposta aqui entra em modo plan e exige aprovacao do usuario antes de qualquer implementacao.')
  linhas.push('')

  // Resumo executivo
  linhas.push('## Resumo Executivo')
  linhas.push('')
  const totalBuscas = buscas.length
  const buscasComErro = buscas.filter((b) => b.erro).length
  const chamadasComSucesso = chamadas.filter((c) => c.resposta && !c.erro).length
  linhas.push('- Temas analisados: ' + temas.length)
  linhas.push('- Buscas realizadas: ' + totalBuscas + (buscasComErro > 0 ? ' (' + buscasComErro + ' com erro)' : ''))
  linhas.push('- Chamadas ao provider com sucesso: ' + chamadasComSucesso + ' de ' + chamadas.length)
  linhas.push('')

  // Por tema
  for (const tema of temas) {
    const temaBuscas = buscas.filter((b) => b.tema === tema.nome)
    const temaChamada = chamadas.find((c) => c.tema === tema.nome)

    linhas.push('## Tema: ' + tema.nome)
    linhas.push('')
    linhas.push('### O que observar')
    for (const obs of tema.observar) {
      linhas.push('- ' + obs)
    }
    linhas.push('')

    if (temaBuscas.length > 0) {
      linhas.push('### Achados da busca')
      for (const b of temaBuscas) {
        linhas.push('#### Query: ' + b.query)
        if (b.erro) {
          linhas.push('- Erro na busca: ' + b.erro)
        } else {
          for (const r of b.resultados) {
            linhas.push('- [' + r.titulo + '](' + r.url + ')' + (r.resumo ? ' — ' + r.resumo : ''))
          }
        }
        linhas.push('')
      }
    }

    if (temaChamada) {
      linhas.push('### Analise do provider (' + temaChamada.providerUsado + ')')
      linhas.push('')
      if (temaChamada.erro) {
        linhas.push('- Erro na analise: ' + temaChamada.erro)
      } else if (temaChamada.resposta) {
        linhas.push(temaChamada.resposta)
      }
      linhas.push('- Custo estimado: $' + temaChamada.custoEstimadoUSD.toFixed(6) + ' USD')
      linhas.push('')
    }

    linhas.push('### Gap vs DG Editor')
    linhas.push('- (A preencher pelo analista: o que essa categoria de ferramenta faz que o DG Editor nao faz)')
    linhas.push('')

    linhas.push('### Proposta de superacao (nao copia)')
    linhas.push('- (A preencher pelo analista: como o DG Editor pode ir alem, nunca copiar)')
    linhas.push('')
  }

  // Prioridades sugeridas
  linhas.push('## Prioridades sugeridas')
  linhas.push('')
  linhas.push('Ordenadas por impacto. Cada item entra em modo plan e exige aprovacao do usuario.')
  linhas.push('')
  const prioridades = gerarPrioridades(temas, chamadas)
  for (let i = 0; i < prioridades.length; i++) {
    linhas.push((i + 1) + '. ' + prioridades[i])
  }
  linhas.push('')

  linhas.push('---')
  linhas.push('*Gerado pelo Radar Diario do DG Editor — ' + data + '*')

  return linhas.join('\n')
}

function gerarPrioridades(temas: RadarTema[], chamadas: RadarChamadaProvider[]): string[] {
  const prioridades: string[] = []

  // Heuristica simples baseada nos temas e nas chamadas com sucesso
  const temasComSucesso = chamadas.filter((c) => c.resposta && !c.erro).map((c) => c.tema)

  if (temasComSucesso.includes('editores de codigo com IA')) {
    prioridades.push('Avaliar recursos de IA nativa em editores concorrentes para integrar ao DG Editor')
  }
  if (temasComSucesso.includes('agentes de codigo autonomos')) {
    prioridades.push('Estudar agentes autonomos para estender o Devin Planner/Executor/Validator do DG Editor')
  }
  if (temasComSucesso.includes('memoria persistente para agentes')) {
    prioridades.push('Implementar memoria persistente de longo prazo para agentes do DG Editor')
  }
  if (temasComSucesso.includes('compressao de contexto')) {
    prioridades.push('Adicionar compressao de contexto para reduzir custo e ampliar janela de analise')
  }
  if (temasComSucesso.includes('MCP servers')) {
    prioridades.push('Mapear MCP servers uteis e expor via IPC do DG Editor')
  }
  if (temasComSucesso.includes('IDEs com IA integrada')) {
    prioridades.push('Comparar features de IA integrada em IDEs e priorizar diferenciais para o DG Editor')
  }

  // Garante no maximo 5
  return prioridades.slice(0, 5)
}
