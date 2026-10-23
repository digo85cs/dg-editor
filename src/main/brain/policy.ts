/**
 * Politica de prioridade do roteador (Fase 3).
 * Decisao por tipo de tarefa + disponibilidade + gatilhos.
 *
 * Regras do dono (1-c, 2-c, 3-d):
 *  - Estrategia / arquitetura / planejamento -> Adapta (dossie/handoff)
 *  - Execucao pesada / analise de codigo    -> Ollama (local, sem custo)
 *  - Tarefa simples / formatacao / busca    -> Ollama
 *  - Fallback                                -> proximo disponivel na fila
 */

export type TipoTarefa = 'codigo' | 'analise' | 'pesquisa' | 'formatacao' | 'estrategia' | 'simples'
export type Provedor = 'ollama' | 'api' | 'maestro'

export interface ContextoDecisao {
  tarefa: TipoTarefa
  disponiveis: Partial<Record<Provedor, boolean>>
  ramOk?: boolean
  saldoMaestroOk?: boolean
}

export interface DecisaoRoteador {
  provedor: Provedor
  motivo: string
  usarDossie: boolean
}

/** Ordem base de preferencia por tipo de tarefa. */
const ORDEM_POR_TAREFA: Record<TipoTarefa, Provedor[]> = {
  codigo: ['ollama', 'maestro', 'api'],
  analise: ['ollama', 'maestro', 'api'],
  pesquisa: ['ollama', 'maestro', 'api'],
  formatacao: ['ollama', 'maestro', 'api'],
  simples: ['ollama', 'maestro', 'api'],
  // estrategia nao roda "dentro" do DG Editor: vira dossie para a Adapta
  estrategia: []
}

/**
 * Decide qual provedor assume a tarefa.
 * Regras: respeita disponibilidade, carga da maquina e estrategia.
 */
export function decidir(ctx: ContextoDecisao): DecisaoRoteador {
  // 1. Estrategia sempre vira dossie/handoff para a Adapta (Maestro)
  if (ctx.tarefa === 'estrategia') {
    const maestroOk = ctx.disponiveis.maestro === true && ctx.saldoMaestroOk !== false
    return {
      provedor: maestroOk ? 'maestro' : 'ollama',
      motivo: maestroOk
        ? 'tarefa estrategica: handoff para Adapta/Maestro'
        : 'estrategia sem Maestro: Ollama assume local e dossie fica pronto para Adapta',
      usarDossie: true
    }
  }

  // 2. Carga da maquina: se RAM nao esta OK, evitar modelo local pesado
  if (ctx.ramOk === false && ctx.disponiveis.maestro === true && ctx.saldoMaestroOk !== false) {
    return {
      provedor: 'maestro',
      motivo: 'RAM baixa (guardiao): desviando carga do Ollama para Maestro',
      usarDossie: false
    }
  }

  // 3. Fila normal por tipo de tarefa, primeira disponivel
  const fila = ORDEM_POR_TAREFA[ctx.tarefa]
  for (const p of fila) {
    if (ctx.disponiveis[p] === true) {
      return {
        provedor: p,
        motivo: `tarefa "${ctx.tarefa}": ${p} disponivel e priorizado`,
        usarDossie: false
      }
    }
  }

  // 4. Nada disponivel: Ollama como ultimo recurso (sempre ha dossie)
  return {
    provedor: 'ollama',
    motivo: 'nenhum provedor confirmado: Ollama como ultimo recurso',
    usarDossie: true
  }
}

/** Classifica a tarefa pelo texto do pedido do dono. */
export function classificarTarefa(texto: string): TipoTarefa {
  const t = texto.toLowerCase()
  if (/(arquitet|estrat[eé]g|planej|roadmap|decid|como eu devo|o que voc[eê] recomenda|desenhar|escopo)/.test(t)) return 'estrategia'
  if (/(analis|revis|audit|refator|bug|erro|corrig|typecheck|test)/.test(t)) return 'analise'
  if (/(pesquis|busc|procur|onde est|localiz|olha)/.test(t)) return 'pesquisa'
  if (/(format|organiz|limp|renomei|indent|estil)/.test(t)) return 'formatacao'
  if (/(cri|escrev|implement|c[oó]digo|fun[cç][aã]o|classe|arquivo)/.test(t)) return 'codigo'
  return 'simples'
}
