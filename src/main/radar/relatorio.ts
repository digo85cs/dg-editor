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
  /** Linha de rodape sobre o cache (ex.: "Cache: nao utilizado nesta execucao"). */
  cache?: string
}

export function gerarMarkdown(entrada: RelatorioEntrada): string {
  const { data, providerUsado, custoTotalEstimadoUSD, temas, buscas, chamadas, cache } = entrada

  const linhas: string[] = []

  linhas.push('# Radar Diario — DG Editor')
  linhas.push('')
  linhas.push('Data: ' + data)
  linhas.push('Provider usado: ' + providerUsado)
  linhas.push('Custo estimado total: $' + custoTotalEstimadoUSD.toFixed(6) + ' USD')
  if (cache) linhas.push(cache)
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
  const totalLinks = buscas.reduce((acc, b) => acc + b.resultados.length, 0)
  if (totalLinks === 0) {
    linhas.push('**NENHUM LINK DE FONTE OBTIDO NESTA EXECUCAO — o resumo abaixo reflete buscas sem resultado.**')
    linhas.push('')
  }
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

    const temaTemFonte = temaBuscas.some((b) => b.resultados.length > 0)

    if (temaBuscas.length > 0) {
      linhas.push('### Achados da busca')
      for (const b of temaBuscas) {
        linhas.push('#### Query: ' + b.query)
        if (b.resultados.length === 0) {
          linhas.push('- Busca sem resultado (motivo: ' + (b.erro || 'nenhum resultado retornado') + ')')
        } else if (b.erro) {
          linhas.push('- Erro na busca: ' + b.erro)
          for (const r of b.resultados) {
            linhas.push('- [' + r.titulo + '](' + r.url + ')' + (r.resumo ? ' — ' + r.resumo : ''))
          }
        } else {
          for (const r of b.resultados) {
            linhas.push('- [' + r.titulo + '](' + r.url + ')' + (r.resumo ? ' — ' + r.resumo : ''))
          }
        }
        linhas.push('')
      }
    }

    if (!temaTemFonte) {
      linhas.push('**TEMA SEM FONTE** — nenhuma busca deste tema retornou link; nenhuma prioridade sera gerada para ele.')
      linhas.push('')
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
  const prioridades = gerarPrioridades(temas, buscas)
  if (prioridades.length === 0) {
    linhas.push('Nenhuma prioridade gerada: nenhuma busca retornou fonte com link.')
  } else {
    for (let i = 0; i < prioridades.length; i++) {
      linhas.push((i + 1) + '. ' + prioridades[i])
    }
  }
  linhas.push('')

  linhas.push('---')
  linhas.push('*Gerado pelo Radar Diario do DG Editor — ' + data + '*')

  return linhas.join('\n')
}

function gerarPrioridades(temas: RadarTema[], buscas: RadarResultadoBusca[]): string[] {
  // Prioridade so existe com base em resultado de busca com link — nunca por
  // frase fixa ou por tema sem fonte.
  const prioridades: string[] = []
  for (const tema of temas) {
    const comLink = buscas.find(
      (b) => b.tema === tema.nome && b.resultados.length > 0
    )
    if (!comLink) continue
    const r = comLink.resultados[0]
    prioridades.push(
      'Aprofundar achado de "' + tema.nome + '": ' + r.titulo + ' (' + r.url + ')'
    )
    if (prioridades.length >= 5) break
  }
  return prioridades
}
