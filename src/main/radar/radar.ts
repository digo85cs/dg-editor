/**
 * Radar Diário do DG Editor
 *
 * Funcionamento:
 * - deveRodarRadar(): verifica se ja se passaram 24h desde a ultima execucao
 * - executarRadar(): faz buscas, chama o provider selecionado e gera relatorio em Markdown
 * - selecionarProviderRadar(): usa o roteador existente (proximoDisponivel) para escolher UM provider
 *
 * Regras de seguranca:
 * - NUNCA escreve codigo-fonte. Apenas relatorio Markdown.
 * - NUNCA instala dependencias.
 * - Todo erro eh capturado, logado e retornado em RadarResultado.erro.
 * - O boot nunca quebra por causa do radar.
 */
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { dglog, dglogError } from '../dglog'
import { userDataDir } from '../paths'
import { proximoDisponivel } from '../brain/roteador-cota'
import type { ProviderConfig } from '../brain/providers'
import { normalizarTarefa, type Tarefa } from '../brain/registry'
import { gerarMarkdown } from './relatorio'

const INTERVALO_MS = 24 * 60 * 60 * 1000

export interface RadarTema {
  nome: string
  queries: string[]
  observar: string[]
}

export interface RadarResultadoBusca {
  tema: string
  query: string
  resultados: Array<{ titulo: string; url: string; resumo?: string }>
  erro?: string
}

export interface RadarChamadaProvider {
  tema: string
  prompt: string
  resposta: string | null
  providerUsado: string | null
  custoEstimadoUSD: number
  erro?: string
}

export interface RadarResultado {
  ok: boolean
  erro?: string
  data: string
  providerUsado: string | null
  custoTotalEstimadoUSD: number
  buscas: RadarResultadoBusca[]
  chamadas: RadarChamadaProvider[]
  relatorioGravado: boolean
  caminhoRelatorio?: string
}

function caminhoEstado(userDataPath: string): string {
  return join(userDataPath, 'radar-state.json')
}

export function deveRodarRadar(userDataPath: string): boolean {
  const p = caminhoEstado(userDataPath)
  if (!existsSync(p)) return true
  try {
    const conteudo = require('fs').readFileSync(p, 'utf-8')
    const estado = JSON.parse(conteudo) as { ultimaExecucao?: string }
    if (!estado.ultimaExecucao) return true
    const ultimo = new Date(estado.ultimaExecucao).getTime()
    const agora = Date.now()
    return agora - ultimo > INTERVALO_MS
  } catch {
    return true
  }
}

function gravarEstado(userDataPath: string): void {
  const p = caminhoEstado(userDataPath)
  const dir = join(p, '..')
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(p, JSON.stringify({ ultimaExecucao: new Date().toISOString() }, null, 2), 'utf-8')
  } catch (e) {
    dglogError('[radar] falha ao gravar estado: ' + String((e as Error)?.message || e))
  }
}

export type BuscaFuncao = (query: string) => Promise<Array<{ titulo: string; url: string; resumo?: string }>>

export type ChamadaProviderFuncao = (prompt: string, tema: string) => Promise<{
  resposta: string | null
  providerUsado: string | null
  custoEstimadoUSD: number
  erro?: string
}>

