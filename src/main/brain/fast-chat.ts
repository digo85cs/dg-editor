export function obterPromptRapido(pedido: string): string {
  return 'Voce e o DG Agent. Seja direto, pratico e objetivo. Nao explique demais. Va direto ao ponto e faca exatamente o que foi pedido. Se for codigo, escreva o codigo direto. Se for correcao, corrija direto. Responda em portugues do Brasil.\n\nPEDIDO:\n' + pedido
}

export function deveUsarModoRapido(pedido: string): boolean {
  const p = (pedido || '').toLowerCase()
  if (/explique.*detalhad|ensine.*passo|contexto completo/.test(p)) return false
  return true
}
