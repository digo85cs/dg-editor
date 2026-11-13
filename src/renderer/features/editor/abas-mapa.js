/**
 * Persistência do mapa de abas por projeto (localStorage). Funções puras para
 * normalizar formatos antigos, limitar o número de projetos e podar entradas
 * inválidas sem depender do DOM.
 */

export const CHAVE_ABAS = 'dg-state.abas'
export const LIMITE_PROJETOS = 30
export const CHAVE_SEM_PROJETO = '__sem-projeto__'

/**
 * @param {unknown} bruto
 * @param {string} chaveAtual
 * @returns {Record<string, { abas: string[], ativa: string | null, raiz?: string, em?: number }>}
 */
export function normalizarMapaAbas(bruto, chaveAtual) {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return {}
  const obj = /** @type {Record<string, unknown>} */ (bruto)
  // Formato antigo: { abas: [...], ativa } sem separação por projeto.
  if (Array.isArray(obj.abas)) {
    return {
      [chaveAtual]: {
        abas: obj.abas.filter((x) => typeof x === 'string'),
        ativa: typeof obj.ativa === 'string' ? obj.ativa : null
      }
    }
  }
  const out = {}
  for (const [chave, valor] of Object.entries(obj)) {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) continue
    const v = /** @type {Record<string, unknown>} */ (valor)
    if (!Array.isArray(v.abas)) continue
    out[chave] = {
      abas: v.abas.filter((x) => typeof x === 'string'),
      ativa: typeof v.ativa === 'string' ? v.ativa : null,
      ...(typeof v.raiz === 'string' && v.raiz ? { raiz: v.raiz } : {}),
      ...(Number(v.em) > 0 ? { em: Number(v.em) } : {})
    }
  }
  return out
}

/**
 * Mantém apenas os `limite` projetos usados mais recentemente.
 * @param {ReturnType<typeof normalizarMapaAbas>} mapa
 * @param {number} [limite]
 */
export function podarMapaAbas(mapa, limite = LIMITE_PROJETOS) {
  const entradas = Object.entries(mapa || {})
  if (entradas.length <= limite) return mapa || {}
  const ordenadas = entradas.sort((a, b) => (Number(b[1]?.em) || 0) - (Number(a[1]?.em) || 0))
  return Object.fromEntries(ordenadas.slice(0, limite))
}

/**
 * Remove entradas cujo projeto não existe mais. Entradas sem `raiz` (legado)
 * são preservadas para não perder histórico por engano.
 * @param {ReturnType<typeof normalizarMapaAbas>} mapa
 * @param {(raiz: string) => Promise<boolean>} existe
 */
export async function podarProjetosInexistentes(mapa, existe) {
  const out = { ...mapa }
  for (const [chave, valor] of Object.entries(mapa || {})) {
    if (chave === CHAVE_SEM_PROJETO || !valor?.raiz) continue
    try {
      if (!(await existe(valor.raiz))) delete out[chave]
    } catch {
      /* falha ao checar: mantém a entrada */
    }
  }
  return out
}
