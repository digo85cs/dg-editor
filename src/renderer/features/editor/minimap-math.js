/** Funcoes puras do minimapa (sem DOM) para facilitar testes. */

/** Resumo visual de uma linha: colunas de indentacao e de conteudo. */
export function resumoLinha(texto) {
  const s = String(texto ?? '')
  const semEspaco = s.replace(/^\s+/, '')
  const indent = s.length - semEspaco.length
  const len = semEspaco.replace(/\s+$/, '').length
  return { indent, len }
}

/** Linha (1-based) correspondente a uma fracao vertical 0..1. */
export function linhaPorFracao(fracao, total) {
  const totalSeguro = Math.max(1, Math.floor(Number(total) || 1))
  const f = Math.min(1, Math.max(0, Number(fracao) || 0))
  return Math.max(1, Math.min(totalSeguro, Math.floor(f * totalSeguro) + 1))
}
