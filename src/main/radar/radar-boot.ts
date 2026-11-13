/**
 * Integracao do Radar Diario com o boot do DG Editor.
 *
 * Conecta as funcoes puras de radar.ts ao ambiente real do Electron:
 * - busca: buscaWebDuckDuckGo (sem dependencias novas)
 * - chamarProvider: chamarProvider do providers.ts com provider do roteador
 * - caminhoSaida: docs/ (raiz do projeto)
 */
import { executarRadar, deveRodarRadar } from './radar'
import { TEMAS_RADAR } from './temas-radar'
import { buscaWebDuckDuckGo } from './busca-web'
import { chamarProvider, type ProviderConfig, type Message, type RespostaProvider } from '../brain/providers'
import { selecionarProviderRadar } from './radar'
import { userDataDir } from '../paths'
import { resolverRaizProjeto } from '../paths'
import { dglog, dglogError } from '../dglog'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Dispara o radar no boot se ja passaram 24h.
 * Nao bloqueia a UI: disparado e esquecido, com try/catch global.
 */
export function dispararRadarNoBoot(raizProjeto: string): void {
  try {
    const userDataPath = userDataDir()

    if (!executarRadarDeveRodar(userDataPath)) {
      dglog('[radar:boot] nao e hora de executar o radar (menos de 24h)')
      return
    }

    // Disparar em background, sem await bloqueante
    void (async () => {
      try {
        const resultado = await executarRadar({
          userDataPath,
          busca: buscaWebDuckDuckGo,
          chamarProvider: criarChamadaProviderReal(),
          caminhoSaida: path.join(raizProjeto, 'docs'),
          temas: TEMAS_RADAR
        })

        if (resultado.ok) {
          dglog('[radar:boot] concluido. provider=' + resultado.providerUsado + ' custo=$' + resultado.custoTotalEstimadoUSD.toFixed(6))
        } else {
          dglogError('[radar:boot] falhou: ' + (resultado.erro || 'erro desconhecido'))
        }
      } catch (e: any) {
        // Nunca deixa o boot quebrar por causa do radar
        dglogError('[radar:boot] excecao nao tratada: ' + String(e?.message || e))
      }
    })()
  } catch (e: any) {
    dglogError('[radar:boot] falha ao iniciar: ' + String(e?.message || e))
  }
}

function executarRadarDeveRodar(userDataPath: string): boolean {
  return deveRodarRadar(userDataPath)
}

function criarChamadaProviderReal() {
  return async (prompt: string, tema: string): Promise<{
    resposta: string | null
    providerUsado: string | null
    custoEstimadoUSD: number
    erro?: string
  }> => {
    const cfg = selecionarProviderRadar()
    if (!cfg) {
      return { resposta: null, providerUsado: null, custoEstimadoUSD: 0, erro: 'Nenhum provider disponivel' }
    }

    const mensagens: Message[] = [
      { role: 'system', content: 'Voce e um analista de mercado de ferramentas de IA para desenvolvedores.' },
      { role: 'user', content: prompt }
    ]

    try {
      const r: RespostaProvider = await chamarProvider(cfg, mensagens)
      const uso = r.usage
      let custo = 0
      if (uso) {
        // Custo aproximado: nao temos preco do provider aqui, usamos 0 se nao souber
        custo = 0
      }
      return {
        resposta: r.content,
        providerUsado: cfg.id,
        custoEstimadoUSD: custo
      }
    } catch (e: any) {
      return {
        resposta: null,
        providerUsado: cfg.id,
        custoEstimadoUSD: 0,
        erro: String(e?.message || e)
      }
    }
  }
}
