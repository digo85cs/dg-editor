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
  // Maestro e stub no momento: fora da fila ate implementar de verdade.
  codigo: ['ollama'],
  analise: ['ollama'],
  pesquisa: ['ollama'],
  formatacao: ['ollama'],
  simples: ['ollama'],
  estrategia: ['ollama']
}

/**
 * Decide qual provedor assume a tarefa.
 * Regras: respeita disponibilidade, carga da maquina e estrategia.
 */
export function decidir(ctx: ContextoDecisao): DecisaoRoteador {
  // 1. Estrategia sempre vira dossie/handoff para a Adapta (Maestro)
  if (ctx.tarefa === 'estrategia') {
    // Maestro ainda e stub (nao responde). Estrategia roda no Ollama com o
    // modelo mais forte do perfil, e o dossie fica pronto para handoff futuro.
    const ollamaOk = ctx.disponiveis.ollama === true
    return {
      provedor: 'ollama',
      motivo: ollamaOk
        ? 'estrategia: Ollama local com modelo forte; dossie pronto para handoff'
        : 'estrategia sem Ollama: API assume',
      usarDossie: true
    }
  }

  // 2. Carga da maquina: se RAM nao esta OK, evitar modelo local pesado
  if (ctx.ramOk === false) {
    // RAM baixa nao e mais motivo para desviar de provedor:
    // o OllamaProvider escolhe um modelo menor pelo perfil + RAM livre.
    return {
      provedor: 'ollama',
      motivo: 'RAM baixa (guardiao): modelo local menor sera escolhido pelo perfil',
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

/** Converte o tipo de tarefa da policy para o perfil de modelo do provider. */
export function exportarPerfil(t: TipoTarefa): 'codigo' | 'analise' | 'pesquisa' | 'formatacao' | 'estrategia' | 'simples' {
  return t
}