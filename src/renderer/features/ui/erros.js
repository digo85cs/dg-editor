// erros.js — erros tipados (codigo/mensagem) + render no alvo.
// Extraído de app.js (bloco "Erros tipados").
import { mostrarToast } from './toast.js'
import { renderizarErroHtml } from '../analise/render.js'

const $ = (id) => document.getElementById(id)

export const DG_CODIGOS_OLLAMA = new Set(['ERR_OLLAMA_OFFLINE', 'ERR_OLLAMA_MODEL_MISSING', 'ERR_LLM_TIMEOUT'])

export function dgIsErroApp(v) {
  return !!v && typeof v === 'object' && typeof v.codigo === 'string' && typeof v.mensagem === 'string' && v.mensagem.trim().length > 0 && /^ERR_[A-Z0-9_]+$/.test(v.codigo)
}

export function dgNormalizarErro(e, fallbackMsg) {
  if (dgIsErroApp(e)) return e
  if (e && typeof e === 'object' && dgIsErroApp(e.erro)) return e.erro
  if (typeof e === 'string' && e.trim()) return { codigo: 'ERR_UNKNOWN', mensagem: e.trim() }
  if (e && typeof e.erro === 'string' && e.erro.trim()) return { codigo: 'ERR_UNKNOWN', mensagem: e.erro.trim() }
  return { codigo: 'ERR_UNKNOWN', mensagem: String(fallbackMsg || 'Ocorreu um erro.'), detalhe: String(e && e.message ? e.message : e || '') }
}

export function mostrarErroTipado(erro, alvoId) {
  const e = dgNormalizarErro(erro)
  const alvo = $(alvoId || 'analysis-content')
  if (!alvo) { mostrarToast(e.mensagem, 'erro'); return }
  alvo.innerHTML = renderizarErroHtml(e)
}
