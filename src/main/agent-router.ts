export type Intencao = 'video' | 'imagem' | 'planilha' | 'pdf' | 'codigo' | 'geral'

export function detectarIntencao(pedido: string): Intencao {
  const p = (pedido || '').toLowerCase()
  if (/video|short|reels|tiktok|youtube|wan|hunyuan/.test(p)) return 'video'
  if (/imagem|image|foto|flux|sdxl|comfy|gerar imagem/.test(p)) return 'imagem'
  if (/planilha|csv|excel|xlsx|sql|duckdb|analisar planilha/.test(p)) return 'planilha'
  if (/pdf|docx|pptx|markdown|converter|tabela|ocr/.test(p)) return 'pdf'
  if (/refator|bug|fix|implementar|criar arquivo|teste|typecheck/.test(p)) return 'codigo'
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
 * Um roteador: agente escolhido pelo usuario permanece.
 * Em auto, codigo vai para free-coder; o resto fica no chat com modelo pequeno.
 * A fila serial fica em chat:send (enfileirarAgente).
 */
export function resolverRotaChat(agenteSel: string, pedido: string): RotaChat {
  const intencao = detectarIntencao(pedido)
  const sel = (agenteSel || 'auto').trim()
  if (sel && sel !== 'auto') {
    return {
      kind: 'agente',
      agente: sel,
      tarefa: intencao === 'codigo' ? 'codigo' : 'chat',
      intencao,
      dica: 'agente escolhido: ' + sel
    }
  }
  if (intencao === 'codigo') {
    return {
      kind: 'agente',
      agente: 'free-coder',
      tarefa: 'codigo',
      intencao,
      dica: 'codigo -> free-coder (fila serial, modelo de codigo)'
    }
  }
  const sug = sugerirRota(intencao)
  return {
    kind: 'chat',
    tarefa: 'chat',
    intencao,
    dica: 'chat no modelo pequeno. ' + sug.dica
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
  if (intencao === 'video') return { modo: 'criar', mcp: ['comfyui'], dica: 'Usar ComfyUI/Wan para gerar vdeo local' }
  if (intencao === 'imagem') return { modo: 'criar', mcp: ['comfyui'], dica: 'Usar ComfyUI para gerar imagem' }
  if (intencao === 'planilha') return { modo: 'analise', mcp: ['duckdb'], dica: 'Usar DuckDB para consultar planilhas localmente' }
  if (intencao === 'pdf') return { modo: 'analise', mcp: ['markitdown', 'docling'], dica: 'Converter com MarkItDown/Docling para melhor anlise' }
  if (intencao === 'codigo') return { modo: 'dg', dica: 'Modo cdigo padro com ferramentas de edio' }
  return { dica: 'Rota geral' }
}
