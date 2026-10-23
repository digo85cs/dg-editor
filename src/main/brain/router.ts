/**
 * Roteador organico do DG Editor (Fase 3).
 * Consulta disponibilidade real, guardiao e politica para escolher o provedor.
 */
import { getBrain } from './module'
import { getProviders } from './index'
import type { BrainProvider } from '@shared/types'
import { decidir, classificarTarefa } from './policy'
import type { DecisaoRoteador, TipoTarefa, Provedor } from './policy'
import type { BrainResponse } from '../../shared/types'

export interface RoteadorStatus {
  decisao: DecisaoRoteador
  tarefa: TipoTarefa
  disponibilidade: Partial<Record<Provedor, boolean>>
}

async function checarDisponibilidade(): Promise<Partial<Record<Provedor, boolean>>> {
  const providers: BrainProvider[] = getProviders()
  const mapa: Partial<Record<Provedor, boolean>> = {}
  for (const p of providers) {
    const chave = p.name as Provedor
    try {
      mapa[chave] = await p.isAvailable()
    } catch {
      mapa[chave] = false
    }
  }
  return mapa
}

async function ramOk(): Promise<boolean> {
  try {
    const { guardianPodeOperar } = await import('../guardian')
    return guardianPodeOperar()
  } catch {
    return true
  }
}

/** Analisa o pedido e devolve a decisao sem executar. */
export async function planejar(pedido: string): Promise<RoteadorStatus> {
  const tarefa = classificarTarefa(pedido)
  const disponibilidade = await checarDisponibilidade()
  const ram = await ramOk()
  const decisao = decidir({ tarefa, disponiveis: disponibilidade, ramOk: ram, saldoMaestroOk: true })
  return { decisao, tarefa, disponibilidade }
}

/** Roteia e executa: tenta a decisao e cai para o proximo disponivel em caso de falha. */
export async function rotear(pedido: string, contexto: string): Promise<BrainResponse> {
  const plano = await planejar(pedido)
  const brain = getBrain()
  const fila: Provedor[] = [plano.decisao.provedor, 'ollama', 'maestro', 'api']
  const tentados = new Set<Provedor>()
  let ultimoErro: unknown

  for (const prov of fila) {
    if (tentados.has(prov)) continue
    tentados.add(prov)
    if (plano.disponibilidade[prov] === false && prov !== plano.decisao.provedor) continue
    try {
      const resp = await brain.ask(pedido, contexto, prov)
      return resp
    } catch (e) {
      ultimoErro = e
    }
  }
  throw new Error(`Roteador: nenhum provedor conseguiu responder (${String(ultimoErro)})`)
}
