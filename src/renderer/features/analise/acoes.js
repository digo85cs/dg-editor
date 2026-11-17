// acoes.js — ações da aba Análise: escopo, execução, render e "Onde está".
// Extraído de app.js. Callbacks do app.js via configurarAnalise().
import { state } from '../../state/app-state.js'
import { mostrarToast } from '../ui/toast.js'
import { dgNormalizarErro, mostrarErroTipado } from '../ui/erros.js'
import { renderizarAnaliseHtml } from './render.js'
import {
  renderizarWhereisMatchesHtml,
  renderizarWhereisErroHtml
} from './whereis.js'

const $ = (id) => document.getElementById(id)

let deps = {}

/** Registra callbacks do app.js. Chamar uma vez no boot. */
export function configurarAnalise(d) {
  deps = d || {}
}

export function habilitarBotoesAnalise(habilitar) {
  const rapida = $('btn-analise-rapida')
  const completa = $('btn-analise-completa')
  const disabled = !habilitar
  if (rapida) rapida.disabled = disabled
  if (completa) completa.disabled = disabled
  const whereisQ = $('whereis-query')
  const whereisBtn = $('btn-whereis')
  if (whereisQ) whereisQ.disabled = disabled
  if (whereisBtn) whereisBtn.disabled = disabled
}

async function solicitarDialogoEscopoAnalise(modo) {
  const resposta = await window.api.invoke('analysis:choose-scope', modo)
  if (resposta?.ok !== true || !Number.isInteger(resposta.response)) {
    throw new Error(resposta?.erro || 'Não foi possível abrir a escolha de escopo.')
  }
  return resposta.response
}

export async function analisarCompleta(root, force = false) {
  try {
    const resposta = await solicitarDialogoEscopoAnalise('confirm-complete')
    if (resposta === 0) await rodarAnalise(root, 'completa', force)
  } catch (err) {
    mostrarToast('Não foi possível confirmar a análise completa: ' + String(err), 'erro')
  }
}

export async function escolherEscopoAnalise(root, force = false) {
  try {
    const resposta = await solicitarDialogoEscopoAnalise('choose-scope')
    if (resposta === 0) await rodarAnalise(root, 'rapida', force)
    else if (resposta === 1) await analisarCompleta(root, force)
  } catch (err) {
    mostrarToast('Não foi possível escolher o escopo da análise: ' + String(err), 'erro')
  }
}

export async function rodarAnalise(root, escopo = 'rapida', force = false) {
  $('analysis-progress').classList.remove('hidden')
  $('progress-text').textContent = force ? 'Analisando novamente...' : (escopo === 'completa' ? 'Analisando projeto inteiro...' : 'Analisando arquivos-chave...')
  $('analysis-content').innerHTML =
    '<p class="muted">' + (escopo === 'completa' ? 'Lendo o projeto inteiro' : 'Lendo os arquivos-chave') + ' e perguntando à IA...</p>'
  deps.ativarAbaDireita?.('analise')
  try {
    const r = await window.api.analysisRun(root, force, escopo)
    if (!r || r.ok === false) {
      mostrarErroTipado(r || { codigo: 'ERR_UNKNOWN', mensagem: 'Falha na análise.' })
      return
    }
    const payload = (r.result && typeof r.result === 'object') ? r.result : r
    const report = payload && payload.report && typeof payload.report === 'object'
      ? payload.report
      : (payload && typeof payload === 'object' ? payload : null)
    if (!report || typeof report !== 'object') {
      mostrarErroTipado({ codigo: 'ERR_ANALYSIS_EMPTY', mensagem: 'A análise não retornou dados suficientes para exibir.', acao: 'Tente novamente com análise rápida.' })
      return
    }
    renderizarAnalise(report, !!payload.fromCache)
    $('analysis-content').dataset.escopo = escopo
    $('analysis-content').dataset.jaAnalisou = '1'
  } catch (err) {
    mostrarErroTipado(err)
  } finally {
    $('analysis-progress').classList.add('hidden')
  }
}

export function renderizarAnalise(report, fromCache) {
  $('analysis-content').innerHTML = renderizarAnaliseHtml(report, fromCache)
}

// ---------- Onde está (whereis) ----------
export async function buscarOndeEsta() {
  if (!state.pastaAtual) { mostrarToast('Abra uma pasta para buscar.', 'aviso'); return }
  const input = $('whereis-query')
  const q = (input?.value || '').trim()
  if (q.length < 2) { mostrarToast('Digite ao menos 2 caracteres.', 'aviso'); input?.focus(); return }
  const alvo = $('whereis-result')
  if (alvo) alvo.innerHTML = '<p class="muted">Buscando…</p>'
  try {
    const r = await window.api.invoke('whereis:ask', state.pastaAtual, q)
    if (!r || r.ok === false) {
      if (alvo) alvo.innerHTML = renderizarWhereisErroHtml(dgNormalizarErro(r, 'Falha na busca.'))
      return
    }
    const result = r.result || {}
    if (!alvo) return
    alvo.innerHTML = renderizarWhereisMatchesHtml(result, q)
    alvo.querySelectorAll('.whereis-hit-file').forEach((btn) => {
      btn.addEventListener('click', () => {
        const file = btn.getAttribute('data-file')
        if (file) void deps.abrirArquivo?.(file)
      })
    })
  } catch (err) {
    if (alvo) alvo.innerHTML = renderizarWhereisErroHtml(dgNormalizarErro(err, 'Busca falhou.'))
  }
}
