/**
 * Tema claro/escuro do DG Editor (body + CodeMirror).
 */

/**
 * @param {string} tema
 * @param {{ aplicarTema?: () => void } | null | undefined} editor
 */
export function aplicarTema(tema, editor) {
  const t = tema === 'claro' ? 'claro' : 'escuro'
  document.body.classList.toggle('tema-escuro', t === 'escuro')
  document.body.classList.toggle('tema-claro', t === 'claro')
  if (t === 'escuro') document.body.classList.remove('tema-claro')
  else document.body.classList.remove('tema-escuro')
  try {
    localStorage.setItem('dg-tema', t)
  } catch {
    /* */
  }
  try {
    editor?.aplicarTema?.()
  } catch {
    /* */
  }
  return t
}

/**
 * @param {{ aplicarTema?: () => void } | null | undefined} editor
 */
export async function alternarTema(editor) {
  const atual = document.body.classList.contains('tema-escuro') ? 'escuro' : 'claro'
  const novo = atual === 'claro' ? 'escuro' : 'claro'
  try {
    await window.api.invoke('tema:set', novo)
  } catch (e) {
    console.warn('[tema] set:', e)
  }
  return aplicarTema(novo, editor)
}

/**
 * @param {{ aplicarTema?: () => void } | null | undefined} editor
 */
export async function carregarTema(editor) {
  try {
    const r = await window.api.invoke('tema:get')
    const bruto = r && typeof r === 'object' ? r.tema || r.value || r.data : r
    let tema = bruto === 'claro' ? 'claro' : 'escuro'
    try {
      const local = localStorage.getItem('dg-tema')
      if (local === 'claro' || local === 'escuro') {
        if (local !== tema) localStorage.setItem('dg-tema', tema)
      }
    } catch {
      /* */
    }
    aplicarTema(tema, editor)
    return tema
  } catch {
    const fallback = localStorage.getItem('dg-tema') === 'claro' ? 'claro' : 'escuro'
    aplicarTema(fallback, editor)
    return fallback
  }
}
