import { executarAgente, type RespostaAgente } from '../../brain/agent'
import { dglog } from '../../dglog'

export type PlanoPasso = {
  id: string
  descricao: string
  tipo: 'pesquisa' | 'edicao' | 'comando' | 'validacao' | 'teste'
  dependencias: string[]
  status: 'pendente' | 'em-execucao' | 'concluido' | 'falhou'
  resultado?: string
}

export type PlanoDevin = {
  objetivo: string
  passos: PlanoPasso[]
  criadoEm: number
}

export async function devinPlanejador(
  raiz: string,
  objetivo: string,
  contextoExtra?: string
): Promise<PlanoDevin> {
  const prompt = `
Objetivo: ${objetivo}
Contexto extra: ${contextoExtra ?? '(nenhum)'}

Crie um plano de execução para atingir este objetivo no repositório do DG Editor.
Responda APENAS com JSON válido neste formato:

{
  "passos": [
    {
      "id": "p1",
      "descricao": "O que fazer",
      "tipo": "pesquisa|edicao|comando|validacao|teste",
      "dependencias": []
    }
  ]
}

Regras:
- Cada passo deve ter id único (p1, p2, p3...)
- dependencias lista ids de passos que devem terminar antes
- tipo deve ser um dos valores permitidos
- Seja específico: cite arquivos quando souber
- Não inclua texto fora do JSON
`

  const r = await executarAgente(raiz, prompt, {
    agente: 'devin-planner',
    modo: 'plan',
    contextoExtra
  })

  let plano: PlanoDevin
  try {
    const textoLimpo = r.texto.replace(/```json\n?/, '').replace(/```\n?$/, '').trim()
    const parsed = JSON.parse(textoLimpo)
    plano = {
      objetivo,
      passos: parsed.passos.map((p: any, i: number) => ({
        id: p.id || `p${i + 1}`,
        descricao: p.descricao,
        tipo: p.tipo || 'edicao',
        dependencias: p.dependencias || [],
        status: 'pendente'
      })),
      criadoEm: Date.now()
    }
  } catch {
    dglog('[devin-planner] falha ao parsear plano, criando passo único')
    plano = {
      objetivo,
      passos: [{
        id: 'p1',
        descricao: objetivo,
        tipo: 'edicao',
        dependencias: [],
        status: 'pendente'
      }],
      criadoEm: Date.now()
    }
  }

  dglog('[devin-planner] plano criado com ' + plano.passos.length + ' passo(s)')
  return plano
}
