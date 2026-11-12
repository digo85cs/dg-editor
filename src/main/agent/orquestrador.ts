/**
 * Orquestra agentes em sequência (ex.: engenheiro → revisor).
 * Sem paralelismo destrutivo; cada passo espera o anterior.
 */
import { executarAgente, type RespostaAgente, type PassoAgente } from '../brain/agent'
import { listarAgentes } from '../brain/agentes'
import { dglog } from '../dglog'

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

export async function orquestrarAgentes(
  raiz: string,
  pedido: string,
  fila?: string[],
  contextoExtra?: string
): Promise<ResultadoOrquestracao> {
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

  // Tempo máximo que cada agente tem para responder antes de ser descartado.
  const AGENT_TIMEOUT_MS = 90_000

  for (const id of ids) {
    dglog('[orquestrador] agente=' + id)
    const t0 = Date.now()
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
        contextoExtra
      })

      // Promise.race garante que um agente travado nao bloqueia o chat para sempre.
      const r: RespostaAgente = await Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout: ' + AGENT_TIMEOUT_MS / 1000 + 's')), AGENT_TIMEOUT_MS)
        )
      ])

      ultimoTexto = r.texto || ''
      out.push({
        agente: id,
        ok: r.ok !== false,
        texto: ultimoTexto,
        modelo: r.modelo,
        passos: r.passos,
        duracaoMs: r.duracaoMs || Date.now() - t0
      })
    } catch (e) {
      out.push({
        agente: id,
        ok: false,
        texto: '',
        erro: String((e as Error).message || e),
        duracaoMs: Date.now() - t0
      })
      // Nao encerra o fluxo: segue para o proximo agente da fila.
      continue
    }
  }

  return { ok: true, passos: out, textoFinal: ultimoTexto }
}
