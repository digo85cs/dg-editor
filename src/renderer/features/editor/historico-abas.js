// historico-abas.js — histórico de navegação entre abas (voltar/avançar).
// Extraído de app.js. abrirArquivoNaAba é injetado via configurarHistoricoAbas()
// pois vive no app.js (depende de editor/abas).
import { state } from '../../state/app-state.js'

let histAbas = []
let histIdx = -1

let abrirArquivo = null

/** Registra a ação de abrir arquivo. Chamar uma vez no boot. */
export function configurarHistoricoAbas(deps) {
  if (deps && typeof deps.abrirArquivo === 'function') abrirArquivo = deps.abrirArquivo
}

export function limparHistoricoAbas() {
  histAbas = []
  histIdx = -1
  atualizarBotoesHist()
}

export function atualizarBotoesHist() {
  const v = document.getElementById('tb-voltar')
  const a = document.getElementById('tb-avancar')
  const canBack = histIdx > 0
  const canFwd = histIdx >= 0 && histIdx < histAbas.length - 1
  if (v) {
    v.disabled = !canBack
    v.setAttribute('aria-disabled', canBack ? 'false' : 'true')
  }
  if (a) {
    a.disabled = !canFwd
    a.setAttribute('aria-disabled', canFwd ? 'false' : 'true')
  }
}

/** Empurra no histórico só se o caminho for diferente da posição atual (evita loop com irHistAbas). */
export function registrarHistAba(caminho) {
  if (!caminho) return
  if (histAbas[histIdx] === caminho) {
    atualizarBotoesHist()
    return
  }
  histAbas = histAbas.slice(0, histIdx + 1)
  histAbas.push(caminho)
  histIdx = histAbas.length - 1
  if (histAbas.length > 100) {
    histAbas.shift()
    histIdx--
  }
  atualizarBotoesHist()
}

export async function irHistAbas(delta) {
  const novo = histIdx + delta
  if (novo < 0 || novo >= histAbas.length) return
  const alvo = histAbas[novo]
  histIdx = novo
  try {
    await abrirArquivo?.(alvo)
    // arquivo apagado / falha de IPC: não ficou em state.abas
    if (!state.abas.some((a) => a.caminho === alvo)) {
      histAbas.splice(novo, 1)
      histIdx = Math.min(novo, histAbas.length - 1)
      if (histAbas.length === 0) histIdx = -1
    }
  } catch (e) {
    console.warn('[hist-state.abas]', e)
    histAbas.splice(novo, 1)
    histIdx = Math.min(novo, histAbas.length - 1)
    if (histAbas.length === 0) histIdx = -1
  }
  atualizarBotoesHist()
}
