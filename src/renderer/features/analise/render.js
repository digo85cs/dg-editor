import { escapar } from '../../utils/dom.js'
import { isErroApp } from '@shared/erros'

export function secao(titulo, texto) {
  return (
    '<div class="analysis-section"><h4>' + escapar(titulo) + '</h4><p>' + escapar(texto) + '</p></div>'
  )
}

export function secaoLista(titulo, itens) {
  if (!itens || itens.length === 0) return secao(titulo, '—')
  return (
    '<div class="analysis-section"><h4>' +
    escapar(titulo) +
    '</h4><ul>' +
    itens.map((i) => '<li>' + escapar(i) + '</li>').join('') +
    '</ul></div>'
  )
}

/** @param {any} report @param {boolean} [fromCache] */
export function renderizarAnaliseHtml(report, fromCache) {
  if (!report || typeof report !== 'object') {
    return '<p class="muted">Análise indisponível (dados ausentes).</p>'
  }
  const badge = fromCache ? ' <span class="muted">(do cache)</span>' : ''
  let html = ''
  html += secao('O que é', report.oQueE || '—')
  html += secao('Stack', report.stack || '—')
  html += secao('Estrutura', report.estrutura || '—')
  html += secaoLista('Pontos de atenção', Array.isArray(report.pontosAtencao) ? report.pontosAtencao : [])
  html += secaoLista('Sugestões', Array.isArray(report.sugestoes) ? report.sugestoes : [])
  if (report.provider) {
    html +=
      '<p class="muted">Analisado por: ' +
      escapar(report.provider) +
      (report.model ? ' (' + escapar(report.model) + ')' : '') +
      (report.analyzedAt ? ' — ' + escapar(new Date(report.analyzedAt).toLocaleString('pt-BR')) : '') +
      badge +
      '</p>'
  }
  return html
}

/** @param {any} erro */
export function renderizarErroHtml(erro) {
  const e = isErroApp(erro)
    ? erro
    : erro && typeof erro === 'object' && isErroApp(erro.erro)
      ? erro.erro
      : typeof erro === 'string' && erro.trim()
        ? { codigo: 'ERR_UNKNOWN', mensagem: erro.trim() }
        : erro && typeof erro.erro === 'string' && erro.erro.trim()
          ? { codigo: 'ERR_UNKNOWN', mensagem: erro.erro.trim() }
          : { codigo: 'ERR_UNKNOWN', mensagem: String(erro?.mensagem || erro?.message || 'Ocorreu um erro.') }
  const acao = e.acao ? '<p class="muted"><strong>Ação:</strong> ' + escapar(e.acao) + '</p>' : ''
  return '<p class="muted"><strong>[' + escapar(e.codigo) + ']</strong> ' + escapar(e.mensagem) + '</p>' + acao
}
