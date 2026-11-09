import { state } from '../../state/app-state.js'

export function caminhoSobPasta(caminho, raiz) {
  const n = (s) => String(s || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  const root = n(raiz)
  const c = n(caminho)
  if (!root || !c) return false
  return c === root || c.startsWith(root + '\\')
}

export function salvarPastas() {
  try {
    localStorage.setItem('dg-pastas', JSON.stringify(state.pastasRecentes))
  } catch (e) {
    console.warn('[pastas] falha ao salvar localStorage:', e)
  }
}

export function carregarPastas() {
  const salvas = localStorage.getItem('dg-pastas')
  if (salvas) {
    try {
      const lista = JSON.parse(salvas)
      if (Array.isArray(lista)) {
        for (const p of lista) {
          if (typeof p === 'string' && p && !state.pastasRecentes.includes(p)) {
            state.pastasRecentes.push(p)
          }
        }
      }
    } catch { /* ignora */ }
  }
}

export function adicionarPastaState(path) {
  if (!state.pastasRecentes.includes(path)) state.pastasRecentes.push(path)
  salvarPastas()
}

/** Remove da lista e fecha abas sob a pasta no state. UI (DOM/hist/render) fica no caller. */
export function removerPastaDoState(path) {
  if (!path || !state.pastasRecentes.includes(path)) return null
  const idx = state.pastasRecentes.indexOf(path)
  if (idx === -1) return null
  state.pastasRecentes.splice(idx, 1)
  salvarPastas()
  state.estadoArvore.delete(path)

  const abasFechadas = state.abas.filter((a) => caminhoSobPasta(a.caminho, path)).map((a) => a.caminho)
  for (const c of abasFechadas) {
    const i = state.abas.findIndex((x) => x.caminho === c)
    if (i >= 0) state.abas.splice(i, 1)
  }
  let abaAtivaPerdida = false
  if (abasFechadas.length) {
    if (!state.abaAtiva || !state.abas.some((a) => a.caminho === state.abaAtiva)) {
      state.abaAtiva = null
      abaAtivaPerdida = true
    }
  }
  const eraPastaAtual = state.pastaAtual === path
  if (eraPastaAtual) state.pastaAtual = null
  return { path, abasFechadas, abaAtivaPerdida, eraPastaAtual }
}

/** Reaponta pasta no state (sem UI). Retorna ação sugerida. */
export function reapontarPastaState(antigo, novo) {
  if (state.pastasRecentes.includes(novo)) {
    return { acao: 'ja-existe' }
  }
  const idx = state.pastasRecentes.indexOf(antigo)
  if (idx >= 0) state.pastasRecentes[idx] = novo
  else state.pastasRecentes.push(novo)
  state.estadoArvore.delete(antigo)
  if (state.pastaAtual === antigo) state.pastaAtual = novo
  salvarPastas()
  return { acao: 'reapontado', novo }
}
