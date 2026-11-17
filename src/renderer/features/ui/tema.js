/**
 * Tema claro/escuro do DG Editor (body + CodeMirror).
 */
import { state } from '../../state/app-state.js'
import { pastasPermitidas } from '../arquivos/index.js'

const STYLE_TEMAS_CUSTOM = 'dg-temas-custom'

/** Carrega .dg-editor/temas.json do workspace e injeta variáveis CSS. */
export async function carregarTemasCustom() {
  const raiz = state.pastaAtual || state.pastasRecentes?.[0] || ''
  const el = document.getElementById(STYLE_TEMAS_CUSTOM)
  if (!raiz) {
    el?.remove()
    return
  }
  try {
    const r = await window.api.invoke('arquivo:ler', raiz + '/.dg-editor/temas.json', pastasPermitidas())
    const bruto = r?.conteudo
    if (typeof bruto !== 'string' || !bruto.trim()) {
      el?.remove()
      return
    }
    const cfg = JSON.parse(bruto)
    const vars = cfg?.vars || cfg?.variaveis || cfg
    if (!vars || typeof vars !== 'object' || Array.isArray(vars)) {
      el?.remove()
      return
    }
    const decl = Object.entries(vars)
      .filter(([k, v]) => /^--[a-zA-Z0-9-]+$/.test(k) && typeof v === 'string')
      .map(([k, v]) => k + ': ' + String(v).replace(/[;{}]/g, ''))
      .join('; ')
    if (!decl) {
      el?.remove()
      return
    }
    let style = document.getElementById(STYLE_TEMAS_CUSTOM)
    if (!style) {
      style = document.createElement('style')
      style.id = STYLE_TEMAS_CUSTOM
      document.head.appendChild(style)
    }
    style.textContent = ':root{' + decl + '}'
  } catch {
    el?.remove()
  }
}

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
    void carregarTemasCustom()
    return tema
  } catch {
    const fallback = localStorage.getItem('dg-tema') === 'claro' ? 'claro' : 'escuro'
    aplicarTema(fallback, editor)
    void carregarTemasCustom()
    return fallback
  }
}
