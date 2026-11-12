/**
 * Orquestra agentes em sequência (ex.: engenheiro → revisor).
 * Sem paralelismo destrutivo; cada passo espera o anterior.
 * Se um agente não responder ou demorar, é abortado e o fluxo salta
 * automaticamente para o próximo agente disponível, sem demoras.
 */
import { executarAgente, type RespostaAgente, type PassoAgente } from '../brain/agent'
import { listarAgentes } from '../brain/agentes'
import { dglog } from '../dglog'
import {
  registrarMetricaAgente,
  logResumoMetricas,
  resetarMetricas,
  obterMetricasAgente,
  inicializarMetricas
} from '../metrics'

export {
  registrarMetricaAgente,
  logResumoMetricas,
  resetarMetricas,
  obterMetricasAgente,
  inicializarMetricas
}

export type PassoOrquestracao = {
  agente: string
  ok: boolean
  texto: string
  modelo?: string
  passos?: PassoAgente[]
  duracaoMs?: number
  erro?: string
}

export type ResultadoOrquestracao = {
  ok: boolean
  passos: PassoOrquestracao[]
  textoFinal: string
}

const FILA_PADRAO = ['dg-engenheiro', 'revisor']

// Tempo máximo por tipo de tarefa antes de descartar o agente.
// Chat simples precisa de resposta rapida; codigo/edicao pode demorar mais.
const AGENT_TIMEOUT_MS: Record<string, number> = {
  chat: 30_000,
  codigo: 60_000,
  plan: 60_000,
  debug: 60_000,
  agent: 60_000,
  auto: 60_000
}

export async function orquestrarAgentes(
  raiz: string,
  pedido: string,
  fila?: string[],
  contextoExtra?: string,
  opts?: { pararNoPrimeiroSucesso?: boolean; tarefa?: string }
): Promise<ResultadoOrquestracao> {
  inicializarMetricas(raiz)
  const disponiveis = listarAgentes(raiz).map((a) => a.id)
  let ids = (fila && fila.length ? fila : FILA_PADRAO).filter(Boolean)
  ids = ids.map((id) => {
    if (disponiveis.includes(id)) return id
    const alt = disponiveis.find((d) => d.includes(id) || id.includes(d))
    return alt || disponiveis[0] || id
  })

  const out: PassoOrquestracao[] = []
  let acumulado = pedido
  let ultimoTexto = ''

  for (const id of ids) {
    dglog('[orquestrador] agente=' + id)
    const t0 = Date.now()

    // AbortController próprio deste agente: quando o timeout dispara,
    // o signal cancela o executarAgente em vez de deixar órfão no background.
    const tarefa = opts?.tarefa || 'auto'
    const timeoutMs = AGENT_TIMEOUT_MS[tarefa] || AGENT_TIMEOUT_MS.auto

    // AbortController próprio deste agente: quando o timeout dispara,
    // o signal cancela o executarAgente em vez de deixar órfão no background.
    const controller = new AbortController()
    let raceTimer: ReturnType<typeof setTimeout> | undefined

    try {
      const prompt =
        out.length === 0
          ? acumulado
          : 'Pedido original:\n' +
            pedido +
            '\n\nResultado do passo anterior (' +
            out[out.length - 1].agente +
            '):\n' +
            ultimoTexto +
            '\n\nContinue a partir daqui conforme sua especialidade.'

      const promise = executarAgente(raiz, prompt, {
        agente: id,
        modo: 'agent',
        contextoExtra,
        signal: controller.signal
      })

      // Promise.race: quem vencer (resposta ou timeout) resolve primeiro.
      const r: RespostaAgente = await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          raceTimer = setTimeout(() => {
            dglog('[orquestrador] timeout agente=' + id + ' (' + timeoutMs / 1000 + 's) — abortando e pulando')
            controller.abort()
            reject(new Error('timeout: ' + timeoutMs / 1000 + 's'))
          }, timeoutMs)
        })
      ])

      clearTimeout(raceTimer)

      ultimoTexto = r.texto || ''
      out.push({
        agente: id,
        ok: r.ok !== false,
        texto: ultimoTexto,
        modelo: r.modelo,
        passos: r.passos,
        duracaoMs: r.duracaoMs || Date.now() - t0
      })
      registrarMetricaAgente(raiz, id, { ok: r.ok !== false, duracaoMs: Date.now() - t0, foiTimeout: false })

      if (opts?.pararNoPrimeiroSucesso && r.ok !== false) {
        break
      }
    } catch (e) {
      clearTimeout(raceTimer)
      const msg = String((e as Error).message || e)
      const foiTimeout = /timeout/i.test(msg)
      const foiCancelado = /cancelado|abort/i.test(msg)

      dglog(
        '[orquestrador] agente=' + id +
        ' resultado=' + (foiTimeout ? 'TIMEOUT' : foiCancelado ? 'CANCELADO' : 'ERRO') +
        ' msg=' + msg.slice(0, 200)
      )

      out.push({
        agente: id,
        ok: false,
        texto: '',
        erro: msg,
        duracaoMs: Date.now() - t0
      })
      registrarMetricaAgente(raiz, id, { ok: false, duracaoMs: Date.now() - t0, foiTimeout: foiTimeout })
      // Nunca encerra o fluxo: segue imediatamente para o próximo agente da fila.
      continue
    }
  }

  const algumOk = out.some((p) => p.ok)
  return { ok: algumOk, passos: out, textoFinal: ultimoTexto }
}
