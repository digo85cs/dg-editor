import { devinPlanejador, type PlanoDevin, type PlanoPasso } from './planner'
import { devinExecutor, type ExecucaoPasso } from './executor'
import { devinValidador, type ValidacaoResultado } from './validator'
import { dglog } from '../../dglog'

export type ResultadoDevin = {
  objetivo: string
  plano: PlanoDevin
  execucoes: ExecucaoPasso[]
  validacao: ValidacaoResultado
  sucesso: boolean
}

export async function devinExecutarTarefa(
  raiz: string,
  objetivo: string,
  contextoExtra?: string
): Promise<ResultadoDevin> {
  dglog('[devin] iniciando execução autônoma: ' + objetivo)

  // 1. Planejar
  const plano = await devinPlanejador(raiz, objetivo, contextoExtra)

  // 2. Executar passos em ordem de dependência
  const execucoes: ExecucaoPasso[] = []
  const concluidos = new Set<string>()

  const podeExecutar = (p: PlanoPasso): boolean =>
    p.dependencias.every((d) => concluidos.has(d))

  let tentativas = 0
  const MAX_TENTATIVAS = plano.passos.length * 3 + 5

  while (execucoes.length < plano.passos.length && tentativas < MAX_TENTATIVAS) {
    tentativas++
    let avancei = false

    for (const passo of plano.passos) {
      if (concluidos.has(passo.id)) continue
      if (!podeExecutar(passo)) continue

      passo.status = 'em-execucao'
      const r = await devinExecutor(raiz, passo, contextoExtra)
      execucoes.push(r)

      if (r.ok) {
        passo.status = 'concluido'
        passo.resultado = r.texto
        concluidos.add(passo.id)
        dglog('[devin] passo concluído: ' + passo.id)
      } else {
        passo.status = 'falhou'
        dglog('[devin] passo falhou: ' + passo.id + ' — ' + (r.erro || 'erro desconhecido'))
      }
      avancei = true
    }

    if (!avancei) break
  }

  // 3. Validar
  const validacao = await devinValidador(raiz, 'geral')

  const sucesso =
    execucoes.length === plano.passos.length &&
    execucoes.every((e) => e.ok) &&
    validacao.ok

  dglog('[devin] execução finalizada: sucesso=' + sucesso + ' passos=' + execucoes.length + '/' + plano.passos.length)

  return { objetivo, plano, execucoes, validacao, sucesso }
}
