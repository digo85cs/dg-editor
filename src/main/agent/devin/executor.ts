import { executarAgente, type RespostaAgente } from '../../brain/agent'
import { dglog } from '../../dglog'

export type ExecucaoPasso = {
  id: string
  ok: boolean
  texto: string
  erro?: string
}

export async function devinExecutor(
  raiz: string,
  passo: { id: string; descricao: string; tipo: string; dependencias: string[] },
  contextoExtra?: string
): Promise<ExecucaoPasso> {
  const modo = passo.tipo === 'validacao' || passo.tipo === 'teste' ? 'plan' : 'agent'

  const prompt = `
Execute este passo de forma autônoma no repositório DG Editor:

Passo: ${passo.descricao}
Tipo: ${passo.tipo}
Dependências: ${passo.dependencias.join(', ') || '(nenhuma)'}
Contexto extra: ${contextoExtra ?? '(nenhum)'}

Instruções:
- Use as tools disponíveis para ler, editar, executar comandos
- Não peça confirmação para leituras e buscas
- Para edições, leia o arquivo primeiro, depois edite
- Mostre o resultado real da execução
- Responda em português do Brasil
`

  const r = await executarAgente(raiz, prompt, {
    agente: 'devin-executor',
    modo: modo as any,
    contextoExtra
  })

  const resultado: ExecucaoPasso = {
    id: passo.id,
    ok: r.ok !== false,
    texto: r.texto,
    erro: r.erro ? String(r.erro.mensagem || r.erro) : undefined
  }

  dglog('[devin-executor] passo=' + passo.id + ' ok=' + resultado.ok)
  return resultado
}