export async function executarRadar(deps: {
  userDataPath: string
  busca: BuscaFuncao
  chamarProvider: ChamadaProviderFuncao
  caminhoSaida: string
  temas: RadarTema[]
}): Promise<RadarResultado> {
  const { busca, chamarProvider, caminhoSaida, temas, userDataPath } = deps
  const data = new Date().toISOString()
  const buscas: RadarResultadoBusca[] = []
  const chamadas: RadarChamadaProvider[] = []
  let custoTotal = 0
  let providerUsado: string | null = null

  try {
    dglog('[radar] iniciando execucao diaria')

    // 1. Selecionar provider via roteador existente
    const cfg = selecionarProviderRadar()
    if (!cfg) {
      const erro = 'Nenhum provider disponivel para o radar'
      dglog('[radar] ' + erro)
      gravarEstado(userDataPath)
      return {
        ok: false,
        erro,
        data,
        providerUsado: null,
        custoTotalEstimadoUSD: 0,
        buscas: [],
        chamadas: [],
        relatorioGravado: false
      }
    }
    providerUsado = cfg.id
    dglog('[radar] provider selecionado: ' + cfg.id + ' / ' + cfg.modelo)

    // 2. Para cada tema, fazer busca e chamar provider
    for (const tema of temas) {
      const temaBuscas: RadarResultadoBusca[] = []

      for (const query of tema.queries) {
        try {
          const resultados = await busca(query)
          temaBuscas.push({ tema: tema.nome, query, resultados })
        } catch (e) {
          dglogError('[radar] busca falhou para query="' + query + '": ' + String((e as Error)?.message || e))
          temaBuscas.push({
            tema: tema.nome,
            query,
            resultados: [],
            erro: String((e as Error)?.message || e)
          })
        }
      }
      buscas.push(...temaBuscas)

      // 3. Chamar o provider para analisar os resultados do tema
      const prompt = construirPromptTema(tema, temaBuscas)
      try {
        const chamada = await chamarProvider(prompt, tema.nome)
        custoTotal += chamada.custoEstimadoUSD
        chamadas.push({
          tema: tema.nome,
          prompt,
          resposta: chamada.resposta,
          providerUsado: cfg.id,
          custoEstimadoUSD: chamada.custoEstimadoUSD,
          erro: chamada.erro
        })
      } catch (e) {
        dglogError('[radar] chamada provider falhou para tema="' + tema.nome + '": ' + String((e as Error)?.message || e))
        chamadas.push({
          tema: tema.nome,
          prompt,
          resposta: null,
          providerUsado: cfg.id,
          custoEstimadoUSD: 0,
          erro: String((e as Error)?.message || e)
        })
      }
    }

    // 4. Gerar e gravar o relatorio
    const relatorio = gerarMarkdown({
      data,
      providerUsado: providerUsado ?? '',
      custoTotalEstimadoUSD: custoTotal,
      temas,
      buscas,
      chamadas
    })

    const caminhoRelatorio = join(caminhoSaida, 'RADAR.md')
    try {
      const dir = join(caminhoRelatorio, '..')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(caminhoRelatorio, relatorio, 'utf-8')
      dglog('[radar] relatorio gravado em ' + caminhoRelatorio)
    } catch (e) {
      dglogError('[radar] falha ao gravar relatorio: ' + String((e as Error)?.message || e))
      gravarEstado(userDataPath)
      return {
        ok: false,
        erro: String((e as Error)?.message || e),
        data,
        providerUsado,
        custoTotalEstimadoUSD: custoTotal,
        buscas,
        chamadas,
        relatorioGravado: false
      }
    }

    gravarEstado(userDataPath)
    dglog('[radar] execucao concluida com sucesso. custo estimado=' + custoTotal.toFixed(6) + ' USD')

    return {
      ok: true,
      data,
      providerUsado,
      custoTotalEstimadoUSD: custoTotal,
      buscas,
      chamadas,
      relatorioGravado: true,
      caminhoRelatorio
    }
  } catch (e: any) {
    const msg = String(e?.message || e)
    dglogError('[radar] falha nao tratada: ' + msg)
    gravarEstado(userDataPath)
    return {
      ok: false,
      erro: msg,
      data,
      providerUsado,
      custoTotalEstimadoUSD: custoTotal,
      buscas,
      chamadas,
      relatorioGravado: false
    }
  }
}

function construirPromptTema(tema: RadarTema, buscas: RadarResultadoBusca[]): string {
  const linhas: string[] = []
  linhas.push('Voce e um analista de mercado de ferramentas de IA para desenvolvedores.')
  linhas.push('Tema: ' + tema.nome)
  linhas.push('')
  linhas.push('Resultados de busca obtidos:')
  for (const b of buscas) {
    linhas.push('- Query: ' + b.query)
    for (const r of b.resultados) {
      linhas.push('  * ' + r.titulo + ' — ' + r.url + (r.resumo ? ' — ' + r.resumo : ''))
    }
    if (b.erro) linhas.push('  * ERRO NA BUSCA: ' + b.erro)
  }
  linhas.push('')
  linhas.push('Para cada resultado, informe:')
  linhas.push('1. O que a ferramenta faz que o DG Editor NAO faz (gap concreto).')
  linhas.push('2. Uma proposta de SUPERACAO (nao copia): como o DG Editor pode ir alem dessa funcionalidade.')
  linhas.push('3. Classificacao de impacto: alto / medio / baixo.')
  linhas.push('')
  linhas.push('Responda em portugues do Brasil, em formato estruturado.')
  return linhas.join('\n')
}

export function selecionarProviderRadar(): ProviderConfig | null {
  try {
    // Usa o roteador existente com a tarefa 'analise' (compatível com analisar/concluir)
    return proximoDisponivel('analise')
  } catch (e) {
    dglogError('[radar] falha ao selecionar provider: ' + String((e as Error)?.message || e))
    return null
  }
}
