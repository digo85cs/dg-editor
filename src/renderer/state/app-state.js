export const state = {
  pastaAtual: null,
  /** @type {string[]} */
  pastasRecentes: [],
  /** @type {Map<string, { expandida: boolean, filhosCarregados: boolean }>} */
  estadoArvore: new Map(),
  /** Containers .tree-children com listagem IPC em andamento (anti duplo clique). */
  carregandoNos: new WeakSet(),
  vaultRaiz: null,
}

export function setPastaAtual(v) {
  state.pastaAtual = v || null
  try { window.__DG_PASTA_ATUAL__ = state.pastaAtual } catch { /* */ }
}

if (typeof window !== 'undefined' && window.__DG_DEBUG) window.__DG_STATE = state
