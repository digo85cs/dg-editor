/**
 * Verify pos-agente compartilhado (chat:send + agente:pedir).
 */
import { executarAgente, type RespostaAgente, type OpcoesExecutarAgente } from '../brain/agent'
import { rodarTypecheck, type Diagnostico } from './diagnosticos'

export type VerifyAposOpts = {
  raiz: string
  pastas?: string[]
  agente?: string
  contextoExtra?: string
  signal?: AbortSignal
  onEvent?: (ev: unknown) => void
  resposta: RespostaAgente
}

export type VerifyAposResultado = {
  resposta: RespostaAgente
  diagnostico?: Diagnostico & { saida: string; ok: boolean }
}

export async function rodarVerifyAposAgente(opts: VerifyAposOpts): Promise<VerifyAposResultado> {
  const { raiz, pastas, agente, contextoExtra, signal, onEvent } = opts
  let resposta = opts.resposta
  if (signal?.aborted) return { resposta }

  onEvent?.({ tipo: 'status', texto: 'Running verify…' })
  onEvent?.({ tipo: 'status', texto: 'Verificando o projeto…' })

  let diagnostico: Diagnostico & { saida: string; ok: boolean } = await rodarTypecheck(raiz)
  let blocoVerify = diagnostico.saida || ''
  try {
    const auto = await import('../autonomia-tools')
    const [git, qual] = await Promise.all([auto.gitStatus(raiz), auto.qualidadeChecar(raiz)])
    blocoVerify +=
      '\n\n[git_status]\n' +
      JSON.stringify(git).slice(0, 2000) +
      '\n\n[qualidade_checar]\n' +
      JSON.stringify(qual).slice(0, 2000)
    if (!qual.ok) diagnostico = { ...diagnostico, ok: false, saida: blocoVerify }
    else diagnostico = { ...diagnostico, saida: blocoVerify }
  } catch {
    diagnostico = { ...diagnostico, saida: blocoVerify }
  }

  if (!diagnostico.ok && !signal?.aborted) {
    onEvent?.({ tipo: 'status', texto: 'Verify falhou; preparando uma correção…' })
    const agentOpts: OpcoesExecutarAgente = {
      modo: 'agent',
      agente,
      proposeWrites: true,
      pastas: pastas?.length ? pastas : [raiz],
      contextoExtra,
      onEvent: onEvent as OpcoesExecutarAgente['onEvent'],
      signal
    }
    const correcao = await executarAgente(
      raiz,
      'Corrija os problemas deste verify (typecheck/qualidade/git). Uma passagem so. Explique o que mudou.\n\n' +
        blocoVerify.slice(0, 9000),
      agentOpts
    )
    resposta = {
      ...correcao,
      passos: [...resposta.passos, ...correcao.passos],
      propostas: [...(resposta.propostas || []), ...(correcao.propostas || [])]
    }
  }

  return { resposta, diagnostico }
}
