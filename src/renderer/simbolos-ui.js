/**
 * UI para busca de símbolos (@simbolo:)
 */
export async function indexarSimbolosUI(raiz) {
  try {
    const r = await window.api.invoke('simbolos:indexar', raiz)
    return r
  } catch(e) {
    console.warn('[simbolos]', e)
    return { ok: false }
  }
}

export async function buscarSimboloUI(raiz, nome) {
  try {
    const r = await window.api.invoke('simbolos:buscar', raiz, nome)
    return r?.itens || []
  } catch(e) {
    console.warn('[simbolos]', e)
    return []
  }
}
