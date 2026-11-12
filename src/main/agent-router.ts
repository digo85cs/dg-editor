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
 * Comportamento base = Cursor Agent: pedido → tools → resultado no mesmo turno.
 * Chat sem tools só em cumprimento curto (ou quando o UI força modo ask).
 */
export function resolverRotaChat(agenteSel: string, pedido: string): RotaChat {
  const intencao = detectarIntencao(pedido)
  const sel = (agenteSel || 'auto').trim()
  if (sel && sel !== 'auto') {
    return {
      kind: 'agente',
      agente: sel,
      tarefa: intencao === 'codigo' || intencao === 'geral' ? 'codigo' : 'chat',
      intencao,
      dica: 'agente escolhido: ' + sel
    }
  }
  if (pedidoSoConversacional(pedido)) {
    return {
      kind: 'chat',
      tarefa: 'chat',
      intencao,
      dica: 'cumprimento curto — chat sem tools'
    }
  }
  if (intencao === 'codigo') {
    return {
      kind: 'agente',
      agente: 'dg-engenheiro',
      tarefa: 'codigo',
      intencao,
      dica: 'acao/codigo -> dg-engenheiro com tools (qualidade online primeiro)'
    }
  }
  return {
    kind: 'agente',
    agente: 'hibrido-core',
    tarefa: 'codigo',
    intencao,
    dica: 'pedido geral -> hibrido-core com tools (estilo Cursor, online primeiro)'
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
