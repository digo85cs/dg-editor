/**
 * Chamada com roteador de cota em cascata (FASE 2).
 * Camada acima de chamarProvider: tenta provedores da fila global até obter sucesso.
 * Nunca altera chamarProvider. Comentários em pt-BR.
 */
import {
  chamarProvider,
  chamarProviderSharp,
  ErroProvider,
  type Message,
  type ProviderConfig,
  type RespostaProvider,
  type ToolDef,
} from './providers'
import { normalizarTarefa, type Tarefa } from './registry'
import { marcarEsgotado, proximoDisponivel } from './roteador-cota'

const MAX_TENTATIVAS = 8

export async function chamarComCascata(
  tarefa: Tarefa,
  mensagens: Message[],
  tools?: ToolDef[],
  signal?: AbortSignal
): Promise<RespostaProvider & { providerFinal: string; tentativas: string[] }> {
  const tentativas: string[] = []
  let redeConsecutivos = 0
  let serverErros = 0
  let ultimoErro: unknown = null

  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
    if (signal?.aborted) {
      throw new ErroProvider('cancelled', 'Execucao cancelada pelo usuario.', 'roteador')
    }

    const ignorarIds = tentativas.map((t) => t.split('/')[0])
    const cfg = proximoDisponivel(tarefa, { ignorarIds })
    if (!cfg) {
      throw new ErroProvider('outro', 'nenhum provider disponivel para a tarefa ' + tarefa, 'roteador')
    }

    tentativas.push(`${cfg.id}/${cfg.modelo}`)

    try {
      const r = await chamarProvider(cfg, mensagens, tools, signal)
      return { ...r, providerFinal: cfg.id, tentativas }
    } catch (e) {
      if (signal?.aborted) {
        throw new ErroProvider('cancelled', 'Execucao cancelada pelo usuario.', 'roteador')
      }
      if (!(e instanceof ErroProvider)) {
        ultimoErro = e
        throw e
      }
      ultimoErro = e
      const kind = e.kind
      const status = e.status

      if (kind === 'cancelled') {
        throw e
      }
      if (kind === 'rate_limit' || status === 402) {
        marcarEsgotado(cfg.id, cfg.modelo, 'rate_limit')
        redeConsecutivos = 0
        serverErros = 0
        continue
      }
      if (kind === 'auth') {
        marcarEsgotado(cfg.id, cfg.modelo, 'auth')
        continue
      }
      if (kind === 'modelo_morto') {
        marcarEsgotado(cfg.id, cfg.modelo, 'erro', 86400)
        continue
      }
      if (kind === 'timeout' || kind === 'rede') {
        redeConsecutivos++
        if (redeConsecutivos >= 3) {
          throw e
        }
        continue
      }
      if (kind === 'server') {
        serverErros++
        if (serverErros >= 4) {
          throw e
        }
        continue
      }
      // 'outro' e desconhecidos: tenta o próximo provedor
      continue
    }
  }

  throw ultimoErro ?? new ErroProvider('outro', 'nenhum provider disponivel para a tarefa ' + tarefa, 'roteador')
}

/** Atalho que usa chamarProviderSharp (com log de id efetivo) dentro da cascata. */
export async function chamarComCascataSharp(
  tarefa: Tarefa,
  mensagens: Message[],
  tools?: ToolDef[],
  signal?: AbortSignal
): Promise<RespostaProvider & { providerFinal: string; tentativas: string[] }> {
  const r = await chamarComCascata(tarefa, mensagens, tools, signal)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { dglog } = require('../dglog')
  dglog('[cascata] sharp id=' + r.providerFinal + ' tentativas=' + r.tentativas.join(','))
  return r
}
