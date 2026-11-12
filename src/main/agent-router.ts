import { listarAgentes } from './brain/agentes'

export type Intencao = 'video' | 'imagem' | 'planilha' | 'pdf' | 'codigo' | 'geral'

/** Pedido curto de conversa — sem tools. Tudo o mais age como o Cursor Agent. */
export function pedidoSoConversacional(pedido: string): boolean {
  const p = (pedido || '').trim().toLowerCase()
  if (!p) return true
  if (p.length > 48) return false
  return /^(oi+|ol[aá]|hey|e a[ií]|obrigad[oa]|valeu|tmj|bom dia|boa tarde|boa noite|tudo bem\??|ok|beleza|certo|sim|n[aã]o|thanks|thx)[\s!.?]*$/i.test(
    p
  )
}

export function detectarIntencao(pedido: string): Intencao {
  const p = (pedido || '').toLowerCase()
  if (/video|short|reels|tiktok|youtube|wan|hunyuan/.test(p)) return 'video'
  if (/imagem|image|foto|flux|sdxl|comfy|gerar imagem/.test(p)) return 'imagem'
  if (/planilha|csv|excel|xlsx|sql|duckdb|analisar planilha/.test(p)) return 'planilha'
  if (/pdf|docx|pptx|markdown|converter|tabela|ocr/.test(p)) return 'pdf'
  if (
    /refator|bug|fix|implementar|implemente|aplica|aplique|criar arquivo|teste|typecheck|listar|abrir|salvar|editar|configur|validar|integr|instal|verific|status|corrig|consert|atalho|conectar|skill|agente|tool|deploy|commit|diagnost|quebra de linha|provedor|conta|autonom|melhor[ae]|modo agent/.test(
      p
    )
  ) {
    return 'codigo'
  }
  return 'geral'
}

export type RotaChat = {
  kind: 'chat' | 'agente'
  agente?: string
  tarefa: 'chat' | 'codigo'
  intencao: Intencao
  dica: string
}

/**
 * Seleciona o MELHOR agente disponível para a intenção/tarefa dada.
 * Pontua cada agente pelas skills correspondentes à intenção.
 * Se houver empate, retorna o primeiro da lista (ordem do disco).
 * Útil para "primeiro o melhor agente para a tarefa".
 */
export function selecionarMelhorAgente(raiz: string, intencao: Intencao, tarefa: 'chat' | 'codigo'): string {
  const agentes = listarAgentes(raiz)
  if (!agentes.length) return 'dg-engenheiro'

  const skillsPorIntencao: Record<Intencao, string[]> = {
    codigo: ['refatorador', 'editar-seguro', 'debugger', 'testador', 'leitor-codigo', 'arvore-projeto'],
    video: [],
    imagem: [],
    planilha: ['analisador', 'leitor-codigo'],
    pdf: ['documentador', 'leitor-codigo'],
    geral: ['leitor-codigo', 'documentador', 'analisador', 'refatorador'],
  }

  const skillsPreferidas = skillsPorIntencao[intencao] || []
  const tarefaCodigo = tarefa === 'codigo'

  let melhor = agentes[0]
  let melhorScore = -1

  for (const a of agentes) {
    let score = 0
    for (const s of skillsPreferidas) {
      if (a.skills.includes(s)) score++
    }
    // Preferência direta por tarefa
    if (tarefaCodigo && a.id === 'dg-engenheiro') score += 12
    if (!tarefaCodigo && a.id === 'hibrido-core') score += 12
    // Qoder/Trae são bons para código geral autônomo
    if (tarefaCodigo && (a.id === 'qoder' || a.id === 'trae')) score += 6
    // free-* são fallback (úteis mas não primeira escolha)
    if (a.id.startsWith('free-')) score -= 4

    if (score > melhorScore) {
      melhorScore = score
      melhor = a
    }
  }

  return melhor.id
}

/**
 * Comportamento base = Cursor Agent: pedido → tools → resultado no mesmo turno.
 * Chat sem tools só em cumprimento curto (ou quando o UI força modo ask).
 */
export function resolverRotaChat(agenteSel: string, pedido: string, raiz?: string): RotaChat {
  const intencao = detectarIntencao(pedido)
  const sel = (agenteSel || 'auto').trim()

  // Quando não há agente escolhido pelo usuário e temos raiz, escolhe o melhor agente automaticamente.
  if (!sel || sel === 'auto') {
    if (pedidoSoConversacional(pedido)) {
      return {
        kind: 'chat',
        tarefa: 'chat',
        intencao,
        dica: 'cumprimento curto — chat sem tools'
      }
    }
    if (raiz) {
      const melhor = selecionarMelhorAgente(raiz, intencao, intencao === 'codigo' ? 'codigo' : 'chat')
      return {
        kind: 'agente',
        agente: melhor,
        tarefa: intencao === 'codigo' || intencao === 'geral' ? 'codigo' : 'chat',
        intencao,
        dica: 'melhor agente automatico para ' + intencao + ': ' + melhor
      }
    }
    // Sem raiz: fallback para dg-engenheiro / hibrido-core
    return {
      kind: 'agente',
      agente: intencao === 'codigo' ? 'dg-engenheiro' : 'hibrido-core',
      tarefa: intencao === 'codigo' || intencao === 'geral' ? 'codigo' : 'chat',
      intencao,
      dica: 'fallback sem raiz: ' + intencao
    }
  }

  // Agente explicitamente escolhido pelo usuario.
  return {
    kind: 'agente',
    agente: sel,
    tarefa: intencao === 'codigo' || intencao === 'geral' ? 'codigo' : 'chat',
    intencao,
    dica: 'agente escolhido: ' + sel
  }
}

/**
 * Aprovacao automatica so em risco baixo ou edicao localizada curta.
 * Terminal, risco alto/critico e varios arquivos continuam manuais.
 */
export function decidirAutoAprovacao(
  risco: 'baixo' | 'medio' | 'alto' | 'critico',
  rota: string,
  nPropostas: number
): { ok: boolean; motivo: string } {
  if (nPropostas <= 0) return { ok: false, motivo: 'sem propostas' }
  if (risco === 'alto' || risco === 'critico') return { ok: false, motivo: 'risco ' + risco }
  if (rota === 'terminal_com_confirmacao' || rota === 'recusar') {
    return { ok: false, motivo: rota }
  }
  if (nPropostas > 2) return { ok: false, motivo: 'escrita ampla (' + nPropostas + ' arquivos)' }
  if (risco === 'baixo' || rota === 'edicao_localizada') {
    return { ok: true, motivo: risco + '/' + rota }
  }
  return { ok: false, motivo: risco + '/' + rota }
}

export function sugerirRota(intencao: Intencao): { modo?: string; mcp?: string[]; dica: string } {
  if (intencao === 'video') return { modo: 'criar', mcp: ['comfyui'], dica: 'Usar ComfyUI/Wan para gerar video local' }
  if (intencao === 'imagem') return { modo: 'criar', mcp: ['comfyui'], dica: 'Usar ComfyUI para gerar imagem' }
  if (intencao === 'planilha') return { modo: 'analise', mcp: ['duckdb'], dica: 'Usar DuckDB para consultar planilhas localmente' }
  if (intencao === 'pdf') return { modo: 'analise', mcp: ['markitdown', 'docling'], dica: 'Converter com MarkItDown/Docling para melhor analise' }
  if (intencao === 'codigo') return { modo: 'dg', dica: 'Modo codigo com ferramentas (estilo Cursor)' }
  return { dica: 'Agente com tools (estilo Cursor)' }
}
